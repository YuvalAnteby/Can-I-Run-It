import { createHash } from 'node:crypto';

import {
    EXPORT_CONTROL_LEASE_BLOB,
    EXPORT_SCHEDULE_BLOB,
    type CreditPeriod,
    type CreditReader,
    type CreditSnapshot,
    type ExportCheckOptions,
    type ExportScheduleState,
    type JobClient,
    type JobExecution,
    type JobStartResult,
    addUtcCalendarMonths,
    crossedCreditThresholds,
    isExportDue,
    nextExportDueAt,
    runExportCheck,
    validateCreditSnapshot,
} from './export-check';
import type { BlobControlState, BlobLease } from './azure';
import type {
    ExportBlobInfo,
    ExportBlobStore,
    ExportManifest,
    RenewableExportLease,
} from './export';

type ErrorWithStatus = Error & { statusCode: number };

const NOW = new Date('2026-02-28T12:00:00.000Z');
const FIREWALL_JOB =
    '/subscriptions/test/resourceGroups/ciri/providers/Microsoft.App/jobs/firewall';
const EXPORT_JOB =
    '/subscriptions/test/resourceGroups/ciri/providers/Microsoft.App/jobs/export';
const PERIOD: CreditPeriod = {
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-02-01T00:00:00.000Z',
    currency: 'USD',
};
const IMAGE_DIGEST = `ciri-tools@sha256:${'a'.repeat(64)}`;

function statusError(statusCode: number, message: string): ErrorWithStatus {
    return Object.assign(new Error(message), { statusCode });
}

function copy<T>(value: T): T {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}

class MemoryControl implements BlobControlState {
    state?: ExportScheduleState;
    readonly saves: ExportScheduleState[] = [];
    readonly leaseRequests: Array<{
        blobName: string;
        durationSeconds?: number;
    }> = [];
    saveCount = 0;
    failAcquire?: Error;
    failSaveOn?: number;

    constructor(state?: ExportScheduleState) {
        this.state = copy(state);
    }

    async acquireLease(
        blobName: string,
        durationSeconds?: number,
        _signal?: AbortSignal,
        _initialValue?: unknown,
    ): Promise<BlobLease> {
        this.leaseRequests.push({ blobName, durationSeconds });
        if (this.failAcquire) throw this.failAcquire;
        return { leaseId: 'control-lease', release: async () => undefined };
    }

    async loadJson<T>(
        _blobName: string,
        _leaseId?: string,
        _signal?: AbortSignal,
    ): Promise<T | undefined> {
        return copy(this.state) as T | undefined;
    }

    async saveJson<T>(
        _blobName: string,
        value: T,
        _leaseId?: string,
        _signal?: AbortSignal,
    ): Promise<void> {
        this.saveCount += 1;
        if (this.failSaveOn === this.saveCount) {
            throw statusError(
                412,
                `control ETag conflict on save ${this.saveCount}`,
            );
        }
        this.state = copy(value) as ExportScheduleState;
        this.saves.push(copy(value) as ExportScheduleState);
    }
}

class MemoryExportStore implements ExportBlobStore {
    readonly blobs = new Map<string, Buffer>();

    async acquireLease(): Promise<RenewableExportLease> {
        return {
            leaseId: 'export-lease',
            renew: async () => undefined,
            release: async () => undefined,
        };
    }

    async upload(blobName: string, value: Buffer): Promise<void> {
        this.blobs.set(blobName, Buffer.from(value));
    }

    async download(blobName: string): Promise<Buffer> {
        const value = this.blobs.get(blobName);
        if (!value) throw statusError(404, `${blobName} is missing`);
        return Buffer.from(value);
    }

    async list(prefix: string): Promise<ExportBlobInfo[]> {
        return [...this.blobs.keys()]
            .filter((name) => name.startsWith(prefix))
            .map((name) => ({ name }));
    }

    async delete(blobName: string): Promise<void> {
        this.blobs.delete(blobName);
    }

    putManifest(
        marker: string,
        completedAt = NOW.toISOString(),
    ): ExportManifest {
        const prefix = `exports/1772323200000-${marker}`;
        const dump = Buffer.from(`dump-${marker}`);
        const dumpBlob = `${prefix}/database.dump`;
        const contentsBlob = `${prefix}/contents.txt`;
        const hashBlob = `${prefix}/sha256.txt`;
        const manifest: ExportManifest = {
            completed_at: completedAt,
            postgres_version: '16.4',
            migration_version: '1700000000000',
            image_digest: IMAGE_DIGEST,
            size_bytes: dump.length,
            sha256: createHash('sha256').update(dump).digest('hex'),
            dump_blob: dumpBlob,
            contents_blob: contentsBlob,
            hash_blob: hashBlob,
            request_marker: marker,
        };
        this.blobs.set(
            `${prefix}/manifest.json`,
            Buffer.from(JSON.stringify(manifest)),
        );
        this.blobs.set(dumpBlob, dump);
        this.blobs.set(contentsBlob, Buffer.from('; contents'));
        this.blobs.set(hashBlob, Buffer.from(`${manifest.sha256}\n`));
        return manifest;
    }
}

function execution(marker: string, status: string, id: string): JobExecution {
    return {
        id,
        name: id,
        status,
        properties: {
            template: {
                containers: [
                    {
                        env: [
                            {
                                name: 'CIRI_EXPORT_REQUEST_MARKER',
                                value: marker,
                            },
                        ],
                    },
                ],
            },
        },
    };
}

class MemoryJobs implements JobClient {
    readonly starts: Array<{ resourceId: string; override: unknown }> = [];
    readonly responses = new Map<string, JobStartResult[]>();
    readonly executions = new Map<string, JobExecution[]>();

    async start(
        jobResourceId: string,
        executionOverride: unknown,
        _signal?: AbortSignal,
    ): Promise<JobStartResult> {
        this.starts.push({
            resourceId: jobResourceId,
            override: executionOverride,
        });
        const response = this.responses.get(jobResourceId)?.shift();
        return response ?? { statusCode: 202 };
    }

    async get(
        jobResourceId: string,
        executionId: string,
        _signal?: AbortSignal,
    ): Promise<JobExecution> {
        const found = this.executions
            .get(jobResourceId)
            ?.find(
                (item) => item.id === executionId || item.name === executionId,
            );
        if (!found)
            throw statusError(404, `execution ${executionId} is missing`);
        return found;
    }

    async list(
        jobResourceId: string,
        _signal?: AbortSignal,
    ): Promise<JobExecution[]> {
        return [...(this.executions.get(jobResourceId) ?? [])];
    }
}

function baseOptions(
    control: MemoryControl,
    exports: MemoryExportStore,
    jobs: MemoryJobs,
    overrides: Partial<ExportCheckOptions> = {},
): ExportCheckOptions {
    return {
        control,
        exports,
        jobs,
        firewallJobResourceId: FIREWALL_JOB,
        exportJobResourceId: EXPORT_JOB,
        now: () => NOW,
        wait: async () => undefined,
        operationBudgetMs: 1_000,
        firewallWaitBudgetMs: 0,
        marker: () => 'marker-1',
        ...overrides,
    };
}

function startQueue(
    jobs: MemoryJobs,
    marker: string,
    firewallStatus = 'succeeded',
): void {
    const firewallExecution = execution(marker, firewallStatus, 'firewall-1');
    jobs.responses.set(FIREWALL_JOB, [
        {
            statusCode: 202,
            location: 'firewall-location',
            execution: firewallExecution,
        },
    ]);
    jobs.executions.set(FIREWALL_JOB, [firewallExecution]);
    jobs.responses.set(EXPORT_JOB, [
        { statusCode: 202, location: 'export-location' },
    ]);
}

describe('portable export due checker', () => {
    it.each([
        ['2023-10-31T23:59:59.000Z', '2024-02-29T23:59:59.000Z'],
        ['2024-02-29T23:59:59.000Z', '2024-06-29T23:59:59.000Z'],
        ['2024-08-31T23:59:59.000Z', '2024-12-31T23:59:59.000Z'],
        ['2024-12-31T23:59:59.000Z', '2025-04-30T23:59:59.000Z'],
    ])('clamps UTC calendar month %s to %s', (input, expected) => {
        expect(nextExportDueAt(input)).toBe(expected);
    });

    it('keeps calendar arithmetic in UTC and rejects non-integer month offsets', () => {
        expect(
            addUtcCalendarMonths('2024-01-31T23:00:00.000Z', 1).toISOString(),
        ).toBe('2024-02-29T23:00:00.000Z');
        expect(() =>
            addUtcCalendarMonths('2024-01-01T00:00:00.000Z', 1.5),
        ).toThrow(/months must be an integer/);
    });

    it('marks an initial or manual run due and leaves a future scheduled run idle', () => {
        expect(isExportDue({ fired_thresholds: [] }, NOW)).toBe(true);
        expect(
            isExportDue(
                {
                    last_success_at: '2026-01-01T00:00:00.000Z',
                    next_due_at: '2026-06-01T00:00:00.000Z',
                },
                NOW,
            ),
        ).toBe(false);
        expect(
            isExportDue(
                {
                    last_success_at: '2026-01-01T00:00:00.000Z',
                    next_due_at: '2026-06-01T00:00:00.000Z',
                },
                NOW,
                true,
            ),
        ).toBe(true);
    });

    it('crosses both 80 and 90 thresholds together and does not refire one already recorded', () => {
        const previous: CreditSnapshot = {
            ...PERIOD,
            periodStart: PERIOD.start,
            periodEnd: PERIOD.end,
            consumed: 79,
        };
        const current: CreditSnapshot = { ...previous, consumed: 95 };

        expect(crossedCreditThresholds(previous, current)).toEqual([80, 90]);
        expect(crossedCreditThresholds(previous, current, [80])).toEqual([90]);
    });

    it('rejects a credit snapshot with the wrong period or currency', () => {
        expect(() =>
            validateCreditSnapshot(
                {
                    periodStart: PERIOD.start,
                    periodEnd: PERIOD.end,
                    currency: 'EUR',
                    consumed: 95,
                },
                PERIOD,
            ),
        ).toThrow(/period or currency/);
    });

    it('reports threshold automation unavailable while preserving the manual/date path', async () => {
        const state: ExportScheduleState = {
            version: 1,
            last_success_at: '2026-01-01T00:00:00.000Z',
            next_due_at: '2027-01-01T00:00:00.000Z',
            fired_thresholds: [],
        };
        const control = new MemoryControl(state);
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        const costs: CreditReader = {
            read: async () => {
                throw new Error('Cost Management unavailable');
            },
        };

        const unavailable = await runExportCheck(
            baseOptions(control, exports, jobs, {
                costs,
                creditPeriod: PERIOD,
            }),
        );

        expect(unavailable.status).toBe('threshold_unavailable');
        expect(unavailable.thresholdAutomationUnavailable).toBe(true);
        expect(jobs.starts).toHaveLength(0);

        startQueue(jobs, 'marker-1');
        const manual = await runExportCheck(
            baseOptions(control, exports, jobs, {
                costs,
                creditPeriod: PERIOD,
                manualDue: true,
            }),
        );
        expect(manual.status).toBe('export_started');
        expect(jobs.starts.map((start) => start.resourceId)).toEqual([
            FIREWALL_JOB,
            EXPORT_JOB,
        ]);
    });

    it('records simultaneous threshold crossings in durable pending state', async () => {
        const control = new MemoryControl({
            version: 1,
            last_success_at: '2026-01-01T00:00:00.000Z',
            next_due_at: '2027-01-01T00:00:00.000Z',
            fired_thresholds: [],
            credit_period_start: PERIOD.start,
            credit_period_end: PERIOD.end,
            currency: PERIOD.currency,
            last_verified_cost_snapshot: {
                periodStart: PERIOD.start,
                periodEnd: PERIOD.end,
                currency: PERIOD.currency,
                consumed: 79,
            },
        });
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        startQueue(jobs, 'marker-1');
        const costs: CreditReader = {
            read: async () => ({
                periodStart: PERIOD.start,
                periodEnd: PERIOD.end,
                currency: PERIOD.currency,
                consumed: 95,
            }),
        };

        const result = await runExportCheck(
            baseOptions(control, exports, jobs, {
                costs,
                creditPeriod: PERIOD,
            }),
        );

        expect(result.status).toBe('export_started');
        expect(result.schedule.pending?.triggered_thresholds).toEqual([80, 90]);
    });

    it('does not start export when firewall confirmation times out', async () => {
        const control = new MemoryControl();
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        const firewallExecution = execution(
            'marker-1',
            'running',
            'firewall-1',
        );
        jobs.responses.set(FIREWALL_JOB, [
            { statusCode: 202, location: 'firewall-location' },
        ]);
        jobs.executions.set(FIREWALL_JOB, [firewallExecution]);

        const result = await runExportCheck(
            baseOptions(control, exports, jobs, { firewallWaitBudgetMs: 0 }),
        );

        expect(result.status).toBe('firewall_pending');
        expect(jobs.starts.map((start) => start.resourceId)).toEqual([
            FIREWALL_JOB,
        ]);
        expect(result.schedule.pending?.phase).toBe('firewall');
    });

    it('keeps an accepted 202 export pending and does not duplicate it on the next run', async () => {
        const control = new MemoryControl();
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        startQueue(jobs, 'marker-1');

        const first = await runExportCheck(baseOptions(control, exports, jobs));
        expect(first.status).toBe('export_started');
        expect(first.schedule.pending).toMatchObject({
            marker: 'marker-1',
            phase: 'export',
            accepted_location: 'export-location',
        });

        jobs.executions.set(EXPORT_JOB, [
            execution('marker-1', 'running', 'export-1'),
        ]);
        const second = await runExportCheck(
            baseOptions(control, exports, jobs),
        );
        expect(second.status).toBe('export_pending');
        expect(jobs.starts).toHaveLength(2);
    });

    it('recovers an accepted start after the response identity was lost without starting a duplicate', async () => {
        const control = new MemoryControl();
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        startQueue(jobs, 'marker-1');
        control.failSaveOn = 4;

        await expect(
            runExportCheck(baseOptions(control, exports, jobs)),
        ).rejects.toMatchObject({
            statusCode: 412,
        });
        expect(control.state?.pending).toMatchObject({
            marker: 'marker-1',
            phase: 'export',
        });
        expect(control.state?.pending?.export_execution_id).toBeUndefined();

        control.failSaveOn = undefined;
        jobs.executions.set(EXPORT_JOB, [
            execution('marker-1', 'succeeded', 'export-1'),
        ]);
        const manifest = exports.putManifest('marker-1');
        const recovered = await runExportCheck(
            baseOptions(control, exports, jobs),
        );

        expect(recovered.status).toBe('completed');
        expect(recovered.manifest).toEqual(manifest);
        expect(
            jobs.starts.filter((start) => start.resourceId === EXPORT_JOB),
        ).toHaveLength(1);
        expect(control.state?.pending).toBeUndefined();
    });

    it('clears a known terminal export failure so a manual retry can start fresh work', async () => {
        const control = new MemoryControl({
            version: 1,
            fired_thresholds: [],
            pending: {
                marker: 'failed-request',
                requested_at: NOW.toISOString(),
                phase: 'export',
                export_execution_id: 'export-failed',
            },
        });
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        jobs.executions.set(EXPORT_JOB, [
            execution('failed-request', 'failed', 'export-failed'),
        ]);

        const first = await runExportCheck(
            baseOptions(control, exports, jobs, {
                manualDue: true,
                marker: () => 'retry-request',
            }),
        );

        expect(first.status).toBe('export_failed');
        expect(first.schedule.pending).toBeUndefined();
        expect(first.schedule.next_due_at).toBe(NOW.toISOString());
        expect(jobs.starts).toHaveLength(0);

        startQueue(jobs, 'retry-request');
        const second = await runExportCheck(
            baseOptions(control, exports, jobs, {
                manualDue: true,
                marker: () => 'retry-request',
            }),
        );

        expect(second.status).toBe('export_started');
        expect(second.schedule.pending?.marker).toBe('retry-request');
        expect(jobs.starts.map(({ resourceId }) => resourceId)).toEqual([
            FIREWALL_JOB,
            EXPORT_JOB,
        ]);
    });

    it('clears a definitive export start rejection so a manual retry can start again', async () => {
        const control = new MemoryControl();
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        jobs.responses.set(FIREWALL_JOB, [
            { statusCode: 202, location: 'firewall-location' },
        ]);
        jobs.executions.set(FIREWALL_JOB, [
            execution('first-request', 'succeeded', 'firewall-1'),
        ]);
        jobs.responses.set(EXPORT_JOB, [
            { statusCode: 503, location: 'export-location' },
        ]);

        const first = await runExportCheck(
            baseOptions(control, exports, jobs, {
                manualDue: true,
                marker: () => 'first-request',
            }),
        );

        expect(first.status).toBe('export_failed');
        expect(first.reason).toMatch(/503/);
        expect(first.schedule.pending).toBeUndefined();
        expect(first.schedule.last_failure_at).toBe(NOW.toISOString());
        expect(jobs.starts.map(({ resourceId }) => resourceId)).toEqual([
            FIREWALL_JOB,
            EXPORT_JOB,
        ]);

        startQueue(jobs, 'retry-request');
        const second = await runExportCheck(
            baseOptions(control, exports, jobs, {
                manualDue: true,
                marker: () => 'retry-request',
            }),
        );

        expect(second.status).toBe('export_started');
        expect(second.schedule.pending?.marker).toBe('retry-request');
        expect(jobs.starts).toHaveLength(4);
    });

    it('fails closed when more than one execution matches the pending request marker', async () => {
        const control = new MemoryControl({
            version: 1,
            fired_thresholds: [],
            pending: {
                marker: 'marker-1',
                requested_at: NOW.toISOString(),
                phase: 'export',
            },
        });
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        jobs.executions.set(EXPORT_JOB, [
            execution('marker-1', 'running', 'export-1'),
            execution('marker-1', 'running', 'export-2'),
        ]);

        await expect(
            runExportCheck(baseOptions(control, exports, jobs)),
        ).rejects.toThrow(/Multiple Job executions match/);
        expect(control.state?.pending?.marker).toBe('marker-1');
        expect(jobs.starts).toHaveLength(0);
    });

    it('does not consume due state after firewall failure', async () => {
        const control = new MemoryControl();
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        startQueue(jobs, 'marker-1', 'failed');

        const result = await runExportCheck(
            baseOptions(control, exports, jobs),
        );

        expect(result.status).toBe('firewall_failed');
        expect(result.schedule.pending).toBeUndefined();
        expect(result.schedule.next_due_at).toBe(NOW.toISOString());
        expect(result.schedule.last_success_at).toBeUndefined();
        expect(jobs.starts).toHaveLength(1);
    });

    it('keeps a failed export pending until a later run can recover it', async () => {
        const control = new MemoryControl({
            version: 1,
            fired_thresholds: [],
            pending: {
                marker: 'marker-1',
                requested_at: NOW.toISOString(),
                phase: 'export',
            },
        });
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        jobs.executions.set(EXPORT_JOB, [
            execution('marker-1', 'failed', 'export-1'),
        ]);

        const result = await runExportCheck(
            baseOptions(control, exports, jobs),
        );

        expect(result.status).toBe('export_failed');
        expect(result.schedule.pending).toBeUndefined();
        expect(result.schedule.next_due_at).toBe(NOW.toISOString());
        expect(result.schedule.last_success_at).toBeUndefined();
    });

    it('publishes schedule success only after a correlated verified manifest exists', async () => {
        const control = new MemoryControl({
            version: 1,
            fired_thresholds: [80],
            pending: {
                marker: 'marker-1',
                requested_at: NOW.toISOString(),
                phase: 'export',
                triggered_thresholds: [90],
            },
        });
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        jobs.executions.set(EXPORT_JOB, [
            execution('marker-1', 'succeeded', 'export-1'),
        ]);

        const waiting = await runExportCheck(
            baseOptions(control, exports, jobs),
        );
        expect(waiting.status).toBe('export_pending');
        expect(waiting.schedule.pending?.marker).toBe('marker-1');

        const manifest = exports.putManifest('marker-1');
        const completed = await runExportCheck(
            baseOptions(control, exports, jobs),
        );

        expect(completed.status).toBe('completed');
        expect(completed.manifest).toEqual(manifest);
        expect(completed.schedule.pending).toBeUndefined();
        expect(completed.schedule.fired_thresholds).toEqual([80, 90]);
        expect(completed.schedule.next_due_at).toBe(
            nextExportDueAt(manifest.completed_at),
        );
    });

    it('stops before any Job when the control lease has an ETag conflict', async () => {
        const control = new MemoryControl();
        control.failAcquire = statusError(409, 'control lease conflict');
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();

        await expect(
            runExportCheck(baseOptions(control, exports, jobs)),
        ).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(jobs.starts).toHaveLength(0);
        expect(control.leaseRequests).toEqual([
            { blobName: EXPORT_CONTROL_LEASE_BLOB, durationSeconds: 60 },
        ]);
    });

    it('resets threshold state when the credit period changes', async () => {
        const nextPeriod: CreditPeriod = {
            start: '2026-02-01T00:00:00.000Z',
            end: '2026-03-01T00:00:00.000Z',
            currency: 'USD',
        };
        const control = new MemoryControl({
            version: 1,
            last_success_at: '2026-01-01T00:00:00.000Z',
            next_due_at: '2027-01-01T00:00:00.000Z',
            fired_thresholds: [80, 90],
            credit_period_start: PERIOD.start,
            credit_period_end: PERIOD.end,
            currency: PERIOD.currency,
            last_verified_cost_snapshot: {
                periodStart: PERIOD.start,
                periodEnd: PERIOD.end,
                currency: PERIOD.currency,
                consumed: 95,
            },
        });
        const exports = new MemoryExportStore();
        const jobs = new MemoryJobs();
        startQueue(jobs, 'marker-1');
        const costs: CreditReader = {
            read: async () => ({
                periodStart: nextPeriod.start,
                periodEnd: nextPeriod.end,
                currency: nextPeriod.currency,
                consumed: 95,
            }),
        };

        const result = await runExportCheck(
            baseOptions(control, exports, jobs, {
                costs,
                creditPeriod: nextPeriod,
            }),
        );

        expect(result.status).toBe('export_started');
        expect(result.schedule.pending?.triggered_thresholds).toEqual([80, 90]);
    });

    it('requires a UTC instant for credit periods', () => {
        expect(() =>
            validateCreditSnapshot(
                {
                    periodStart: '2026-01-01',
                    periodEnd: PERIOD.end,
                    currency: PERIOD.currency,
                    consumed: 1,
                },
                PERIOD,
            ),
        ).toThrow(/UTC ISO instant/);
    });

    it('does not expose database access through the checker seam', () => {
        const options = baseOptions(
            new MemoryControl(),
            new MemoryExportStore(),
            new MemoryJobs(),
        );
        expect(options).not.toHaveProperty('database');
        expect(options).not.toHaveProperty('runner');
    });
});

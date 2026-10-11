import { Logger } from '@nestjs/common';

import {
    type AzureTokenCredential,
    type BlobControlState,
    createAzureCredential,
    createAzureMaintenanceClientsFromEnv,
} from './azure';
import {
    createExportBlobStoreFromEnv,
    type ExportBlobStore,
    type ExportManifest,
    readExportJson,
    validateExportManifest,
    verifyExportManifestMetadata,
} from './export';

export const EXPORT_SCHEDULE_BLOB = 'exports/schedule.json';
// Azure Blob leases are per-blob, so the schedule is also the control lease.
export const EXPORT_CONTROL_LEASE_BLOB = EXPORT_SCHEDULE_BLOB;
export const EXPORT_CHECK_OPERATION_BUDGET_MS = 55_000;
export const FIREWALL_WAIT_BUDGET_MS = 45_000;
export const EXPORT_CHECK_POLL_INTERVAL_MS = 250;
export const CONTAINER_APP_JOB_API_VERSION = '2026-07-01';
export const COST_MANAGEMENT_API_VERSION = '2023-11-01';
export const CREDIT_THRESHOLD_DOLLARS = [80, 90] as const;

type ExportPhase = 'firewall' | 'export';

export interface CreditPeriod {
    start: string;
    end: string;
    currency: string;
}

export interface CreditSnapshot {
    periodStart: string;
    periodEnd: string;
    currency: string;
    consumed: number;
}

export interface PendingExportRequest {
    marker: string;
    requested_at: string;
    phase: ExportPhase;
    firewall_execution_id?: string;
    firewall_execution_name?: string;
    export_execution_id?: string;
    export_execution_name?: string;
    tools_image_digest?: string;
    triggered_thresholds?: number[];
    accepted_location?: string;
    last_error?: string;
}

export interface ExportScheduleState {
    version: 1;
    last_success_at?: string;
    next_due_at?: string;
    fired_thresholds: number[];
    credit_period_start?: string;
    credit_period_end?: string;
    currency?: string;
    last_verified_cost_snapshot?: CreditSnapshot;
    pending?: PendingExportRequest;
    last_failure_at?: string;
    last_failure_reason?: string;
}

export interface JobExecution {
    id?: string;
    name?: string;
    status?: string;
    properties?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface JobStartResult {
    statusCode: number;
    location?: string;
    execution?: JobExecution;
}

export interface JobClient {
    getJob?(jobResourceId: string, signal?: AbortSignal): Promise<unknown>;
    start(
        jobResourceId: string,
        executionOverride: unknown,
        signal?: AbortSignal,
    ): Promise<JobStartResult>;
    get(
        jobResourceId: string,
        executionId: string,
        signal?: AbortSignal,
    ): Promise<JobExecution>;
    list(jobResourceId: string, signal?: AbortSignal): Promise<JobExecution[]>;
}

export interface CreditReader {
    read(period: CreditPeriod, signal?: AbortSignal): Promise<CreditSnapshot>;
}

export interface ExportCheckOptions {
    control: BlobControlState;
    exports: ExportBlobStore;
    jobs: JobClient;
    costs?: CreditReader;
    firewallJobResourceId: string;
    exportJobResourceId: string;
    creditPeriod?: CreditPeriod;
    manualDue?: boolean;
    now?: () => Date;
    wait?: (milliseconds: number) => Promise<void>;
    operationBudgetMs?: number;
    firewallWaitBudgetMs?: number;
    exportWaitBudgetMs?: number;
    marker?: () => string;
    toolsImageDigest?: string;
}

export type ExportCheckStatus =
    | 'not_due'
    | 'threshold_unavailable'
    | 'firewall_pending'
    | 'firewall_failed'
    | 'export_started'
    | 'export_pending'
    | 'export_failed'
    | 'completed';

export interface ExportCheckResult {
    status: ExportCheckStatus;
    schedule: ExportScheduleState;
    thresholdAutomationUnavailable?: boolean;
    reason?: string;
    manifest?: ExportManifest;
}

interface ExecutionReference {
    executionId?: string;
    executionName?: string;
}

interface FetchOptions {
    credential: AzureTokenCredential;
    fetchImpl: typeof fetch;
    timeoutMs: number;
}

function required(value: string | undefined, name: string): string {
    const normalized = value?.trim();
    if (!normalized) throw new Error(`${name} is required`);
    return normalized;
}

function parseIso(value: string, name: string): Date {
    if (!/Z$/i.test(value)) {
        throw new Error(`${name} must be a UTC ISO instant`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${name} must be a valid UTC ISO instant`);
    }
    return parsed;
}

function statusOf(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as { statusCode?: unknown; status?: unknown };
    if (typeof candidate.statusCode === 'number') return candidate.statusCode;
    return typeof candidate.status === 'number' ? candidate.status : undefined;
}

function isNotFound(error: unknown): boolean {
    return statusOf(error) === 404;
}

function addMonthsClamped(date: Date, months: number): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const targetMonth = month + months;
    const firstOfTarget = new Date(
        Date.UTC(
            year,
            targetMonth,
            1,
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds(),
        ),
    );
    const lastDay = new Date(
        Date.UTC(
            firstOfTarget.getUTCFullYear(),
            firstOfTarget.getUTCMonth() + 1,
            0,
        ),
    ).getUTCDate();
    firstOfTarget.setUTCDate(Math.min(day, lastDay));
    return firstOfTarget;
}

export function addUtcCalendarMonths(
    value: Date | string,
    months: number,
): Date {
    const date =
        value instanceof Date
            ? new Date(value.getTime())
            : parseIso(value, 'date');
    if (Number.isNaN(date.getTime())) {
        throw new Error('date must be a valid UTC ISO instant');
    }
    if (!Number.isSafeInteger(months)) {
        throw new Error('months must be an integer');
    }
    return addMonthsClamped(date, months);
}

export function nextExportDueAt(completedAt: Date | string): string {
    return addUtcCalendarMonths(completedAt, 4).toISOString();
}

export function isExportDue(
    state: Pick<ExportScheduleState, 'last_success_at' | 'next_due_at'> &
        Partial<Pick<ExportScheduleState, 'fired_thresholds'>>,
    now: Date,
    manualDue = false,
): boolean {
    if (manualDue || !state.last_success_at) return true;
    const nextDue = state.next_due_at
        ? parseIso(state.next_due_at, 'next_due_at')
        : addUtcCalendarMonths(
              parseIso(state.last_success_at, 'last_success_at'),
              4,
          );
    return now.getTime() >= nextDue.getTime();
}

export function validateCreditSnapshot(
    snapshot: CreditSnapshot,
    period: CreditPeriod,
): void {
    validateCreditPeriod(period);
    parseIso(snapshot.periodStart, 'credit period start');
    parseIso(snapshot.periodEnd, 'credit period end');
    if (
        snapshot.periodStart !== period.start ||
        snapshot.periodEnd !== period.end ||
        snapshot.currency !== period.currency
    ) {
        throw new Error(
            'Cost snapshot period or currency does not match credit period',
        );
    }
    if (!Number.isFinite(snapshot.consumed) || snapshot.consumed < 0) {
        throw new Error('Cost snapshot consumed amount must be non-negative');
    }
}

function validateCreditPeriod(period: CreditPeriod): void {
    parseIso(period.start, 'CREDIT_PERIOD_START');
    parseIso(period.end, 'CREDIT_PERIOD_END');
    if (new Date(period.start).getTime() >= new Date(period.end).getTime()) {
        throw new Error('CREDIT_PERIOD_START must be before CREDIT_PERIOD_END');
    }
    if (!period.currency.trim()) {
        throw new Error('CREDIT_CURRENCY is required');
    }
}

export function reachedCreditThresholds(
    current: CreditSnapshot,
    firedThresholds: readonly number[] = [],
): number[] {
    return CREDIT_THRESHOLD_DOLLARS.filter(
        (threshold) =>
            current.consumed >= threshold &&
            !firedThresholds.includes(threshold),
    );
}

function normalizeSchedule(
    value: ExportScheduleState | undefined,
): ExportScheduleState {
    if (!value) return { version: 1, fired_thresholds: [] };
    if (value.version !== 1)
        throw new Error('Unsupported export schedule version');
    if (!Array.isArray(value.fired_thresholds)) {
        throw new Error('Export schedule fired_thresholds must be an array');
    }
    if (
        value.pending &&
        (typeof value.pending.marker !== 'string' ||
            !value.pending.marker.trim() ||
            !['firewall', 'export'].includes(value.pending.phase))
    ) {
        throw new Error('Invalid pending export request state');
    }
    return {
        ...value,
        fired_thresholds: value.fired_thresholds.filter((threshold) =>
            CREDIT_THRESHOLD_DOLLARS.includes(threshold as 80 | 90),
        ),
    };
}

function executionStatus(
    execution: JobExecution | undefined,
): 'running' | 'succeeded' | 'failed' | 'unknown' {
    const raw =
        execution?.status ??
        (execution?.properties?.status as string | undefined);
    if (typeof raw !== 'string') return 'unknown';
    const status = raw.toLowerCase();
    if (status === 'succeeded') return 'succeeded';
    if (['running', 'processing'].includes(status)) return 'running';
    if (['failed', 'stopped', 'degraded'].includes(status)) return 'failed';
    return 'unknown';
}

export function executionRequestMarker(
    execution: JobExecution,
): string | undefined {
    const template = executionTemplate(execution);
    if (!template) return undefined;
    for (const container of templateContainers(template)) {
        const env = container.env;
        if (!Array.isArray(env)) continue;
        for (const item of env) {
            const entry = asObject(item);
            const name = entry?.name;
            const value = entry?.value;
            if (
                typeof name === 'string' &&
                [
                    'CIRI_EXPORT_REQUEST_MARKER',
                    'EXPORT_REQUEST_MARKER',
                ].includes(name) &&
                typeof value === 'string'
            ) {
                return value;
            }
        }
    }
    return undefined;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as JsonObject)
        : undefined;
}

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function executionTemplate(value: unknown): JsonObject | undefined {
    const root = asObject(value);
    const properties = asObject(root?.properties);
    const template = asObject(
        properties?.template ??
            root?.template ??
            (Array.isArray(root?.containers) ? root : undefined),
    );
    return template && Array.isArray(template.containers)
        ? cloneJson(template)
        : undefined;
}

function templateContainers(template: JsonObject): JsonObject[] {
    return [
        ...(template.containers as unknown[]),
        ...(Array.isArray(template.initContainers)
            ? (template.initContainers as unknown[])
            : []),
    ].flatMap((value) => {
        const container = asObject(value);
        return container ? [container] : [];
    });
}

function selectOverrideContainer(template: JsonObject): JsonObject {
    const containers = templateContainers(template);
    const digestMatches = containers.filter(
        (container) =>
            Array.isArray(container.env) &&
            (container.env as unknown[]).some((value) => {
                const entry = asObject(value);
                return entry?.name === 'TOOLS_IMAGE_DIGEST';
            }),
    );
    if (digestMatches.length === 1) return digestMatches[0];
    if (containers.length === 1) return containers[0];
    throw new Error(
        'Export Job template must identify exactly one tools container',
    );
}

function setTemplateEnv(
    container: JsonObject,
    name: string,
    value: string,
): void {
    const environment = Array.isArray(container.env)
        ? (container.env as unknown[])
        : [];
    const matches = environment.filter((item) => {
        const entry = asObject(item);
        return entry?.name === name;
    });
    if (matches.length > 1) {
        throw new Error(`Job template has duplicate ${name} variables`);
    }
    if (matches.length === 1) {
        const entry = matches[0] as JsonObject;
        entry.value = value;
        delete entry.secretRef;
    } else {
        environment.push({ name, value });
    }
    container.env = environment;
}

function validateToolsImageDigest(value: string): string {
    const digest = required(value, 'TOOLS_IMAGE_DIGEST');
    if (!/^(?:[a-z0-9./_-]+@)?sha256:[a-f0-9]{64}$/i.test(digest)) {
        throw new Error('TOOLS_IMAGE_DIGEST must be an immutable digest');
    }
    return digest;
}

function executionToolsImageDigest(
    execution: JobExecution,
): string | undefined {
    const template = executionTemplate(execution);
    if (!template) return undefined;
    const container = selectOverrideContainer(template);
    const values: string[] = [];
    if (typeof container.image === 'string') values.push(container.image);
    if (Array.isArray(container.env)) {
        for (const item of container.env) {
            const entry = asObject(item);
            if (
                entry?.name === 'TOOLS_IMAGE_DIGEST' &&
                typeof entry.value === 'string'
            ) {
                values.push(entry.value);
            }
        }
    }
    const digests = [
        ...new Set(values.filter((value) => value.includes('sha256:'))),
    ];
    if (digests.length > 1) {
        throw new Error('Job execution has conflicting tools image digests');
    }
    return digests[0];
}

function executionReference(execution: JobExecution): ExecutionReference {
    const executionId = execution.id?.includes('/executions/')
        ? execution.id.split('/').pop()
        : execution.id;
    return {
        ...(executionId ? { executionId } : {}),
        ...(execution.name ? { executionName: execution.name } : {}),
    };
}

function executionReferenceFromLocation(
    location: string | undefined,
    resourceId: string,
): ExecutionReference {
    if (!location) return {};
    try {
        const parsed = new URL(location, 'https://management.azure.com');
        if (
            parsed.protocol !== 'https:' ||
            parsed.hostname !== 'management.azure.com' ||
            parsed.username ||
            parsed.password ||
            parsed.port
        ) {
            return {};
        }
        const path = parsed.pathname;
        const prefix = `${resourceId}/executions/`;
        if (!path.toLowerCase().startsWith(prefix.toLowerCase())) return {};
        const name = decodeURIComponent(path.slice(prefix.length));
        return name && !name.includes('/') ? { executionName: name } : {};
    } catch {
        return {};
    }
}

function executionOverride(
    marker: string,
    toolsImageDigest?: string,
    jobPayload?: unknown,
): unknown {
    const template = executionTemplate(jobPayload);
    if (!template) {
        if (jobPayload !== undefined) {
            throw new Error(
                'Container Apps Job response has no execution template',
            );
        }
        const environment = [
            { name: 'CIRI_EXPORT_REQUEST_MARKER', value: marker },
            ...(toolsImageDigest
                ? [{ name: 'TOOLS_IMAGE_DIGEST', value: toolsImageDigest }]
                : []),
        ];
        return {
            containers: [
                {
                    ...(toolsImageDigest ? { image: toolsImageDigest } : {}),
                    env: environment,
                },
            ],
        };
    }
    const container = selectOverrideContainer(template);
    setTemplateEnv(container, 'CIRI_EXPORT_REQUEST_MARKER', marker);
    if (toolsImageDigest) {
        container.image = toolsImageDigest;
        setTemplateEnv(container, 'TOOLS_IMAGE_DIGEST', toolsImageDigest);
    }
    return template;
}

function defaultMarker(now: Date): string {
    return `ciri-export-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function waitForTerminal(
    job: JobClient,
    resourceId: string,
    reference: ExecutionReference,
    marker: string,
    toolsImageDigest: string | undefined,
    budgetMs: number,
    now: () => number,
    wait: (milliseconds: number) => Promise<void>,
    signal: AbortSignal,
): Promise<JobExecution | undefined> {
    const deadline = now() + Math.max(0, budgetMs);
    let execution: JobExecution | undefined;
    for (;;) {
        execution = await findExecution(
            job,
            resourceId,
            reference,
            marker,
            toolsImageDigest,
            signal,
        );
        if (!execution) return undefined;
        const status = executionStatus(execution);
        if (status === 'succeeded' || status === 'failed') return execution;
        const remaining = deadline - now();
        if (remaining <= 0) return execution;
        await wait(Math.min(EXPORT_CHECK_POLL_INTERVAL_MS, remaining));
    }
}

async function findExecution(
    job: JobClient,
    resourceId: string,
    reference: ExecutionReference,
    marker: string,
    toolsImageDigest: string | undefined,
    signal: AbortSignal,
): Promise<JobExecution | undefined> {
    if (reference.executionId || reference.executionName) {
        const identifier = reference.executionId ?? reference.executionName!;
        try {
            const execution = await job.get(resourceId, identifier, signal);
            const discovered = executionRequestMarker(execution);
            if (discovered !== marker) {
                throw new Error(
                    'Job execution marker does not match pending request',
                );
            }
            if (
                toolsImageDigest &&
                executionToolsImageDigest(execution) !== toolsImageDigest
            ) {
                throw new Error(
                    'Job execution tools image digest does not match pending request',
                );
            }
            return execution;
        } catch (error) {
            if (!isNotFound(error)) throw error;
        }
    }
    const executions = await job.list(resourceId, signal);
    const matches = executions.filter(
        (execution) => executionRequestMarker(execution) === marker,
    );
    if (matches.length > 1) {
        throw new Error(
            'Multiple Job executions match the pending request marker',
        );
    }
    const match = matches[0];
    if (
        match &&
        toolsImageDigest &&
        executionToolsImageDigest(match) !== toolsImageDigest
    ) {
        throw new Error(
            'Job execution tools image digest does not match pending request',
        );
    }
    return match;
}

async function findManifest(
    store: ExportBlobStore,
    marker: string,
    toolsImageDigest: string | undefined,
    signal?: AbortSignal,
): Promise<ExportManifest | undefined> {
    const entries = await store.list('exports/', signal);
    let found: ExportManifest | undefined;
    for (const entry of entries) {
        if (!/^exports\/\d+-[^/]+\/manifest\.json$/.test(entry.name)) continue;
        const manifest = await readExportJson<ExportManifest>(
            store,
            entry.name,
            signal,
        );
        if (!manifest || manifest.request_marker !== marker) continue;
        if (!validateExportManifest(manifest)) {
            throw new Error('Correlated export manifest is malformed');
        }
        if (toolsImageDigest && manifest.image_digest !== toolsImageDigest) {
            throw new Error(
                'Correlated export manifest tools image digest does not match pending request',
            );
        }
        const prefix = entry.name.slice(0, -'/manifest.json'.length);
        if (
            ![
                manifest.dump_blob,
                manifest.contents_blob,
                manifest.hash_blob,
            ].every((blobName) => blobName.startsWith(`${prefix}/`))
        ) {
            throw new Error(
                'Correlated export manifest has invalid blob paths',
            );
        }
        if (!(await verifyExportManifestMetadata(store, manifest, signal)))
            continue;
        if (found)
            throw new Error(
                'Multiple export manifests match the pending request marker',
            );
        found = manifest;
    }
    return found;
}

function describeFailure(execution: JobExecution | undefined): string {
    const status =
        execution?.status ??
        (execution?.properties?.status as string | undefined);
    return status
        ? `Job execution ended with ${status}`
        : 'Job execution did not reach terminal success';
}

function ensureAcceptedStart(result: JobStartResult): JobStartResult {
    if (
        !Number.isInteger(result.statusCode) ||
        result.statusCode < 200 ||
        result.statusCode >= 300
    ) {
        const error = new Error(
            `Azure Job start returned status ${result.statusCode}`,
        );
        Object.assign(error, { statusCode: result.statusCode });
        throw error;
    }
    return result;
}

function isDefinitiveStartRejection(error: unknown): boolean {
    const status = statusOf(error);
    return (
        status !== undefined &&
        status >= 400 &&
        status < 500 &&
        ![408, 429, 499].includes(status)
    );
}

function startFailureMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Azure Job start was rejected';
}

function terminalFailureState(
    state: ExportScheduleState,
    now: Date,
    reason: string,
): ExportScheduleState {
    const failureAt = now.toISOString();
    return {
        ...state,
        next_due_at: failureAt,
        pending: undefined,
        last_failure_at: failureAt,
        last_failure_reason: reason,
    };
}

async function startJob(
    options: ExportCheckOptions,
    resourceId: string,
    marker: string,
    toolsImageDigest: string | undefined,
    signal: AbortSignal,
): Promise<JobStartResult> {
    const jobPayload = options.jobs.getJob
        ? await options.jobs.getJob(resourceId, signal)
        : undefined;
    return ensureAcceptedStart(
        await options.jobs.start(
            resourceId,
            executionOverride(marker, toolsImageDigest, jobPayload),
            signal,
        ),
    );
}

async function saveSchedule(
    control: BlobControlState,
    state: ExportScheduleState,
    leaseId: string,
): Promise<void> {
    await control.saveJson(EXPORT_SCHEDULE_BLOB, state, leaseId);
}

function pendingReference(pending: PendingExportRequest): ExecutionReference {
    return pending.phase === 'firewall'
        ? {
              executionId: pending.firewall_execution_id,
              executionName: pending.firewall_execution_name,
          }
        : {
              executionId: pending.export_execution_id,
              executionName: pending.export_execution_name,
          };
}

function setExecutionReference(
    pending: PendingExportRequest,
    phase: ExportPhase,
    reference: ExecutionReference,
): PendingExportRequest {
    if (phase === 'firewall') {
        return {
            ...pending,
            firewall_execution_id: reference.executionId,
            firewall_execution_name: reference.executionName,
        };
    }
    return {
        ...pending,
        export_execution_id: reference.executionId,
        export_execution_name: reference.executionName,
    };
}

async function recoverPending(
    options: ExportCheckOptions,
    state: ExportScheduleState,
    leaseId: string,
    startedAt: number,
    signal: AbortSignal,
): Promise<ExportCheckResult> {
    const pending = state.pending;
    if (!pending) return { status: 'not_due', schedule: state };
    const toolsImageDigest = pending.tools_image_digest
        ? validateToolsImageDigest(pending.tools_image_digest)
        : options.toolsImageDigest;
    const now = options.now ?? (() => new Date());
    const wait =
        options.wait ??
        ((milliseconds) =>
            new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const elapsed = () => Date.now() - startedAt;
    if (pending.phase === 'firewall') {
        const execution = await waitForTerminal(
            options.jobs,
            options.firewallJobResourceId,
            pendingReference(pending),
            pending.marker,
            toolsImageDigest,
            Math.max(
                0,
                (options.firewallWaitBudgetMs ?? FIREWALL_WAIT_BUDGET_MS) -
                    elapsed(),
            ),
            () => Date.now(),
            wait,
            signal,
        );
        const status = executionStatus(execution);
        if (!execution || status === 'running' || status === 'unknown') {
            return { status: 'firewall_pending', schedule: state };
        }
        if (status !== 'succeeded') {
            const reason = describeFailure(execution);
            const failed = terminalFailureState(state, now(), reason);
            await saveSchedule(options.control, failed, leaseId);
            return {
                status: 'firewall_failed',
                schedule: failed,
                reason,
            };
        }
        const exportPending: PendingExportRequest = {
            ...pending,
            ...setExecutionReference(
                pending,
                'firewall',
                executionReference(execution),
            ),
            phase: 'export',
        };
        const beforeStart: ExportScheduleState = {
            ...state,
            pending: exportPending,
        };
        await saveSchedule(options.control, beforeStart, leaseId);
        let start: JobStartResult;
        try {
            start = await startJob(
                options,
                options.exportJobResourceId,
                pending.marker,
                toolsImageDigest,
                signal,
            );
        } catch (error) {
            if (!isDefinitiveStartRejection(error)) throw error;
            const reason = startFailureMessage(error);
            const failed = terminalFailureState(beforeStart, now(), reason);
            await saveSchedule(options.control, failed, leaseId);
            return { status: 'export_failed', schedule: failed, reason };
        }
        const afterStart: ExportScheduleState = {
            ...beforeStart,
            pending: {
                ...setExecutionReference(
                    exportPending,
                    'export',
                    start.execution
                        ? executionReference(start.execution)
                        : executionReferenceFromLocation(
                              start.location,
                              options.exportJobResourceId,
                          ),
                ),
                accepted_location: start.location,
            },
        };
        await saveSchedule(options.control, afterStart, leaseId);
        return { status: 'export_started', schedule: afterStart };
    }

    const execution = await findExecution(
        options.jobs,
        options.exportJobResourceId,
        pendingReference(pending),
        pending.marker,
        toolsImageDigest,
        signal,
    );
    const status = executionStatus(execution);
    if (!execution || status === 'running' || status === 'unknown') {
        return { status: 'export_pending', schedule: state };
    }
    if (status !== 'succeeded') {
        const reason = describeFailure(execution);
        const failed = terminalFailureState(state, now(), reason);
        await saveSchedule(options.control, failed, leaseId);
        return {
            status: 'export_failed',
            schedule: failed,
            reason,
        };
    }
    const manifest = await findManifest(
        options.exports,
        pending.marker,
        toolsImageDigest,
        signal,
    );
    if (!manifest) return { status: 'export_pending', schedule: state };
    const completedAt = parseIso(
        manifest.completed_at,
        'manifest completed_at',
    );
    const requestedAt = parseIso(pending.requested_at, 'pending requested_at');
    if (completedAt.getTime() < requestedAt.getTime()) {
        return { status: 'export_pending', schedule: state };
    }
    const completed: ExportScheduleState = {
        ...state,
        last_success_at: completedAt.toISOString(),
        next_due_at: nextExportDueAt(completedAt),
        fired_thresholds: [
            ...new Set([
                ...state.fired_thresholds,
                ...(pending.triggered_thresholds ?? []),
            ]),
        ].sort((left, right) => left - right),
        pending: undefined,
        last_failure_at: undefined,
        last_failure_reason: undefined,
    };
    await saveSchedule(options.control, completed, leaseId);
    return { status: 'completed', schedule: completed, manifest };
}

async function readCosts(
    options: ExportCheckOptions,
    state: ExportScheduleState,
    period: CreditPeriod | undefined,
    signal: AbortSignal,
): Promise<{
    state: ExportScheduleState;
    thresholds: number[];
    unavailable: boolean;
}> {
    if (!options.costs || !period) {
        return {
            state,
            thresholds: [],
            unavailable: options.costs !== undefined || period !== undefined,
        };
    }
    try {
        const snapshot = await options.costs.read(period, signal);
        validateCreditSnapshot(snapshot, period);
        const samePeriod =
            state.credit_period_start === period.start &&
            state.credit_period_end === period.end &&
            state.currency === period.currency;
        const currentState = samePeriod
            ? state
            : {
                  ...state,
                  fired_thresholds: [],
                  credit_period_start: period.start,
                  credit_period_end: period.end,
                  currency: period.currency,
              };
        return {
            state: {
                ...currentState,
                last_verified_cost_snapshot: snapshot,
            },
            thresholds: reachedCreditThresholds(
                snapshot,
                currentState.fired_thresholds,
            ),
            unavailable: false,
        };
    } catch {
        return { state, thresholds: [], unavailable: true };
    }
}

export async function runExportCheck(
    options: ExportCheckOptions,
): Promise<ExportCheckResult> {
    const now = options.now ?? (() => new Date());
    if (options.creditPeriod) validateCreditPeriod(options.creditPeriod);
    const toolsImageDigest = options.toolsImageDigest
        ? validateToolsImageDigest(options.toolsImageDigest)
        : undefined;
    const startedAt = Date.now();
    const operationBudget =
        options.operationBudgetMs ?? EXPORT_CHECK_OPERATION_BUDGET_MS;
    if (
        !Number.isSafeInteger(operationBudget) ||
        operationBudget <= 0 ||
        operationBudget >= 60_000
    ) {
        throw new Error(
            'Export checker budget must be positive and below 60 seconds',
        );
    }
    required(options.firewallJobResourceId, 'FIREWALL_JOB_RESOURCE_ID');
    required(options.exportJobResourceId, 'EXPORT_JOB_RESOURCE_ID');
    const signal = AbortSignal.timeout(operationBudget);
    const lease = await options.control.acquireLease(
        EXPORT_CONTROL_LEASE_BLOB,
        60,
        signal,
        { version: 1, fired_thresholds: [] },
    );
    try {
        const loaded = await options.control.loadJson<ExportScheduleState>(
            EXPORT_SCHEDULE_BLOB,
            lease.leaseId,
            signal,
        );
        let state = normalizeSchedule(loaded);
        if (state.pending) {
            return await recoverPending(
                options,
                state,
                lease.leaseId,
                startedAt,
                signal,
            );
        }

        const costs = await readCosts(
            options,
            state,
            options.creditPeriod,
            signal,
        );
        state = costs.state;
        const dateDue = isExportDue(state, now(), options.manualDue);
        const due = dateDue || costs.thresholds.length > 0;
        const thresholdAutomationUnavailable =
            costs.unavailable &&
            (options.creditPeriod !== undefined || options.costs !== undefined);
        if (!due) {
            if (
                costs.unavailable &&
                (options.creditPeriod !== undefined ||
                    options.costs !== undefined)
            ) {
                await saveSchedule(options.control, state, lease.leaseId);
                return {
                    status: 'threshold_unavailable',
                    schedule: state,
                    thresholdAutomationUnavailable: true,
                };
            }
            if (state.last_verified_cost_snapshot) {
                await saveSchedule(options.control, state, lease.leaseId);
            }
            return { status: 'not_due', schedule: state };
        }

        const marker = required(
            options.marker?.() ?? defaultMarker(now()),
            'export request marker',
        );
        const pending: PendingExportRequest = {
            marker,
            requested_at: now().toISOString(),
            phase: 'firewall',
            ...(toolsImageDigest
                ? { tools_image_digest: toolsImageDigest }
                : {}),
            ...(costs.thresholds.length > 0
                ? { triggered_thresholds: costs.thresholds }
                : {}),
        };
        state = { ...state, pending };
        await saveSchedule(options.control, state, lease.leaseId);

        let firewallStart: JobStartResult;
        try {
            firewallStart = await startJob(
                options,
                options.firewallJobResourceId,
                marker,
                toolsImageDigest,
                signal,
            );
        } catch (error) {
            if (!isDefinitiveStartRejection(error)) throw error;
            const reason = startFailureMessage(error);
            const failed = terminalFailureState(state, now(), reason);
            await saveSchedule(options.control, failed, lease.leaseId);
            return {
                status: 'firewall_failed',
                schedule: failed,
                reason,
                ...(thresholdAutomationUnavailable
                    ? { thresholdAutomationUnavailable: true }
                    : {}),
            };
        }
        state = {
            ...state,
            pending: {
                ...setExecutionReference(
                    pending,
                    'firewall',
                    firewallStart.execution
                        ? executionReference(firewallStart.execution)
                        : executionReferenceFromLocation(
                              firewallStart.location,
                              options.firewallJobResourceId,
                          ),
                ),
                accepted_location: firewallStart.location,
            },
        };
        await saveSchedule(options.control, state, lease.leaseId);

        const firewallExecution = await waitForTerminal(
            options.jobs,
            options.firewallJobResourceId,
            pendingReference(state.pending!),
            marker,
            toolsImageDigest,
            Math.max(
                0,
                (options.firewallWaitBudgetMs ?? FIREWALL_WAIT_BUDGET_MS) -
                    (Date.now() - startedAt),
            ),
            () => Date.now(),
            options.wait ??
                ((milliseconds) =>
                    new Promise<void>((resolve) =>
                        setTimeout(resolve, milliseconds),
                    )),
            signal,
        );
        const firewallStatus = executionStatus(firewallExecution);
        if (
            !firewallExecution ||
            firewallStatus === 'running' ||
            firewallStatus === 'unknown'
        ) {
            return {
                status: 'firewall_pending',
                schedule: state,
                ...(thresholdAutomationUnavailable
                    ? { thresholdAutomationUnavailable: true }
                    : {}),
            };
        }
        if (firewallStatus !== 'succeeded') {
            const reason = describeFailure(firewallExecution);
            const failed = terminalFailureState(state, now(), reason);
            await saveSchedule(options.control, failed, lease.leaseId);
            return {
                status: 'firewall_failed',
                schedule: failed,
                reason,
                ...(thresholdAutomationUnavailable
                    ? { thresholdAutomationUnavailable: true }
                    : {}),
            };
        }

        const beforeExport: ExportScheduleState = {
            ...state,
            pending: {
                ...state.pending!,
                ...setExecutionReference(
                    state.pending!,
                    'firewall',
                    executionReference(firewallExecution),
                ),
                phase: 'export',
            },
        };
        await saveSchedule(options.control, beforeExport, lease.leaseId);
        let exportStart: JobStartResult;
        try {
            exportStart = await startJob(
                options,
                options.exportJobResourceId,
                marker,
                toolsImageDigest,
                signal,
            );
        } catch (error) {
            if (!isDefinitiveStartRejection(error)) throw error;
            const reason = startFailureMessage(error);
            const failed = terminalFailureState(beforeExport, now(), reason);
            await saveSchedule(options.control, failed, lease.leaseId);
            return {
                status: 'export_failed',
                schedule: failed,
                reason,
                ...(thresholdAutomationUnavailable
                    ? { thresholdAutomationUnavailable: true }
                    : {}),
            };
        }
        const resultState: ExportScheduleState = {
            ...beforeExport,
            pending: {
                ...setExecutionReference(
                    beforeExport.pending!,
                    'export',
                    exportStart.execution
                        ? executionReference(exportStart.execution)
                        : executionReferenceFromLocation(
                              exportStart.location,
                              options.exportJobResourceId,
                          ),
                ),
                accepted_location: exportStart.location,
            },
        };
        await saveSchedule(options.control, resultState, lease.leaseId);
        return {
            status: 'export_started',
            schedule: resultState,
            ...(thresholdAutomationUnavailable
                ? { thresholdAutomationUnavailable: true }
                : {}),
        };
    } finally {
        await lease.release().catch(() => undefined);
    }
}

class FetchJobClient implements JobClient {
    constructor(private readonly options: FetchOptions) {}

    async getJob(
        jobResourceId: string,
        signal?: AbortSignal,
    ): Promise<unknown> {
        const response = await this.request(
            'GET',
            jobResourceId,
            undefined,
            signal,
        );
        return response.body;
    }

    async start(
        jobResourceId: string,
        executionOverrideValue: unknown,
        signal?: AbortSignal,
    ): Promise<JobStartResult> {
        const response = await this.request(
            'POST',
            `${jobResourceId}/start`,
            executionOverrideValue,
            signal,
        );
        return {
            statusCode: response.status,
            location: response.headers.get('location') ?? undefined,
            execution: response.body as JobExecution | undefined,
        };
    }

    async get(
        jobResourceId: string,
        executionId: string,
        signal?: AbortSignal,
    ): Promise<JobExecution> {
        const response = await this.request(
            'GET',
            `${jobResourceId}/executions/${encodeURIComponent(executionId)}`,
            undefined,
            signal,
        );
        return response.body as JobExecution;
    }

    async list(
        jobResourceId: string,
        signal?: AbortSignal,
    ): Promise<JobExecution[]> {
        const response = await this.request(
            'GET',
            `${jobResourceId}/executions`,
            undefined,
            signal,
        );
        const value = (response.body as { value?: unknown } | undefined)?.value;
        return Array.isArray(value) ? (value as JobExecution[]) : [];
    }

    private async request(
        method: 'GET' | 'POST',
        resourceId: string,
        body: unknown,
        signal?: AbortSignal,
    ): Promise<{ status: number; headers: Headers; body?: unknown }> {
        if (
            !/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/[^/]+\/.+$/i.test(
                resourceId,
            )
        ) {
            throw new Error(`Invalid Azure resource ID: ${resourceId}`);
        }
        const requestSignal = AbortSignal.any([
            ...(signal ? [signal] : []),
            AbortSignal.timeout(this.options.timeoutMs),
        ]);
        const token = await this.options.credential.getToken(
            'https://management.azure.com/.default',
            { abortSignal: requestSignal },
        );
        if (!token?.token || token.expiresOnTimestamp <= Date.now() + 30_000) {
            throw new Error('Azure ARM credential returned no valid token');
        }
        const response = await this.options.fetchImpl(
            `https://management.azure.com${resourceId}?api-version=${encodeURIComponent(CONTAINER_APP_JOB_API_VERSION)}`,
            {
                method,
                headers: {
                    Authorization: `Bearer ${token.token}`,
                    ...(body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: requestSignal,
            },
        );
        if (!response.ok) {
            const error = new Error(
                `Azure Job ${method} failed with status ${response.status}`,
            );
            Object.assign(error, { statusCode: response.status });
            throw error;
        }
        if (response.status === 204)
            return { status: response.status, headers: response.headers };
        let parsed: unknown;
        try {
            parsed = await response.json();
        } catch {
            parsed = undefined;
        }
        return {
            status: response.status,
            headers: response.headers,
            body: parsed,
        };
    }
}

class FetchCreditReader implements CreditReader {
    constructor(
        private readonly subscriptionId: string,
        private readonly options: FetchOptions,
    ) {}

    async read(
        period: CreditPeriod,
        signal?: AbortSignal,
    ): Promise<CreditSnapshot> {
        const requestSignal = AbortSignal.any([
            ...(signal ? [signal] : []),
            AbortSignal.timeout(this.options.timeoutMs),
        ]);
        const token = await this.options.credential.getToken(
            'https://management.azure.com/.default',
            { abortSignal: requestSignal },
        );
        if (!token?.token || token.expiresOnTimestamp <= Date.now() + 30_000) {
            throw new Error(
                'Azure Cost Management credential returned no valid token',
            );
        }
        const response = await this.options.fetchImpl(
            `https://management.azure.com/subscriptions/${encodeURIComponent(this.subscriptionId)}/providers/Microsoft.CostManagement/query?api-version=${COST_MANAGEMENT_API_VERSION}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'Usage',
                    timeframe: 'Custom',
                    timePeriod: { from: period.start, to: period.end },
                    dataset: {
                        granularity: 'None',
                        aggregation: {
                            totalCost: { name: 'PreTaxCost', function: 'Sum' },
                        },
                    },
                }),
                signal: requestSignal,
            },
        );
        if (!response.ok) {
            throw new Error(
                `Azure Cost Management query failed with status ${response.status}`,
            );
        }
        const body = (await response.json()) as {
            properties?: {
                columns?: Array<{ name?: string }>;
                rows?: unknown[][];
            };
        };
        const columns = body.properties?.columns ?? [];
        const row = body.properties?.rows?.[0] ?? [];
        const costIndex = columns.findIndex((column) =>
            ['PreTaxCost', 'Cost', 'totalCost'].includes(column.name ?? ''),
        );
        const currencyIndex = columns.findIndex((column) =>
            ['Currency', 'currency'].includes(column.name ?? ''),
        );
        const consumed = Number(row[costIndex >= 0 ? costIndex : 0]);
        const currencyValue = row[currencyIndex >= 0 ? currencyIndex : 1];
        const currency = typeof currencyValue === 'string' ? currencyValue : '';
        if (!Number.isFinite(consumed) || !currency) {
            throw new Error(
                'Azure Cost Management returned no usable cost snapshot',
            );
        }
        return {
            periodStart: period.start,
            periodEnd: period.end,
            currency,
            consumed,
        };
    }
}

function periodFromEnv(env: NodeJS.ProcessEnv): CreditPeriod | undefined {
    const start = env.CREDIT_PERIOD_START?.trim();
    const end = env.CREDIT_PERIOD_END?.trim();
    const currency = env.CREDIT_CURRENCY?.trim();
    if (!start && !end && !currency) return undefined;
    return {
        start: required(start, 'CREDIT_PERIOD_START'),
        end: required(end, 'CREDIT_PERIOD_END'),
        currency: required(currency, 'CREDIT_CURRENCY'),
    };
}

export async function runExportCheckCommand(
    env: NodeJS.ProcessEnv = process.env,
    logger = new Logger('ExportCheckMaintenance'),
): Promise<number> {
    const toolsImageDigest = validateToolsImageDigest(
        required(env.TOOLS_IMAGE_DIGEST, 'TOOLS_IMAGE_DIGEST'),
    );
    const credential = createAzureCredential({
        clientId: required(env.AZURE_CLIENT_ID, 'AZURE_CLIENT_ID'),
    });
    const controlClients = createAzureMaintenanceClientsFromEnv(env, {
        controlPrefix: 'exports',
    });
    const exports = createExportBlobStoreFromEnv(env, { credential });
    const fetchOptions: FetchOptions = {
        credential,
        fetchImpl: fetch,
        timeoutMs: 5_000,
    };
    const subscriptionId = env.AZURE_SUBSCRIPTION_ID?.trim();
    const costs = subscriptionId
        ? new FetchCreditReader(subscriptionId, fetchOptions)
        : undefined;
    const result = await runExportCheck({
        control: controlClients.control,
        exports,
        jobs: new FetchJobClient(fetchOptions),
        costs,
        firewallJobResourceId: required(
            env.FIREWALL_JOB_RESOURCE_ID,
            'FIREWALL_JOB_RESOURCE_ID',
        ),
        exportJobResourceId: required(
            env.EXPORT_JOB_RESOURCE_ID,
            'EXPORT_JOB_RESOURCE_ID',
        ),
        toolsImageDigest,
        creditPeriod: periodFromEnv(env),
        manualDue: env.EXPORT_MANUAL === '1' || env.EXPORT_MANUAL === 'true',
    });
    if (result.thresholdAutomationUnavailable) {
        logger.warn(
            'Credit threshold automation unavailable; date/manual export paths remain active',
        );
    }
    logger.log(`Export checker status: ${result.status}`);
    return result.status === 'firewall_failed' ||
        result.status === 'export_failed'
        ? 1
        : 0;
}

if (require.main === module) {
    const logger = new Logger('ExportCheckMaintenance');
    void runExportCheckCommand()
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error: unknown) => {
            logger.error(
                error instanceof Error ? error.message : 'Export check failed',
            );
            process.exitCode = 1;
        });
}

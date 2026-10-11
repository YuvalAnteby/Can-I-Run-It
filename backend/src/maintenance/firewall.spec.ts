import { reconcileFirewall } from './firewall';

type JsonObject = Record<string, unknown>;
type SourceResponse = JsonObject | Error;

const apiResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/containerApps/ciri-api';
const migrationJobResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/ciri-migration';
const exportJobResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/ciri-export';
const postgresServerResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/ciri-db';

const sourceResourceIds = [
    apiResourceId,
    migrationJobResourceId,
    exportJobResourceId,
];

type ReconcileInput = Parameters<typeof reconcileFirewall>[0];
type Clients = ReconcileInput['clients'];

interface Harness {
    clients: Clients;
    arm: {
        getJson: jest.Mock<
            unknown,
            [resourceId: string, apiVersion: string, signal?: AbortSignal]
        >;
        putJson: jest.Mock;
        delete: jest.Mock;
    };
    control: {
        acquireLease: jest.Mock;
        loadJson: jest.Mock;
        saveJson: jest.Mock;
    };
    release: jest.Mock;
    events: string[];
    setSourceResponses: (responses: Record<string, SourceResponse>) => void;
    setRuleList: (rules: JsonObject) => void;
    getPersistedState: () => unknown;
}

const validSources = (): Record<string, SourceResponse> => ({
    [apiResourceId]: {
        properties: { outboundIpAddresses: ['20.10.0.1', '20.10.0.2'] },
    },
    [migrationJobResourceId]: {
        properties: { outboundIpAddresses: ['20.10.0.2', '20.10.0.3'] },
    },
    [exportJobResourceId]: {
        properties: { outboundIpAddresses: ['20.10.0.3', '20.10.0.4'] },
    },
});

function createHarness(
    responses: Record<string, SourceResponse> = validSources(),
): Harness {
    let sourceResponses = responses;
    let ruleList: JsonObject = { value: [] };
    let persistedState: unknown;
    const events: string[] = [];

    const getJson = jest.fn(
        (resourceId: string, _apiVersion: string, _signal?: AbortSignal) => {
            events.push('read');
            if (
                Object.prototype.hasOwnProperty.call(
                    sourceResponses,
                    resourceId,
                )
            ) {
                const response = sourceResponses[resourceId];
                if (response instanceof Error) {
                    throw response;
                }
                return response;
            }
            return ruleList;
        },
    );
    const putJson = jest.fn(() => {
        events.push('put');
        return {};
    });
    const deleteResource = jest.fn(() => {
        events.push('delete');
    });
    const release = jest.fn(() => undefined);
    const acquireLease = jest.fn(() => ({
        leaseId: 'lease-ciri-test',
        release,
    }));
    const loadJson = jest.fn(() => persistedState);
    const saveJson = jest.fn((_blobName: string, value: unknown) => {
        events.push('save');
        persistedState = value;
    });

    const arm = { getJson, putJson, delete: deleteResource };
    const control = { acquireLease, loadJson, saveJson };

    return {
        clients: { arm, control } as unknown as Clients,
        arm,
        control,
        release,
        events,
        setSourceResponses: (next) => {
            sourceResponses = next;
        },
        setRuleList: (next) => {
            ruleList = next;
        },
        getPersistedState: () => persistedState,
    };
}

function reconcile(
    harness: Harness,
    now = new Date('2026-10-10T00:00:00.000Z'),
): ReturnType<typeof reconcileFirewall> {
    return reconcileFirewall({
        sourceResourceIds,
        postgresServerResourceId,
        clients: harness.clients,
        automaticRulePrefix: 'ciri-auto-',
        now: () => now,
    } as ReconcileInput);
}

function expectNoMutation(harness: Harness): void {
    expect(harness.arm.putJson).not.toHaveBeenCalled();
    expect(harness.arm.delete).not.toHaveBeenCalled();
    expect(harness.control.saveJson).not.toHaveBeenCalled();
}

describe('reconcileFirewall', () => {
    it('discovers app and Job egress separately, deduplicates IPs, and uses the Job REST version', async () => {
        const harness = createHarness();

        const result = await reconcile(harness);

        expect(new Set(result.discoveredIps)).toEqual(
            new Set(['20.10.0.1', '20.10.0.2', '20.10.0.3', '20.10.0.4']),
        );
        expect(harness.arm.getJson).toHaveBeenCalledTimes(
            sourceResourceIds.length,
        );

        for (const [resourceId, apiVersion] of harness.arm.getJson.mock.calls) {
            if (resourceId.includes('/jobs/')) {
                expect(apiVersion).toBe('2026-07-01');
            }
        }
        expect(harness.arm.getJson.mock.calls.map(([id]) => id)).toEqual(
            expect.arrayContaining(sourceResourceIds),
        );
    });

    it.each([
        ['empty', []],
        ['missing', undefined],
        ['malformed', ['not-an-ip']],
        ['private', ['10.23.4.5']],
        ['loopback', ['127.0.0.1']],
        ['zero address', ['0.0.0.0']],
        ['CIDR range', ['20.23.4.5/32']],
        ['address range', ['20.23.4.5-20.23.4.6']],
    ])(
        'rejects %s discovery results before any mutation',
        async (_label, addresses) => {
            const responses = validSources();
            responses[apiResourceId] = {
                properties: { outboundIpAddresses: addresses },
            };
            const harness = createHarness(responses);

            await expect(reconcile(harness)).rejects.toThrow(
                /ip|outbound|public|invalid|address/i,
            );

            expectNoMutation(harness);
        },
    );

    it('rejects an oversized discovery set after reading every source and before mutation', async () => {
        const oversized = Array.from(
            { length: 101 },
            (_, index) =>
                `20.24.${Math.floor(index / 250) + 1}.${(index % 250) + 1}`,
        );
        const responses = validSources();
        responses[apiResourceId] = {
            properties: { outboundIpAddresses: oversized },
        };
        const harness = createHarness(responses);

        await expect(reconcile(harness)).rejects.toThrow(
            /ip|outbound|maximum|large/i,
        );

        expect(harness.arm.getJson).toHaveBeenCalledTimes(
            sourceResourceIds.length,
        );
        expectNoMutation(harness);
        expect(harness.events).not.toContain('put');
        expect(harness.events).not.toContain('delete');
    });

    it('validates every source before adding any automatic rule', async () => {
        const responses = validSources();
        responses[exportJobResourceId] = {
            properties: { outboundIpAddresses: ['not-an-ip'] },
        };
        const harness = createHarness(responses);

        await expect(reconcile(harness)).rejects.toThrow(
            /ip|outbound|invalid/i,
        );

        expect(harness.arm.getJson).toHaveBeenCalledTimes(
            sourceResourceIds.length,
        );
        expectNoMutation(harness);
        expect(harness.events.indexOf('put')).toBe(-1);
        expect(harness.events.indexOf('delete')).toBe(-1);
    });

    it('preserves unrelated operator rules and adds exact automatic rules before pruning', async () => {
        const harness = createHarness();
        harness.setRuleList({
            value: [
                {
                    name: 'operator-office',
                    properties: {
                        startIpAddress: '198.51.100.7',
                        endIpAddress: '198.51.100.7',
                    },
                },
                {
                    name: 'ciri-auto-old',
                    properties: {
                        startIpAddress: '20.10.0.99',
                        endIpAddress: '20.10.0.99',
                    },
                },
            ],
        });
        harness.control.loadJson.mockResolvedValue({
            version: 1,
            rules: {
                '20.10.0.99': {
                    name: 'ciri-auto-old',
                    firstSeenAt: '2026-10-10T00:00:00.000Z',
                },
            },
        });

        await reconcile(harness);

        const firstMutation = harness.events.findIndex((event) =>
            ['put', 'delete', 'save'].includes(event),
        );
        expect(firstMutation).toBeGreaterThanOrEqual(0);
        expect(harness.events[firstMutation]).toBe('put');
        expect(harness.arm.putJson).toHaveBeenCalled();
        expect(harness.arm.delete).not.toHaveBeenCalled();
        expect(JSON.stringify(harness.arm.delete.mock.calls)).not.toContain(
            'operator-office',
        );
    });

    it('does not retire an old rule until every required addition completes', async () => {
        const oldIp = '20.10.0.99';
        const newIp = '20.10.0.1';
        const harness = createHarness({
            [apiResourceId]: { properties: { outboundIpAddresses: [newIp] } },
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
        });
        harness.setRuleList({
            value: [
                {
                    name: 'ciri-auto-old',
                    properties: { startIpAddress: oldIp, endIpAddress: oldIp },
                },
            ],
        });
        harness.control.loadJson.mockResolvedValue({
            version: 1,
            rules: {
                [oldIp]: {
                    name: 'ciri-auto-old',
                    firstSeenAt: '2026-10-08T00:00:00.000Z',
                    retiredAt: '2026-10-09T00:00:00.000Z',
                },
            },
        });
        harness.arm.putJson.mockRejectedValueOnce(
            Object.assign(new Error('async add failed'), { status: 500 }),
        );

        await expect(
            reconcile(harness, new Date('2026-10-10T00:00:00.000Z')),
        ).rejects.toThrow(/async add failed|500/i);

        expect(harness.arm.delete).not.toHaveBeenCalled();
        expect(harness.control.saveJson).not.toHaveBeenCalled();
    });

    it('does not mutate ARM or metadata when source ARM discovery fails, and releases the lease', async () => {
        const responses = validSources();
        responses[migrationJobResourceId] = new Error('ARM unavailable');
        const harness = createHarness(responses);

        await expect(reconcile(harness)).rejects.toThrow('ARM unavailable');

        expectNoMutation(harness);
        expect(harness.release).toHaveBeenCalledTimes(1);
    });

    it('fails closed on a control blob read error and still releases the lease', async () => {
        const harness = createHarness();
        harness.control.loadJson.mockRejectedValueOnce(
            new Error('control blob unavailable'),
        );

        await expect(reconcile(harness)).rejects.toThrow(
            'control blob unavailable',
        );

        expect(harness.arm.getJson).not.toHaveBeenCalled();
        expect(harness.arm.putJson).not.toHaveBeenCalled();
        expect(harness.arm.delete).not.toHaveBeenCalled();
        expect(harness.release).toHaveBeenCalledTimes(1);
    });

    it('reports a failed automatic deletion and retains state for the next retry', async () => {
        const oldIp = '20.10.0.99';
        const harness = createHarness();
        harness.setRuleList({
            value: [
                {
                    name: 'ciri-auto-old',
                    properties: { startIpAddress: oldIp, endIpAddress: oldIp },
                },
            ],
        });
        harness.arm.delete.mockRejectedValueOnce(
            Object.assign(new Error('temporary delete failure'), {
                status: 503,
            }),
        );

        const state = {
            version: 1,
            rules: {
                [oldIp]: {
                    name: 'ciri-auto-old',
                    firstSeenAt: '2026-10-08T00:00:00.000Z',
                    retiredAt: '2026-10-09T00:00:00.000Z',
                },
            },
        };
        harness.control.loadJson.mockResolvedValue(state);
        harness.setSourceResponses({
            [apiResourceId]: {
                properties: { outboundIpAddresses: ['20.10.0.1'] },
            },
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: ['20.10.0.1'] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: ['20.10.0.1'] },
            },
        });

        const result = await reconcile(
            harness,
            new Date('2026-10-10T00:00:00.000Z'),
        );

        expect(result.failedDeletions).toEqual(
            expect.arrayContaining([expect.stringContaining(oldIp)]),
        );
        expect(harness.control.saveJson).toHaveBeenCalled();
    });

    it('keeps a failed asynchronous deletion durable and retries it later', async () => {
        const oldIp = '20.10.0.99';
        const newIp = '20.10.0.1';
        const harness = createHarness({
            [apiResourceId]: { properties: { outboundIpAddresses: [newIp] } },
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
        });
        harness.setRuleList({
            value: [
                {
                    name: 'ciri-auto-old',
                    properties: { startIpAddress: oldIp, endIpAddress: oldIp },
                },
            ],
        });
        harness.control.loadJson.mockResolvedValue({
            version: 1,
            rules: {
                [oldIp]: {
                    name: 'ciri-auto-old',
                    firstSeenAt: '2026-10-08T00:00:00.000Z',
                    retiredAt: '2026-10-09T00:00:00.000Z',
                },
            },
        });
        harness.arm.delete.mockRejectedValueOnce(
            Object.assign(new Error('async delete terminal failure'), {
                status: 500,
            }),
        );

        const first = await reconcile(
            harness,
            new Date('2026-10-10T00:00:00.000Z'),
        );

        expect(first.failedDeletions).toEqual(
            expect.arrayContaining([expect.stringContaining(oldIp)]),
        );
        const persistedAfterFailure = harness.getPersistedState() as {
            rules: Record<string, { retiredAt?: string }>;
        };
        expect(persistedAfterFailure.rules[oldIp]).toEqual(
            expect.objectContaining({ retiredAt: '2026-10-09T00:00:00.000Z' }),
        );

        harness.setRuleList({
            value: [
                {
                    name: 'ciri-auto-new',
                    properties: { startIpAddress: newIp, endIpAddress: newIp },
                },
                {
                    name: 'ciri-auto-old',
                    properties: { startIpAddress: oldIp, endIpAddress: oldIp },
                },
            ],
        });
        harness.control.loadJson.mockResolvedValue(persistedAfterFailure);
        harness.arm.delete.mockResolvedValueOnce(undefined);

        const second = await reconcile(
            harness,
            new Date('2026-10-10T00:01:00.000Z'),
        );

        expect(second.failedDeletions).toEqual([]);
        expect(harness.arm.delete).toHaveBeenCalledTimes(2);
        const persistedAfterRetry = harness.getPersistedState() as {
            rules: Record<string, unknown>;
        };
        expect(persistedAfterRetry.rules[oldIp]).toBeUndefined();
    });

    it('treats a missing automatic rule as an idempotent successful deletion', async () => {
        const oldIp = '20.10.0.99';
        const harness = createHarness();
        harness.setRuleList({
            value: [
                {
                    name: 'ciri-auto-old',
                    properties: { startIpAddress: oldIp, endIpAddress: oldIp },
                },
            ],
        });
        harness.arm.delete.mockRejectedValueOnce(
            Object.assign(new Error('rule not found'), { statusCode: 404 }),
        );
        harness.control.loadJson.mockResolvedValue({
            version: 1,
            rules: {
                [oldIp]: {
                    name: 'ciri-auto-old',
                    firstSeenAt: '2026-10-08T00:00:00.000Z',
                    retiredAt: '2026-10-09T00:00:00.000Z',
                },
            },
        });
        harness.setSourceResponses({
            [apiResourceId]: {
                properties: { outboundIpAddresses: ['20.10.0.1'] },
            },
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: ['20.10.0.1'] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: ['20.10.0.1'] },
            },
        });

        const result = await reconcile(
            harness,
            new Date('2026-10-10T00:00:00.000Z'),
        );

        expect(result.failedDeletions).not.toEqual(
            expect.arrayContaining([expect.stringContaining(oldIp)]),
        );
        expect(harness.control.saveJson).toHaveBeenCalled();
    });

    it('preserves the primary cancellation error and releases with a fresh bounded cleanup signal', async () => {
        let mutationSignal: AbortSignal | undefined;
        const release = jest.fn((signal?: AbortSignal) => {
            if (signal?.aborted) {
                throw new Error('cleanup signal was already aborted');
            }
        });
        const putJson = jest.fn(
            async (
                _resourceId: string,
                _apiVersion: string,
                _body: unknown,
                signal?: AbortSignal,
            ) => {
                mutationSignal = signal;
                await new Promise<never>((_resolve, reject) => {
                    if (signal?.aborted) {
                        reject(new Error('primary mutation failed'));
                        return;
                    }
                    signal?.addEventListener(
                        'abort',
                        () => reject(new Error('primary mutation failed')),
                        { once: true },
                    );
                });
            },
        );
        const clients = {
            arm: {
                getJson: jest.fn(() => ({
                    properties: { outboundIpAddresses: ['20.10.0.1'] },
                })),
                putJson,
                delete: jest.fn(),
            },
            control: {
                acquireLease: jest.fn(() => ({
                    leaseId: 'lease-1',
                    release,
                })),
                loadJson: jest.fn(() => undefined),
                saveJson: jest.fn(),
            },
        } as unknown as ReconcileInput['clients'];

        await expect(
            reconcileFirewall({
                sourceResourceIds,
                postgresServerResourceId,
                clients,
                operationTimeoutMs: 10,
            }),
        ).rejects.toThrow('primary mutation failed');

        expect(putJson).toHaveBeenCalled();
        expect(release).toHaveBeenCalledTimes(1);
        const cleanupSignal = release.mock.calls[0][0] as AbortSignal;
        expect(cleanupSignal).toBeDefined();
        expect(cleanupSignal.aborted).toBe(false);
        expect(cleanupSignal).not.toBe(mutationSignal);
    });

    it('starts retirement at first absence, waits a full hour, and requires later successful discovery before pruning', async () => {
        const oldIp = '20.10.0.99';
        const newIp = '20.10.0.1';
        const harness = createHarness({
            [apiResourceId]: { properties: { outboundIpAddresses: [oldIp] } },
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: [oldIp] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: [oldIp] },
            },
        });
        harness.setRuleList({
            value: [
                {
                    name: 'ciri-auto-old',
                    properties: { startIpAddress: oldIp, endIpAddress: oldIp },
                },
            ],
        });
        harness.control.loadJson.mockResolvedValue({
            version: 1,
            rules: {
                [oldIp]: {
                    name: 'ciri-auto-old',
                    firstSeenAt: '2026-10-01T00:00:00.000Z',
                },
            },
        });

        await reconcile(harness, new Date('2026-10-10T00:00:00.000Z'));

        harness.arm.putJson.mockClear();
        harness.arm.delete.mockClear();
        harness.control.saveJson.mockClear();
        harness.events.length = 0;
        harness.control.loadJson.mockResolvedValue({
            version: 1,
            rules: {
                [oldIp]: {
                    name: 'ciri-auto-old',
                    firstSeenAt: '2026-10-01T00:00:00.000Z',
                },
            },
        });
        harness.setSourceResponses({
            [apiResourceId]: { properties: { outboundIpAddresses: [newIp] } },
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
        });

        await reconcile(harness, new Date('2026-10-10T00:30:00.000Z'));
        expect(harness.arm.delete).not.toHaveBeenCalled();
        const stateAfterRetirement = harness.getPersistedState() as {
            rules: Record<string, { retiredAt?: string }>;
        };
        expect(stateAfterRetirement.rules[oldIp].retiredAt).toBe(
            '2026-10-10T00:30:00.000Z',
        );
        harness.control.loadJson.mockResolvedValue(stateAfterRetirement);
        harness.setSourceResponses({
            [apiResourceId]: new Error('discovery interrupted'),
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
        });
        harness.arm.delete.mockClear();
        await expect(
            reconcile(harness, new Date('2026-10-10T01:00:00.000Z')),
        ).rejects.toThrow('discovery interrupted');
        expect(harness.arm.delete).not.toHaveBeenCalled();

        harness.arm.putJson.mockClear();
        harness.arm.delete.mockClear();
        harness.control.saveJson.mockClear();
        harness.events.length = 0;
        harness.control.loadJson.mockResolvedValue(stateAfterRetirement);
        harness.setSourceResponses({
            [apiResourceId]: { properties: { outboundIpAddresses: [newIp] } },
            [migrationJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
            [exportJobResourceId]: {
                properties: { outboundIpAddresses: [newIp] },
            },
        });

        await reconcile(harness, new Date('2026-10-10T01:29:00.000Z'));
        expect(harness.arm.delete).not.toHaveBeenCalled();

        harness.arm.putJson.mockClear();
        harness.arm.delete.mockClear();
        harness.control.saveJson.mockClear();
        harness.events.length = 0;
        harness.control.loadJson.mockResolvedValue(stateAfterRetirement);

        await reconcile(harness, new Date('2026-10-10T01:31:00.000Z'));

        expect(JSON.stringify(harness.arm.delete.mock.calls)).toContain(oldIp);
    });

    it('does not call ARM when the metadata lease is already held', async () => {
        const harness = createHarness();
        harness.control.acquireLease.mockRejectedValueOnce(
            new Error('lease conflict'),
        );

        await expect(reconcile(harness)).rejects.toThrow('lease conflict');

        expect(harness.arm.getJson).not.toHaveBeenCalled();
        expect(harness.arm.putJson).not.toHaveBeenCalled();
        expect(harness.arm.delete).not.toHaveBeenCalled();
        expect(harness.control.loadJson).not.toHaveBeenCalled();
    });
});

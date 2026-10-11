import {
    type ArmClient,
    type AzureTokenCredential,
    createAzureMaintenanceClients,
} from './azure';
import { reconcileFirewall } from './firewall';

const apiResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/containerApps/ciri-api';
const migrationJobResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/ciri-migration';
const exportJobResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.App/jobs/ciri-export';
const postgresServerResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/ciri-db';

type StoredBlob = {
    value?: Buffer;
    leaseId?: string;
};

interface FakeBlobService {
    service: { getContainerClient: jest.Mock };
    blobs: Map<string, StoredBlob>;
    container: { getBlockBlobClient: jest.Mock };
}

function statusError(
    message: string,
    statusCode: number,
): Error & { statusCode: number } {
    return Object.assign(new Error(message), { statusCode });
}

function makeBlobService(): FakeBlobService {
    const blobs = new Map<string, StoredBlob>();
    const clients = new Map<
        string,
        {
            uploadData: jest.Mock;
            downloadToBuffer: jest.Mock;
            getBlobLeaseClient: jest.Mock;
        }
    >();

    const getBlob = (name: string) => {
        const existing = clients.get(name);
        if (existing) return existing;
        const blob = (): StoredBlob => {
            const current = blobs.get(name);
            if (current) return current;
            const created: StoredBlob = {};
            blobs.set(name, created);
            return created;
        };
        const uploadData = jest.fn(
            (
                value: Buffer,
                options?: {
                    conditions?: { ifNoneMatch?: string; leaseId?: string };
                    abortSignal?: AbortSignal;
                },
            ) => {
                if (options?.abortSignal?.aborted) {
                    throw new DOMException('aborted', 'AbortError');
                }
                const state = blob();
                if (
                    options?.conditions?.ifNoneMatch === '*' &&
                    state.value !== undefined
                ) {
                    throw statusError('blob already exists', 412);
                }
                const leaseId = options?.conditions?.leaseId;
                if (leaseId !== undefined && state.leaseId !== leaseId) {
                    throw statusError('lease belongs to another blob', 412);
                }
                state.value = Buffer.from(value);
            },
        );
        const downloadToBuffer = jest.fn(() => {
            const state = blobs.get(name);
            if (!state?.value) throw statusError('blob not found', 404);
            return Buffer.from(state.value);
        });
        const getBlobLeaseClient = jest.fn((requestedLeaseId?: string) => ({
            acquireLease: jest.fn(() => {
                const state = blob();
                if (state.leaseId) throw statusError('lease already held', 409);
                const leaseId = `${name}:lease`;
                state.leaseId = leaseId;
                return { leaseId };
            }),
            releaseLease: jest.fn(() => {
                const state = blob();
                if (
                    requestedLeaseId !== undefined &&
                    state.leaseId !== requestedLeaseId
                ) {
                    throw statusError('wrong lease', 412);
                }
                state.leaseId = undefined;
            }),
        }));
        const result = { uploadData, downloadToBuffer, getBlobLeaseClient };
        clients.set(name, result);
        return result;
    };

    const container = {
        getBlockBlobClient: jest.fn((name: string) => getBlob(name)),
    };
    const service = {
        getContainerClient: jest.fn(() => container),
    };
    return { service, container, blobs };
}

function createClients(
    blobService: FakeBlobService,
    overrides: Partial<
        Parameters<typeof createAzureMaintenanceClients>[0]
    > = {},
) {
    const credential: AzureTokenCredential = {
        getToken: jest.fn(() =>
            Promise.resolve({
                token: 'token',
                expiresOnTimestamp: Date.now() + 60_000,
            }),
        ),
    };
    return createAzureMaintenanceClients({
        storageAccount: 'ciristorage',
        controlContainer: 'control',
        credential,
        blobServiceClient: blobService.service as never,
        ...overrides,
    });
}

const firewallRuleResourceId =
    '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/ciri-db/firewallRules/ciri-auto-20.10.0.1';
const firewallRuleApiVersion = '2022-12-01';

type AsyncMutation = 'PUT' | 'DELETE';

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function acceptedResponse(location: string): Response {
    return new Response(null, { status: 202, headers: { Location: location } });
}

function createFetchArm(
    fetchImpl: jest.MockedFunction<typeof fetch>,
    requestTimeoutMs = 100,
): ArmClient {
    return createAzureMaintenanceClients({
        storageAccount: 'ciristorage',
        controlContainer: 'control',
        credential: {
            getToken: jest.fn(() =>
                Promise.resolve({
                    token: 'token',
                    expiresOnTimestamp: Date.now() + 60_000,
                }),
            ),
        },
        blobServiceClient: makeBlobService().service as never,
        fetchImpl,
        requestTimeoutMs,
    }).arm;
}

function mockFetch(): jest.MockedFunction<typeof fetch> {
    return jest.fn() as jest.MockedFunction<typeof fetch>;
}

function runMutation(
    arm: ArmClient,
    mutation: AsyncMutation,
): Promise<unknown> {
    if (mutation === 'PUT') {
        return arm.putJson(firewallRuleResourceId, firewallRuleApiVersion, {
            properties: {
                startIpAddress: '20.10.0.1',
                endIpAddress: '20.10.0.1',
            },
        });
    }
    return arm.delete(firewallRuleResourceId, firewallRuleApiVersion);
}

describe('Azure maintenance adapters', () => {
    it('enforces Azure per-blob lease semantics and lets reconciliation persist state', async () => {
        const blobService = makeBlobService();
        const clients = createClients(blobService, {
            controlPrefix: 'firewall',
        });

        const lease = await clients.control.acquireLease('firewall/lease');
        await expect(
            clients.control.saveJson(
                'firewall/state.json',
                { version: 1 },
                lease.leaseId,
            ),
        ).rejects.toMatchObject({ statusCode: 412 });
        await lease.release();

        const arm: ArmClient = {
            getJson: <T>() =>
                Promise.resolve({
                    properties: { outboundIpAddresses: ['20.10.0.1'] },
                } as T),
            putJson: <T>() => Promise.resolve({} as T),
            delete: () => Promise.resolve(),
        };
        const reconciliationClients = {
            arm,
            control: clients.control,
        };

        await expect(
            reconcileFirewall({
                sourceResourceIds: [
                    apiResourceId,
                    migrationJobResourceId,
                    exportJobResourceId,
                ],
                postgresServerResourceId,
                clients: reconciliationClients,
                now: () => new Date('2026-10-10T00:00:00.000Z'),
            }),
        ).resolves.toMatchObject({ discoveredIps: ['20.10.0.1'] });
        expect(blobService.blobs.has('firewall/state.json')).toBe(true);
    });

    it('passes cancellation and the request deadline into token acquisition', async () => {
        let tokenSignal: AbortSignal | undefined;
        const credential: AzureTokenCredential = {
            getToken: jest.fn(
                (_scope: string, options?: { abortSignal?: AbortSignal }) => {
                    tokenSignal = options?.abortSignal;
                    return new Promise((_resolve, reject) => {
                        if (!tokenSignal) return;
                        tokenSignal.addEventListener(
                            'abort',
                            () =>
                                reject(
                                    new DOMException('aborted', 'AbortError'),
                                ),
                            { once: true },
                        );
                    });
                },
            ),
        };
        const clients = createAzureMaintenanceClients({
            storageAccount: 'ciristorage',
            controlContainer: 'control',
            credential,
            blobServiceClient: makeBlobService().service as never,
            fetchImpl: jest.fn(),
            requestTimeoutMs: 20,
        });

        const operation = clients.arm.getJson(apiResourceId, '2025-01-01');
        const result = await Promise.race([
            operation.then(
                () => ({ kind: 'resolved' as const }),
                (error: unknown) => ({ kind: 'error' as const, error }),
            ),
            new Promise<{ kind: 'timeout' }>((resolve) =>
                setTimeout(() => resolve({ kind: 'timeout' }), 150),
            ),
        ]);

        expect(result.kind).toBe('error');
        if (result.kind === 'error') {
            expect(result.error).toEqual(expect.any(Error));
        }
        expect(tokenSignal).toBeDefined();
        expect(tokenSignal?.aborted).toBe(true);
    });

    it.each(['PUT', 'DELETE'] as AsyncMutation[])(
        '%s completes an empty-body 202 after terminal success polling',
        async (mutation) => {
            const operationUrl =
                'https://management.azure.com/subscriptions/sub/operationStatuses/ciri-op-1?api-version=2022-12-01';
            const fetchImpl = mockFetch()
                .mockResolvedValueOnce(acceptedResponse(operationUrl))
                .mockResolvedValueOnce(jsonResponse({ status: 'Succeeded' }));
            const arm = createFetchArm(fetchImpl);

            await runMutation(arm, mutation);

            expect(fetchImpl).toHaveBeenCalledTimes(2);
            expect(fetchImpl).toHaveBeenNthCalledWith(
                1,
                `https://management.azure.com${firewallRuleResourceId}?api-version=${firewallRuleApiVersion}`,
                expect.objectContaining({ method: mutation }),
            );
            expect(fetchImpl).toHaveBeenNthCalledWith(
                2,
                operationUrl,
                expect.objectContaining({ method: 'GET' }),
            );
        },
    );

    it.each(['PUT', 'DELETE'] as AsyncMutation[])(
        '%s surfaces a terminal async failure from an empty-body 202',
        async (mutation) => {
            const operationUrl =
                'https://management.azure.com/subscriptions/sub/operationStatuses/ciri-op-failed?api-version=2022-12-01';
            const fetchImpl = mockFetch()
                .mockResolvedValueOnce(acceptedResponse(operationUrl))
                .mockResolvedValueOnce(
                    jsonResponse({
                        status: 'Failed',
                        error: { code: 'FirewallRuleRejected' },
                    }),
                );
            const arm = createFetchArm(fetchImpl);

            await expect(runMutation(arm, mutation)).rejects.toThrow(
                /failed|rejected|operation/i,
            );
            expect(fetchImpl).toHaveBeenCalledTimes(2);
        },
    );

    it.each(['PUT', 'DELETE'] as AsyncMutation[])(
        '%s times out while an async operation remains in progress',
        async (mutation) => {
            const operationUrl =
                'https://management.azure.com/subscriptions/sub/operationStatuses/ciri-op-pending?api-version=2022-12-01';
            const fetchImpl = mockFetch()
                .mockResolvedValueOnce(acceptedResponse(operationUrl))
                .mockResolvedValue(jsonResponse({ status: 'InProgress' }));
            const arm = createFetchArm(fetchImpl, 25);

            await expect(runMutation(arm, mutation)).rejects.toThrow(
                /timed out|timeout|polling aborted|operation/i,
            );
            expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
        },
    );

    it('rejects an untrusted async operation location before polling it', async () => {
        const fetchImpl = mockFetch().mockResolvedValueOnce(
            acceptedResponse('https://evil.example.invalid/operation'),
        );
        const arm = createFetchArm(fetchImpl);

        await expect(runMutation(arm, 'PUT')).rejects.toThrow(
            /location|operation|trusted|management|host/i,
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});

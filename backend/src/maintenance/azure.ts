import { AzureCliCredential, ManagedIdentityCredential } from '@azure/identity';
import {
    BlobServiceClient,
    type BlockBlobClient,
    ContainerClient,
} from '@azure/storage-blob';

const ARM_SCOPE = 'https://management.azure.com/.default';
const ARM_ENDPOINT = 'https://management.azure.com';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_LEASE_SECONDS = 60;
const ARM_POLL_INTERVAL_MS = 250;

export interface AzureAccessToken {
    token: string;
    expiresOnTimestamp: number;
}

export interface AzureTokenCredential {
    getToken(
        scope: string,
        options?: unknown,
    ): Promise<AzureAccessToken | null>;
}

export type AzureCredentialMode = 'managed-identity' | 'azure-cli';

export interface ArmClient {
    getJson<T>(
        resourceId: string,
        apiVersion: string,
        signal?: AbortSignal,
    ): Promise<T>;
    putJson<T>(
        resourceId: string,
        apiVersion: string,
        body: unknown,
        signal?: AbortSignal,
    ): Promise<T>;
    delete(
        resourceId: string,
        apiVersion: string,
        signal?: AbortSignal,
    ): Promise<void>;
}

export interface BlobLease {
    leaseId: string;
    created?: boolean;
    release(signal?: AbortSignal): Promise<void>;
}

export interface BlobControlState {
    acquireLease(
        blobName: string,
        durationSeconds?: number,
        signal?: AbortSignal,
        initialValue?: unknown,
    ): Promise<BlobLease>;
    loadJson<T>(
        blobName: string,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<T | undefined>;
    saveJson<T>(
        blobName: string,
        value: T,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void>;
}

export interface AzureMaintenanceClients {
    arm: ArmClient;
    control: BlobControlState;
}

export interface AzureClientOptions {
    storageAccount: string;
    controlContainer: string;
    clientId?: string;
    credential?: AzureTokenCredential;
    credentialMode?: AzureCredentialMode;
    controlPrefix?: string;
    fetchImpl?: typeof fetch;
    requestTimeoutMs?: number;
    blobServiceClient?: BlobServiceClient;
}

export class AzureRequestError extends Error {
    constructor(
        public readonly operation: string,
        public readonly resourceId: string,
        public readonly statusCode: number,
    ) {
        super(
            `Azure ARM ${operation} failed with status ${statusCode} for ${resourceId}`,
        );
        this.name = 'AzureRequestError';
    }
}

function required(value: string | undefined, name: string): string {
    if (!value?.trim()) {
        throw new Error(`${name} is required`);
    }
    return value.trim();
}

function validateStorageAccount(value: string): string {
    const account = required(value, 'AZURE_STORAGE_ACCOUNT');
    if (!/^[a-z0-9]{3,24}$/.test(account)) {
        throw new Error(
            'AZURE_STORAGE_ACCOUNT must be a valid storage account name',
        );
    }
    return account;
}

function validateContainer(value: string): string {
    const container = required(value, 'AZURE_CONTROL_CONTAINER');
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(container)) {
        throw new Error(
            'AZURE_CONTROL_CONTAINER must be a valid blob container name',
        );
    }
    return container;
}

function validateResourceId(resourceId: string): string {
    if (
        !/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/[^/]+\/.+$/i.test(
            resourceId,
        )
    ) {
        throw new Error(`Invalid Azure resource ID: ${resourceId}`);
    }
    return resourceId;
}

function makeUrl(resourceId: string, apiVersion: string): string {
    const id = validateResourceId(resourceId);
    const version = required(apiVersion, 'apiVersion');
    return `${ARM_ENDPOINT}${id}?api-version=${encodeURIComponent(version)}`;
}

function trustedOperationUrl(value: string): string {
    let url: URL;
    try {
        url = new URL(value, ARM_ENDPOINT);
    } catch (error) {
        throw new Error('Azure ARM returned an invalid polling location', {
            cause: error,
        });
    }
    if (
        url.protocol !== 'https:' ||
        url.hostname !== 'management.azure.com' ||
        url.username ||
        url.password ||
        url.port
    ) {
        throw new Error('Azure ARM returned an untrusted polling location');
    }
    return url.toString();
}

function waitForPoll(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        function onAbort(): void {
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            const error = new Error('Azure ARM polling aborted');
            error.name = 'AbortError';
            reject(error);
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ARM_POLL_INTERVAL_MS);
        if (signal.aborted) {
            onAbort();
        } else {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

function combineSignals(
    callerSignal: AbortSignal | undefined,
    timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = (): void => controller.abort();

    if (callerSignal?.aborted) {
        controller.abort(callerSignal.reason);
    } else {
        callerSignal?.addEventListener('abort', abort, { once: true });
    }

    return {
        signal: controller.signal,
        dispose: () => {
            clearTimeout(timeout);
            callerSignal?.removeEventListener('abort', abort);
        },
    };
}

function asCredential(
    credential: AzureTokenCredential | undefined,
    mode: AzureCredentialMode,
    clientId: string | undefined,
): AzureTokenCredential {
    if (credential) {
        return credential;
    }
    if (mode === 'azure-cli') {
        return new AzureCliCredential() as unknown as AzureTokenCredential;
    }
    return new ManagedIdentityCredential({
        clientId: required(clientId, 'AZURE_CLIENT_ID'),
    }) as unknown as AzureTokenCredential;
}

function resourcePath(prefix: string, name: string): string {
    const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
    const normalizedName = name.replace(/^\/+/, '');
    if (
        !normalizedPrefix ||
        normalizedName.startsWith(`${normalizedPrefix}/`)
    ) {
        return normalizedName;
    }
    return `${normalizedPrefix}/${normalizedName}`;
}

class FetchArmClient implements ArmClient {
    constructor(
        private readonly credential: AzureTokenCredential,
        private readonly fetchImpl: typeof fetch,
        private readonly timeoutMs: number,
    ) {}

    async getJson<T>(
        resourceId: string,
        apiVersion: string,
        signal?: AbortSignal,
    ): Promise<T> {
        return this.request<T>(
            'GET',
            resourceId,
            apiVersion,
            undefined,
            signal,
        );
    }

    async putJson<T>(
        resourceId: string,
        apiVersion: string,
        body: unknown,
        signal?: AbortSignal,
    ): Promise<T> {
        return this.request<T>('PUT', resourceId, apiVersion, body, signal);
    }

    async delete(
        resourceId: string,
        apiVersion: string,
        signal?: AbortSignal,
    ): Promise<void> {
        await this.request<void>(
            'DELETE',
            resourceId,
            apiVersion,
            undefined,
            signal,
        );
    }

    private async request<T>(
        method: 'GET' | 'PUT' | 'DELETE',
        resourceId: string,
        apiVersion: string,
        body: unknown,
        signal?: AbortSignal,
    ): Promise<T> {
        const combined = combineSignals(signal, this.timeoutMs);
        try {
            const token = await this.token(combined.signal);
            const response = await this.fetchImpl(
                makeUrl(resourceId, apiVersion),
                {
                    method,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        ...(body === undefined
                            ? {}
                            : { 'Content-Type': 'application/json' }),
                    },
                    ...(body === undefined
                        ? {}
                        : { body: JSON.stringify(body) }),
                    signal: combined.signal,
                },
            );
            if (method === 'DELETE' && response.status === 404) {
                return undefined as T;
            }
            if (!response.ok) {
                throw new AzureRequestError(
                    method,
                    resourceId,
                    response.status,
                );
            }
            if (response.status === 202 && method !== 'GET') {
                const asyncOperation =
                    response.headers.get('Azure-AsyncOperation')?.trim() ||
                    undefined;
                const location =
                    asyncOperation ||
                    response.headers.get('Location')?.trim() ||
                    undefined;
                if (!location) {
                    throw new Error(
                        `Azure ARM ${method} returned 202 without a polling location for ${resourceId}`,
                    );
                }
                const completed = await this.pollLongRunningOperation(
                    method,
                    resourceId,
                    location,
                    asyncOperation !== undefined,
                    combined.signal,
                );
                return (method === 'DELETE' ? undefined : completed) as T;
            }
            if (response.status === 204) {
                return undefined as T;
            }
            return (await this.readJson(response, method, resourceId)) as T;
        } catch (error) {
            if (
                error instanceof AzureRequestError ||
                (error instanceof Error &&
                    error.message.startsWith('Azure ARM '))
            ) {
                throw error;
            }
            throw this.safeTransportError(method, resourceId, error);
        } finally {
            combined.dispose();
        }
    }

    private async pollLongRunningOperation(
        method: 'PUT' | 'DELETE',
        resourceId: string,
        location: string,
        asyncOperation: boolean,
        signal: AbortSignal,
    ): Promise<unknown> {
        const operationUrl = trustedOperationUrl(location);
        for (;;) {
            const token = await this.token(signal);
            const response = await this.fetchImpl(operationUrl, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
                signal,
            });
            if (response.status === 202) {
                await waitForPoll(signal);
                continue;
            }
            if (!response.ok) {
                throw new AzureRequestError(
                    method,
                    resourceId,
                    response.status,
                );
            }
            if (response.status === 204) {
                if (asyncOperation) return undefined;
                return undefined;
            }
            const body = await this.readJson(response, method, resourceId);
            const status = this.operationStatus(body);
            if (
                status === 'succeeded' ||
                status === 'success' ||
                status === 'completed'
            ) {
                return body;
            }
            if (
                status === 'failed' ||
                status === 'canceled' ||
                status === 'cancelled'
            ) {
                throw new Error(
                    `Azure ARM ${method} operation ${status} for ${resourceId}`,
                );
            }
            if (
                status === 'inprogress' ||
                status === 'running' ||
                status === 'accepted' ||
                status === 'notstarted' ||
                status === 'queued'
            ) {
                await waitForPoll(signal);
                continue;
            }
            if (body === undefined) return body;
            if (!asyncOperation && status === undefined) return body;
            throw new Error(
                `Azure ARM ${method} returned an unknown operation status for ${resourceId}`,
            );
        }
    }

    private async readJson(
        response: Response,
        method: 'GET' | 'PUT' | 'DELETE',
        resourceId: string,
    ): Promise<unknown> {
        const text = await response.text();
        if (!text.trim()) return undefined;
        try {
            return JSON.parse(text) as unknown;
        } catch (error) {
            throw new Error(
                `Azure ARM ${method} returned invalid JSON for ${resourceId}`,
                { cause: error },
            );
        }
    }

    private operationStatus(body: unknown): string | undefined {
        if (
            typeof body !== 'object' ||
            body === null ||
            typeof (body as { status?: unknown }).status !== 'string'
        ) {
            return undefined;
        }
        return (body as { status: string }).status
            .toLowerCase()
            .replace(/[\s_-]+/g, '');
    }

    private async token(signal: AbortSignal): Promise<string> {
        let removeAbortListener = (): void => undefined;
        const tokenPromise = Promise.resolve().then(() =>
            this.credential.getToken(ARM_SCOPE, { abortSignal: signal }),
        );
        const abortPromise = new Promise<never>((_resolve, reject) => {
            const abort = (): void => {
                const error = new Error(
                    'Azure ARM credential acquisition aborted',
                );
                error.name = 'AbortError';
                reject(error);
            };
            if (signal.aborted) {
                abort();
                return;
            }
            signal.addEventListener('abort', abort, { once: true });
            removeAbortListener = () =>
                signal.removeEventListener('abort', abort);
        });
        try {
            const accessToken = await Promise.race([
                tokenPromise,
                abortPromise,
            ]);
            if (
                !accessToken?.token ||
                accessToken.expiresOnTimestamp <= Date.now()
            ) {
                throw new Error('Azure ARM credential returned no valid token');
            }
            return accessToken.token;
        } finally {
            removeAbortListener();
            void tokenPromise.catch(() => undefined);
        }
    }

    private safeTransportError(
        operation: string,
        resourceId: string,
        error: unknown,
    ): Error {
        if (error instanceof Error && error.name === 'AbortError') {
            return new Error(
                `Azure ARM ${operation} timed out for ${resourceId}`,
                { cause: error },
            );
        }
        return new Error(`Azure ARM ${operation} failed for ${resourceId}`, {
            cause: error,
        });
    }
}

class BlobControlStateClient implements BlobControlState {
    constructor(
        private readonly container: ContainerClient,
        private readonly prefix: string,
    ) {}

    async acquireLease(
        blobName: string,
        durationSeconds = DEFAULT_LEASE_SECONDS,
        signal?: AbortSignal,
        initialValue?: unknown,
    ): Promise<BlobLease> {
        if (durationSeconds < 15 || durationSeconds > 60) {
            throw new Error(
                'Blob lease duration must be between 15 and 60 seconds',
            );
        }
        const blob = this.blob(blobName);
        let created = false;
        try {
            const serializedInitialValue =
                JSON.stringify(initialValue ?? {}) ?? '{}';
            await blob.uploadData(Buffer.from(serializedInitialValue), {
                conditions: { ifNoneMatch: '*' },
                abortSignal: signal,
            });
            created = true;
        } catch (error) {
            if (!this.isStatus(error, 409) && !this.isStatus(error, 412)) {
                throw error;
            }
        }
        const leaseClient = blob.getBlobLeaseClient();
        const response = await leaseClient.acquireLease(durationSeconds, {
            abortSignal: signal,
        });
        if (!response.leaseId) {
            throw new Error(
                `Blob lease acquisition returned no lease ID for ${blobName}`,
            );
        }
        return {
            leaseId: response.leaseId,
            created,
            release: async (releaseSignal?: AbortSignal) => {
                await blob
                    .getBlobLeaseClient(response.leaseId)
                    .releaseLease({ abortSignal: releaseSignal });
            },
        };
    }

    async loadJson<T>(
        blobName: string,
        _leaseId?: string,
        signal?: AbortSignal,
    ): Promise<T | undefined> {
        const blob = this.blob(blobName);
        try {
            const data = await blob.downloadToBuffer(0, undefined, {
                abortSignal: signal,
            });
            return JSON.parse(data.toString('utf8')) as T;
        } catch (error) {
            if (this.isStatus(error, 404)) {
                return undefined;
            }
            throw error;
        }
    }

    async saveJson<T>(
        blobName: string,
        value: T,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void> {
        const blob = this.blob(blobName);
        await blob.uploadData(Buffer.from(JSON.stringify(value)), {
            conditions: leaseId ? { leaseId } : undefined,
            abortSignal: signal,
        });
    }

    private blob(name: string): BlockBlobClient {
        return this.container.getBlockBlobClient(
            resourcePath(this.prefix, name),
        );
    }

    private isStatus(error: unknown, status: number): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const candidate = error as { statusCode?: number; status?: number };
        return candidate.statusCode === status || candidate.status === status;
    }
}

export function createAzureCredential(
    options: {
        clientId?: string;
        mode?: AzureCredentialMode;
        credential?: AzureTokenCredential;
    } = {},
): AzureTokenCredential {
    return asCredential(
        options.credential,
        options.mode ?? 'managed-identity',
        options.clientId,
    );
}

export function createAzureMaintenanceClients(
    options: AzureClientOptions,
): AzureMaintenanceClients {
    const credential = createAzureCredential({
        clientId: options.clientId,
        credential: options.credential,
        mode: options.credentialMode,
    });
    const service =
        options.blobServiceClient ??
        new BlobServiceClient(
            `https://${validateStorageAccount(options.storageAccount)}.blob.core.windows.net`,
            credential as never,
        );
    const container = service.getContainerClient(
        validateContainer(options.controlContainer),
    );
    return {
        arm: new FetchArmClient(
            credential,
            options.fetchImpl ?? fetch,
            options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        ),
        control: new BlobControlStateClient(
            container,
            options.controlPrefix ?? 'firewall',
        ),
    };
}

export function createAzureMaintenanceClientsFromEnv(
    env: NodeJS.ProcessEnv = process.env,
    overrides: Partial<AzureClientOptions> = {},
): AzureMaintenanceClients {
    return createAzureMaintenanceClients({
        ...overrides,
        storageAccount:
            overrides.storageAccount ??
            required(env.AZURE_STORAGE_ACCOUNT, 'AZURE_STORAGE_ACCOUNT'),
        controlContainer:
            overrides.controlContainer ??
            required(env.AZURE_CONTROL_CONTAINER, 'AZURE_CONTROL_CONTAINER'),
        clientId:
            overrides.clientId ??
            required(env.AZURE_CLIENT_ID, 'AZURE_CLIENT_ID'),
    });
}

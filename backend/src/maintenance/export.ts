import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob';
import { Logger } from '@nestjs/common';

import {
    buildDatabaseOptions,
    POSTGRES_ENTRA_SCOPE,
} from '../database/database.config';
import { type AzureTokenCredential, createAzureCredential } from './azure';

export const EXPORT_LEASE_BLOB = 'exports/lease';
export const EXPORT_LEASE_SECONDS = 60;
export const EXPORT_LEASE_RENEW_INTERVAL_MS = 20_000;
export const EXPORT_RETENTION_COUNT = 2;
export const EXPORT_INCOMPLETE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const EXPORT_COMMAND_TIMEOUT_MS = 600_000;
// Fallback cap for test/custom stores that only expose Buffer methods. The
// Azure store uses uploadFile/verifyBlob streams and has no artificial dump
// size limit; move other stores to those methods before accepting large dumps.
export const EXPORT_MAX_DUMP_BYTES = 256 * 1024 * 1024;

const MAX_COMMAND_OUTPUT_BYTES = 8 * 1024 * 1024;
const POSTGRES_TOKEN_TIMEOUT_MS = 5_000;
const REQUEST_MARKER_ENV_NAMES = [
    'CIRI_EXPORT_REQUEST_MARKER',
    'EXPORT_REQUEST_MARKER',
] as const;

export interface ExportBlobInfo {
    name: string;
    lastModified?: Date;
}

export interface RenewableExportLease {
    leaseId: string;
    renew(signal?: AbortSignal): Promise<void>;
    release(signal?: AbortSignal): Promise<void>;
}

export interface ExportBlobStore {
    acquireLease(
        blobName: string,
        durationSeconds?: number,
        signal?: AbortSignal,
    ): Promise<RenewableExportLease>;
    upload(
        blobName: string,
        value: Buffer,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void>;
    uploadFile?(
        blobName: string,
        filePath: string,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void>;
    download(blobName: string, signal?: AbortSignal): Promise<Buffer>;
    verifyBlob?(
        blobName: string,
        sizeBytes: number,
        sha256: string,
        signal?: AbortSignal,
    ): Promise<boolean>;
    list(prefix: string, signal?: AbortSignal): Promise<ExportBlobInfo[]>;
    delete(
        blobName: string,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void>;
}

export interface ExportCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface ExportCommandRunner {
    run(
        command: string,
        args: string[],
        options: { env: NodeJS.ProcessEnv; signal: AbortSignal },
    ): Promise<ExportCommandResult>;
}

export interface ExportManifest {
    completed_at: string;
    postgres_version: string;
    migration_version: string;
    image_digest: string;
    size_bytes: number;
    sha256: string;
    dump_blob: string;
    contents_blob: string;
    hash_blob: string;
    request_marker?: string;
}

export interface ExportRunResult {
    manifest: ExportManifest;
    cleanupFailures: string[];
}

export interface ExportMetadata {
    postgresVersion?: string;
    migrationVersion?: string;
    imageDigest?: string;
}

export interface ExportRunOptions {
    env?: NodeJS.ProcessEnv;
    store: ExportBlobStore;
    runner?: ExportCommandRunner;
    now?: () => Date;
    id?: () => string;
    metadata?: ExportMetadata;
    requestMarker?: string;
    commandTimeoutMs?: number;
}

interface LeaseState {
    lease: RenewableExportLease;
    abortController: AbortController;
    renewalFailure?: unknown;
    timer: NodeJS.Timeout;
}

interface StoredManifest extends ExportManifest {
    _prefix: string;
}

interface ManifestScan {
    manifests: StoredManifest[];
    unreadablePrefixes: Set<string>;
}

function required(value: string | undefined, name: string): string {
    const normalized = value?.trim();
    if (!normalized) {
        throw new Error(`${name} is required`);
    }
    return normalized;
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

function isAlreadyExists(error: unknown): boolean {
    const status = statusOf(error);
    return status === 409 || status === 412;
}

function sanitizeId(value: string): string {
    const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, '-');
    return normalized.slice(0, 80) || 'run';
}

function digest(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function json(value: unknown): Buffer {
    return Buffer.from(JSON.stringify(value), 'utf8');
}

async function readCappedFile(
    path: string,
    maxBytes = EXPORT_MAX_DUMP_BYTES,
): Promise<Buffer> {
    const file = await open(path, 'r');
    try {
        const initial = await file.stat();
        if (!Number.isSafeInteger(initial.size) || initial.size > maxBytes) {
            throw new Error(
                `pg_dump output exceeds the ${maxBytes} byte export limit`,
            );
        }
        const value = Buffer.alloc(initial.size);
        let offset = 0;
        while (offset < value.length) {
            const result = await file.read(
                value,
                offset,
                value.length - offset,
            );
            if (result.bytesRead === 0) {
                throw new Error('pg_dump output changed while it was read');
            }
            offset += result.bytesRead;
        }
        const final = await file.stat();
        if (final.size !== initial.size) {
            throw new Error('pg_dump output changed while it was read');
        }
        return value;
    } finally {
        await file.close();
    }
}

async function hashFile(
    path: string,
): Promise<{ sizeBytes: number; sha256: string }> {
    const initial = await stat(path);
    if (!Number.isSafeInteger(initial.size) || initial.size <= 0) {
        throw new Error('pg_dump produced an empty or invalid dump');
    }
    const hash = createHash('sha256');
    let sizeBytes = 0;
    for await (const chunk of createReadStream(path)) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sizeBytes += value.length;
        hash.update(value);
    }
    const final = await stat(path);
    if (final.size !== initial.size || sizeBytes !== initial.size) {
        throw new Error('pg_dump output changed while it was read');
    }
    return { sizeBytes, sha256: hash.digest('hex') };
}

function ensureBufferLimit(value: Buffer, label: string): void {
    if (value.length > EXPORT_MAX_DUMP_BYTES) {
        throw new Error(
            `${label} exceeds the ${EXPORT_MAX_DUMP_BYTES} byte export limit`,
        );
    }
}

async function verifyDumpBlob(
    store: ExportBlobStore,
    blobName: string,
    sizeBytes: number,
    sha256: string,
    signal?: AbortSignal,
): Promise<boolean> {
    if (store.verifyBlob) {
        return store.verifyBlob(blobName, sizeBytes, sha256, signal);
    }
    const remoteDump = await store.download(blobName, signal);
    ensureBufferLimit(remoteDump, 'Remote dump');
    return remoteDump.length === sizeBytes && digest(remoteDump) === sha256;
}

function readRequestMarker(
    env: NodeJS.ProcessEnv,
    explicit?: string,
): string | undefined {
    if (explicit?.trim()) return explicit.trim();
    for (const name of REQUEST_MARKER_ENV_NAMES) {
        if (env[name]?.trim()) return env[name].trim();
    }
    return undefined;
}

function commandFailure(
    command: string,
    result: ExportCommandResult,
): Error | undefined {
    if (result.exitCode === 0) return undefined;
    const detail = result.stderr.trim().slice(0, 300);
    return new Error(
        `${command} failed with exit code ${result.exitCode}${detail ? `: ${detail}` : ''}`,
    );
}

function makePgEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const options = buildDatabaseOptions(env);
    const result: NodeJS.ProcessEnv = {
        ...env,
        PGHOST: options.host,
        PGPORT: String(options.port),
        PGUSER: options.username,
        PGDATABASE: options.database,
    };
    if (typeof options.password === 'string') {
        result.PGPASSWORD = options.password;
    } else {
        delete result.PGPASSWORD;
    }
    const authMode = env.POSTGRES_AUTH_MODE ?? 'password';
    const sslMode = env.POSTGRES_SSL_MODE ?? 'disable';
    if (sslMode === 'verify-full') {
        result.PGSSLMODE = 'verify-full';
        result.PGSSLROOTCERT = env.POSTGRES_SSL_CA_FILE?.trim() || 'system';
    } else {
        delete result.PGSSLMODE;
        delete result.PGSSLROOTCERT;
    }
    if (authMode === 'entra') delete result.POSTGRES_PASSWORD;
    return result;
}

function createDefaultRunner(env: NodeJS.ProcessEnv): ExportCommandRunner {
    const commandEnvironment = async (
        commandEnv: NodeJS.ProcessEnv,
        signal: AbortSignal,
    ): Promise<NodeJS.ProcessEnv> => {
        if (env.POSTGRES_AUTH_MODE !== 'entra') return commandEnv;
        if (env.POSTGRES_PASSWORD?.trim()) {
            throw new Error('POSTGRES_PASSWORD must be omitted in Entra mode');
        }
        // Each child process receives a fresh callback/token pair. pg_dump and
        // pg_restore do not share a connection or a password callback.
        const credential: AzureTokenCredential = createAzureCredential({
            clientId: required(env.AZURE_CLIENT_ID, 'AZURE_CLIENT_ID'),
        });
        const tokenSignal = AbortSignal.any([
            signal,
            AbortSignal.timeout(POSTGRES_TOKEN_TIMEOUT_MS),
        ]);
        const token = await credential.getToken(POSTGRES_ENTRA_SCOPE, {
            abortSignal: tokenSignal,
        });
        if (
            !token?.token ||
            !Number.isFinite(token.expiresOnTimestamp) ||
            token.expiresOnTimestamp <= Date.now() + 30_000
        ) {
            throw new Error('PostgreSQL Entra token missing or expired');
        }
        const result: NodeJS.ProcessEnv = {
            ...commandEnv,
            PGPASSWORD: token.token,
        };
        delete result.POSTGRES_PASSWORD;
        return result;
    };
    return {
        run: async (command, args, options) => {
            const commandEnv = await commandEnvironment(
                options.env,
                options.signal,
            );
            return new Promise<ExportCommandResult>((resolve, reject) => {
                const child = spawn(command, args, {
                    env: commandEnv,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true,
                });
                let stdout = '';
                let stderr = '';
                const append = (current: string, chunk: Buffer): string => {
                    if (
                        Buffer.byteLength(current) >= MAX_COMMAND_OUTPUT_BYTES
                    ) {
                        return current;
                    }
                    return (
                        current +
                        chunk
                            .subarray(
                                0,
                                MAX_COMMAND_OUTPUT_BYTES -
                                    Buffer.byteLength(current),
                            )
                            .toString('utf8')
                    );
                };
                child.stdout?.on('data', (chunk: Buffer) => {
                    stdout = append(stdout, chunk);
                });
                child.stderr?.on('data', (chunk: Buffer) => {
                    stderr = append(stderr, chunk);
                });
                const abort = (): void => {
                    child.kill();
                };
                if (options.signal.aborted) abort();
                else
                    options.signal.addEventListener('abort', abort, {
                        once: true,
                    });
                child.once('error', reject);
                child.once('close', (code) => {
                    options.signal.removeEventListener('abort', abort);
                    resolve({ exitCode: code ?? 1, stdout, stderr });
                });
            });
        },
    };
}

class AzureExportBlobStore implements ExportBlobStore {
    constructor(private readonly container: ContainerClient) {}

    async acquireLease(
        blobName: string,
        durationSeconds = EXPORT_LEASE_SECONDS,
        signal?: AbortSignal,
    ): Promise<RenewableExportLease> {
        if (durationSeconds < 15 || durationSeconds > 60) {
            throw new Error(
                'Blob lease duration must be between 15 and 60 seconds',
            );
        }
        const blob = this.container.getBlockBlobClient(blobName);
        try {
            await blob.uploadData(Buffer.from('{}'), {
                conditions: { ifNoneMatch: '*' },
                abortSignal: signal,
            });
        } catch (error) {
            if (!isAlreadyExists(error)) throw error;
        }
        const leaseClient = blob.getBlobLeaseClient();
        const response = await leaseClient.acquireLease(durationSeconds, {
            abortSignal: signal,
        });
        if (!response.leaseId) {
            throw new Error(`Export lease returned no ID for ${blobName}`);
        }
        const leaseId = response.leaseId;
        return {
            leaseId,
            renew: async (renewSignal?: AbortSignal) => {
                await blob
                    .getBlobLeaseClient(leaseId)
                    .renewLease({ abortSignal: renewSignal });
            },
            release: async (releaseSignal?: AbortSignal) => {
                await blob
                    .getBlobLeaseClient(leaseId)
                    .releaseLease({ abortSignal: releaseSignal });
            },
        };
    }

    async upload(
        blobName: string,
        value: Buffer,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void> {
        ensureBufferLimit(value, 'Export blob');
        // Azure Blob leases are scoped to one blob; the export lease blob
        // serializes the run, while run blobs cannot accept that lease ID.
        await this.container.getBlockBlobClient(blobName).uploadData(value, {
            conditions:
                blobName === EXPORT_LEASE_BLOB && leaseId
                    ? { leaseId }
                    : undefined,
            abortSignal: signal,
        });
    }

    async uploadFile(
        blobName: string,
        filePath: string,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void> {
        await this.container.getBlockBlobClient(blobName).uploadFile(filePath, {
            conditions:
                blobName === EXPORT_LEASE_BLOB && leaseId
                    ? { leaseId }
                    : undefined,
            abortSignal: signal,
        });
    }

    async download(blobName: string, signal?: AbortSignal): Promise<Buffer> {
        const blob = this.container.getBlockBlobClient(blobName);
        if (typeof blob.getProperties === 'function') {
            const properties = await blob.getProperties({
                abortSignal: signal,
            });
            if (
                properties.contentLength !== undefined &&
                properties.contentLength > EXPORT_MAX_DUMP_BYTES
            ) {
                throw new Error(
                    `${blobName} exceeds the ${EXPORT_MAX_DUMP_BYTES} byte export limit`,
                );
            }
        }
        const value = await blob.downloadToBuffer(0, undefined, {
            abortSignal: signal,
        });
        ensureBufferLimit(value, blobName);
        return value;
    }

    async verifyBlob(
        blobName: string,
        sizeBytes: number,
        sha256: string,
        signal?: AbortSignal,
    ): Promise<boolean> {
        const response = await this.container
            .getBlockBlobClient(blobName)
            .download(0, undefined, { abortSignal: signal });
        const stream = response.readableStreamBody;
        if (!stream) throw new Error(`${blobName} returned no readable body`);
        const hash = createHash('sha256');
        let downloaded = 0;
        for await (const chunk of stream as AsyncIterable<Buffer | string>) {
            const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            downloaded += value.length;
            hash.update(value);
        }
        return downloaded === sizeBytes && hash.digest('hex') === sha256;
    }

    async list(
        prefix: string,
        signal?: AbortSignal,
    ): Promise<ExportBlobInfo[]> {
        const result: ExportBlobInfo[] = [];
        for await (const item of this.container.listBlobsFlat({
            prefix,
            abortSignal: signal,
        })) {
            if (signal?.aborted) {
                throw signal.reason ?? new Error('Export operation aborted');
            }
            result.push({
                name: item.name,
                lastModified: item.properties.lastModified,
            });
        }
        return result;
    }

    async delete(
        blobName: string,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void> {
        await this.container.getBlockBlobClient(blobName).deleteIfExists({
            conditions:
                blobName === EXPORT_LEASE_BLOB && leaseId
                    ? { leaseId }
                    : undefined,
            abortSignal: signal,
        });
    }
}

export function createExportBlobStoreFromEnv(
    env: NodeJS.ProcessEnv = process.env,
    overrides: {
        storageAccount?: string;
        container?: string;
        clientId?: string;
        credential?: AzureTokenCredential;
        blobServiceClient?: BlobServiceClient;
    } = {},
): ExportBlobStore {
    const storageAccount = required(
        overrides.storageAccount ?? env.AZURE_STORAGE_ACCOUNT,
        'AZURE_STORAGE_ACCOUNT',
    );
    if (!/^[a-z0-9]{3,24}$/.test(storageAccount)) {
        throw new Error(
            'AZURE_STORAGE_ACCOUNT must be a valid storage account name',
        );
    }
    const containerName = required(
        overrides.container ?? env.AZURE_EXPORTS_CONTAINER,
        'AZURE_EXPORTS_CONTAINER',
    );
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(containerName)) {
        throw new Error(
            'AZURE_EXPORTS_CONTAINER must be a valid blob container name',
        );
    }
    const credential =
        overrides.credential ??
        createAzureCredential({
            clientId:
                overrides.clientId ??
                required(env.AZURE_CLIENT_ID, 'AZURE_CLIENT_ID'),
        });
    const service =
        overrides.blobServiceClient ??
        new BlobServiceClient(
            `https://${storageAccount}.blob.core.windows.net`,
            credential as never,
        );
    return new AzureExportBlobStore(service.getContainerClient(containerName));
}

export async function readExportJson<T>(
    store: ExportBlobStore,
    blobName: string,
    signal?: AbortSignal,
): Promise<T | undefined> {
    try {
        return JSON.parse(
            (await store.download(blobName, signal)).toString('utf8'),
        ) as T;
    } catch (error) {
        if (signal?.aborted) throw error;
        if (isNotFound(error)) return undefined;
        throw error;
    }
}

async function queryMetadata(
    runner: ExportCommandRunner,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal,
): Promise<{ postgresVersion: string; migrationVersion: string }> {
    const pgEnv = makePgEnvironment(env);
    const postgres = await runner.run(
        'psql',
        [
            '--no-psqlrc',
            '--tuples-only',
            '--no-align',
            '--command',
            'SHOW server_version',
        ],
        { env: pgEnv, signal },
    );
    const postgresFailure = commandFailure(
        'psql server version query',
        postgres,
    );
    if (postgresFailure) throw postgresFailure;
    const migration = await runner.run(
        'psql',
        [
            '--no-psqlrc',
            '--tuples-only',
            '--no-align',
            '--command',
            'SELECT COALESCE(MAX("timestamp")::text, \'\') FROM "migrations"',
        ],
        { env: pgEnv, signal },
    );
    const migrationFailure = commandFailure(
        'psql migration version query',
        migration,
    );
    if (migrationFailure) throw migrationFailure;
    return {
        postgresVersion: required(postgres.stdout.trim(), 'postgres version'),
        migrationVersion: required(
            migration.stdout.trim(),
            'migration version',
        ),
    };
}

function beginLeaseRenewal(
    lease: RenewableExportLease,
    abortController: AbortController,
): LeaseState {
    const state: LeaseState = {
        lease,
        abortController,
        timer: setInterval(() => {
            void lease.renew(abortController.signal).catch((error: unknown) => {
                state.renewalFailure = error;
                abortController.abort(error);
            });
        }, EXPORT_LEASE_RENEW_INTERVAL_MS),
    };
    state.timer.unref?.();
    return state;
}

function endLeaseRenewal(state: LeaseState): void {
    clearInterval(state.timer);
    if (state.renewalFailure) {
        throw new Error('Export lease renewal failed', {
            cause: state.renewalFailure,
        });
    }
}

export function validateExportManifest(
    value: unknown,
): value is ExportManifest {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<ExportManifest>;
    return (
        typeof candidate.completed_at === 'string' &&
        /Z$/i.test(candidate.completed_at) &&
        !Number.isNaN(Date.parse(candidate.completed_at)) &&
        typeof candidate.postgres_version === 'string' &&
        candidate.postgres_version.length > 0 &&
        typeof candidate.migration_version === 'string' &&
        candidate.migration_version.length > 0 &&
        typeof candidate.image_digest === 'string' &&
        /^(?:[a-z0-9./_-]+@)?sha256:[a-f0-9]{64}$/.test(
            candidate.image_digest,
        ) &&
        typeof candidate.size_bytes === 'number' &&
        Number.isSafeInteger(candidate.size_bytes) &&
        candidate.size_bytes > 0 &&
        typeof candidate.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(candidate.sha256) &&
        typeof candidate.dump_blob === 'string' &&
        isExportBlobPath(candidate.dump_blob) &&
        typeof candidate.contents_blob === 'string' &&
        isExportBlobPath(candidate.contents_blob) &&
        typeof candidate.hash_blob === 'string' &&
        isExportBlobPath(candidate.hash_blob) &&
        (candidate.request_marker === undefined ||
            (typeof candidate.request_marker === 'string' &&
                candidate.request_marker.length > 0))
    );
}

function isExportBlobPath(value: string): boolean {
    return (
        value.startsWith('exports/') &&
        !value.includes('\\') &&
        !value.split('/').includes('..') &&
        !value.endsWith('/')
    );
}

function prefixFromBlobName(name: string): string | undefined {
    const match = /^(exports\/\d+-[^/]+)\//.exec(name);
    return match?.[1];
}

function timestampFromPrefix(prefix: string): number | undefined {
    const match = /^exports\/(\d+)-/.exec(prefix);
    if (!match) return undefined;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) ? value : undefined;
}

async function validManifests(
    store: ExportBlobStore,
    entries: ExportBlobInfo[],
    signal?: AbortSignal,
): Promise<ManifestScan> {
    const manifests: StoredManifest[] = [];
    const unreadablePrefixes = new Set<string>();
    for (const entry of entries) {
        if (!entry.name.endsWith('/manifest.json')) continue;
        const prefix = prefixFromBlobName(entry.name);
        if (!prefix) continue;
        let manifest: ExportManifest | undefined;
        try {
            manifest = await readExportJson<ExportManifest>(
                store,
                entry.name,
                signal,
            );
        } catch (error) {
            if (signal?.aborted) throw error;
            unreadablePrefixes.add(prefix);
            continue;
        }
        if (!manifest || !validateExportManifest(manifest)) continue;
        if (
            ![
                manifest.dump_blob,
                manifest.contents_blob,
                manifest.hash_blob,
            ].every((blobName) => blobName.startsWith(`${prefix}/`))
        ) {
            continue;
        }
        try {
            if (
                !(await verifyExportManifestForRetention(
                    store,
                    manifest,
                    signal,
                ))
            ) {
                continue;
            }
        } catch (error) {
            if (signal?.aborted) throw error;
            unreadablePrefixes.add(prefix);
            continue;
        }
        manifests.push({ ...manifest, _prefix: prefix });
    }
    return {
        manifests: manifests.sort(
            (left, right) =>
                Date.parse(right.completed_at) - Date.parse(left.completed_at),
        ),
        unreadablePrefixes,
    };
}

export async function verifyExportManifest(
    store: ExportBlobStore,
    manifest: ExportManifest,
    signal?: AbortSignal,
): Promise<boolean> {
    if (
        !validateExportManifest(manifest) ||
        ![manifest.dump_blob, manifest.contents_blob, manifest.hash_blob].every(
            (blobName) => isExportBlobPath(blobName),
        )
    ) {
        return false;
    }
    try {
        if (
            !(await verifyDumpBlob(
                store,
                manifest.dump_blob,
                manifest.size_bytes,
                manifest.sha256,
                signal,
            ))
        ) {
            return false;
        }
        const remoteContents = await store.download(
            manifest.contents_blob,
            signal,
        );
        ensureBufferLimit(remoteContents, 'Remote contents');
        if (remoteContents.length === 0) return false;
        const remoteHash = await store.download(manifest.hash_blob, signal);
        ensureBufferLimit(remoteHash, 'Remote hash');
        return remoteHash.toString('utf8').trim() === manifest.sha256;
    } catch (error) {
        if (signal?.aborted) throw error;
        return false;
    }
}

async function verifyExportManifestForRetention(
    store: ExportBlobStore,
    manifest: ExportManifest,
    signal?: AbortSignal,
): Promise<boolean> {
    if (!validateExportManifest(manifest)) return false;
    if (
        !(await verifyDumpBlob(
            store,
            manifest.dump_blob,
            manifest.size_bytes,
            manifest.sha256,
            signal,
        ))
    ) {
        return false;
    }
    const remoteContents = await store.download(manifest.contents_blob, signal);
    ensureBufferLimit(remoteContents, 'Remote contents');
    if (remoteContents.length === 0) return false;
    const remoteHash = await store.download(manifest.hash_blob, signal);
    ensureBufferLimit(remoteHash, 'Remote hash');
    return remoteHash.toString('utf8').trim() === manifest.sha256;
}

/**
 * Check only the small completion metadata blobs. The exporter already read
 * the dump back before publishing this manifest; the checker must not stream
 * a potentially multi-gigabyte dump inside its 55-second budget.
 */
export async function verifyExportManifestMetadata(
    store: ExportBlobStore,
    manifest: ExportManifest,
    signal?: AbortSignal,
): Promise<boolean> {
    if (!validateExportManifest(manifest)) return false;
    try {
        const remoteContents = await store.download(
            manifest.contents_blob,
            signal,
        );
        ensureBufferLimit(remoteContents, 'Remote contents');
        if (remoteContents.length === 0) return false;
        const remoteHash = await store.download(manifest.hash_blob, signal);
        ensureBufferLimit(remoteHash, 'Remote hash');
        return remoteHash.toString('utf8').trim() === manifest.sha256;
    } catch (error) {
        if (signal?.aborted) throw error;
        return false;
    }
}

async function retainCompletedExports(
    store: ExportBlobStore,
    currentPrefix: string,
    now: Date,
    signal?: AbortSignal,
): Promise<string[]> {
    const entries = await store.list('exports/', signal);
    const failures: string[] = [];
    const scan = await validManifests(store, entries, signal);
    const manifests = scan.manifests;
    const keep = new Set(
        manifests
            .slice(0, EXPORT_RETENTION_COUNT)
            .map((manifest) => manifest._prefix),
    );
    keep.add(currentPrefix);

    const prefixes = new Set<string>();
    for (const entry of entries) {
        const prefix = prefixFromBlobName(entry.name);
        if (prefix) prefixes.add(prefix);
    }

    for (const prefix of prefixes) {
        if (keep.has(prefix)) continue;
        if (scan.unreadablePrefixes.has(prefix)) {
            failures.push(`${prefix}/manifest.json`);
            continue;
        }
        const hasManifest = manifests.some(
            (manifest) => manifest._prefix === prefix,
        );
        const timestamp = timestampFromPrefix(prefix);
        const incomplete =
            !hasManifest &&
            timestamp !== undefined &&
            now.getTime() - timestamp >= EXPORT_INCOMPLETE_RETENTION_MS;
        const oldCompleted = hasManifest;
        if (!incomplete && !oldCompleted) continue;
        const prefixEntries = entries.filter((item) =>
            item.name.startsWith(`${prefix}/`),
        );
        let prefixFailed = false;
        for (const entry of prefixEntries.filter(
            (item) => item.name !== `${prefix}/manifest.json`,
        )) {
            try {
                await store.delete(entry.name, undefined, signal);
            } catch (error) {
                if (signal?.aborted) throw error;
                prefixFailed = true;
                failures.push(entry.name);
            }
        }
        if (hasManifest && !prefixFailed) {
            try {
                await store.delete(
                    `${prefix}/manifest.json`,
                    undefined,
                    signal,
                );
            } catch (error) {
                if (signal?.aborted) throw error;
                failures.push(`${prefix}/manifest.json`);
            }
        }
    }
    return failures;
}

export async function runExport(
    options: ExportRunOptions,
): Promise<ExportRunResult> {
    const env = options.env ?? process.env;
    const now = options.now ?? (() => new Date());
    const id =
        options.id ??
        (() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    const metadata = options.metadata ?? {};
    const requestMarker = readRequestMarker(env, options.requestMarker);
    const imageDigest = required(
        metadata.imageDigest ?? env.TOOLS_IMAGE_DIGEST,
        'TOOLS_IMAGE_DIGEST',
    );
    if (!/^(?:[a-z0-9./_-]+@)?sha256:[a-f0-9]{64}$/.test(imageDigest)) {
        throw new Error('TOOLS_IMAGE_DIGEST must be an immutable digest');
    }
    const runner = options.runner ?? createDefaultRunner(env);
    const pgEnv = makePgEnvironment(env);
    const timeout = options.commandTimeoutMs ?? EXPORT_COMMAND_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout <= 0) {
        throw new Error('Export command timeout must be a positive integer');
    }

    const lease = await options.store.acquireLease(
        EXPORT_LEASE_BLOB,
        EXPORT_LEASE_SECONDS,
        AbortSignal.timeout(timeout),
    );
    const abortController = new AbortController();
    const renewal = beginLeaseRenewal(lease, abortController);
    const workDir = await mkdtemp(join(tmpdir(), 'ciri-export-'));
    const dumpPath = join(workDir, 'database.dump');
    const prefix = `exports/${now().getTime()}-${sanitizeId(requestMarker ?? id())}`;
    const dumpBlob = `${prefix}/database.dump`;
    const contentsBlob = `${prefix}/contents.txt`;
    const hashBlob = `${prefix}/sha256.txt`;
    const manifestBlob = `${prefix}/manifest.json`;
    const commandSignal = AbortSignal.any([
        abortController.signal,
        AbortSignal.timeout(timeout),
    ]);

    try {
        const dump = await runner.run(
            'pg_dump',
            ['--format=custom', '--no-owner', '--no-acl', '--file', dumpPath],
            { env: pgEnv, signal: commandSignal },
        );
        const dumpFailure = commandFailure('pg_dump', dump);
        if (dumpFailure) throw dumpFailure;
        const dumpInfo = await hashFile(dumpPath);

        const listing = await runner.run('pg_restore', ['--list', dumpPath], {
            env: pgEnv,
            signal: commandSignal,
        });
        const listingFailure = commandFailure('pg_restore --list', listing);
        if (listingFailure) throw listingFailure;
        const contents = Buffer.from(listing.stdout, 'utf8');
        if (contents.length === 0) {
            throw new Error('pg_restore --list produced no contents');
        }

        const sha256 = dumpInfo.sha256;
        if (options.store.uploadFile) {
            await options.store.uploadFile(
                dumpBlob,
                dumpPath,
                renewal.lease.leaseId,
                commandSignal,
            );
        } else {
            const dumpBytes = await readCappedFile(dumpPath);
            if (
                dumpBytes.length !== dumpInfo.sizeBytes ||
                digest(dumpBytes) !== dumpInfo.sha256
            ) {
                throw new Error('pg_dump output changed while it was read');
            }
            await options.store.upload(
                dumpBlob,
                dumpBytes,
                renewal.lease.leaseId,
                commandSignal,
            );
        }
        await options.store.upload(
            contentsBlob,
            contents,
            renewal.lease.leaseId,
            commandSignal,
        );
        await options.store.upload(
            hashBlob,
            Buffer.from(`${sha256}\n`),
            renewal.lease.leaseId,
            commandSignal,
        );

        if (
            !(await verifyDumpBlob(
                options.store,
                dumpBlob,
                dumpInfo.sizeBytes,
                sha256,
                commandSignal,
            ))
        ) {
            throw new Error(
                'Export dump read-back checksum verification failed',
            );
        }
        const remoteContents = await options.store.download(
            contentsBlob,
            commandSignal,
        );
        ensureBufferLimit(remoteContents, 'Remote contents');
        if (!remoteContents.equals(contents)) {
            throw new Error('Export contents read-back verification failed');
        }
        const remoteHash = await options.store.download(
            hashBlob,
            commandSignal,
        );
        ensureBufferLimit(remoteHash, 'Remote hash');
        if (remoteHash.toString('utf8').trim() !== sha256) {
            throw new Error('Export hash read-back verification failed');
        }

        const queried =
            metadata.postgresVersion && metadata.migrationVersion
                ? {
                      postgresVersion: metadata.postgresVersion,
                      migrationVersion: metadata.migrationVersion,
                  }
                : await queryMetadata(runner, env, commandSignal);
        const manifest: ExportManifest = {
            completed_at: now().toISOString(),
            postgres_version: required(
                queried.postgresVersion,
                'postgres version',
            ),
            migration_version: required(
                queried.migrationVersion,
                'migration version',
            ),
            image_digest: imageDigest,
            size_bytes: dumpInfo.sizeBytes,
            sha256,
            dump_blob: dumpBlob,
            contents_blob: contentsBlob,
            hash_blob: hashBlob,
            ...(requestMarker ? { request_marker: requestMarker } : {}),
        };
        await options.store.upload(
            manifestBlob,
            json(manifest),
            renewal.lease.leaseId,
            commandSignal,
        );
        if (renewal.renewalFailure) {
            throw new Error('Export lease renewal failed', {
                cause: renewal.renewalFailure,
            });
        }
        const cleanupFailures = await retainCompletedExports(
            options.store,
            prefix,
            now(),
            commandSignal,
        );
        if (renewal.renewalFailure) {
            throw new Error('Export lease renewal failed', {
                cause: renewal.renewalFailure,
            });
        }
        return {
            manifest,
            cleanupFailures,
        };
    } finally {
        try {
            endLeaseRenewal(renewal);
        } catch {
            // The command result already checks renewalFailure before cleanup.
        }
        await renewal.lease.release().catch(() => undefined);
        await rm(workDir, { recursive: true, force: true }).catch(
            () => undefined,
        );
    }
}

export async function runExportCommand(
    env: NodeJS.ProcessEnv = process.env,
    logger = new Logger('ExportMaintenance'),
): Promise<number> {
    const store = createExportBlobStoreFromEnv(env);
    const result = await runExport({ env, store });
    if (result.cleanupFailures.length > 0) {
        logger.warn(
            `Export retention cleanup deferred for ${result.cleanupFailures.length} blob(s)`,
        );
    }
    return 0;
}

if (require.main === module) {
    const logger = new Logger('ExportMaintenance');
    void runExportCommand()
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error: unknown) => {
            logger.error(
                error instanceof Error ? error.message : 'Export failed',
            );
            process.exitCode = 1;
        });
}

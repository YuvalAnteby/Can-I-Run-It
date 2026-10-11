import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import {
    EXPORT_LEASE_BLOB,
    type ExportBlobInfo,
    type ExportBlobStore,
    type ExportCommandResult,
    type ExportCommandRunner,
    type ExportManifest,
    type RenewableExportLease,
    runExport,
} from './export';

type ErrorWithStatus = Error & { statusCode: number };

const IMAGE_DIGEST = `ciri-tools@sha256:${'a'.repeat(64)}`;
const NOW = new Date('2026-02-28T23:59:59.000Z');

function statusError(statusCode: number, message: string): ErrorWithStatus {
    return Object.assign(new Error(message), { statusCode });
}

class MemoryExportStore implements ExportBlobStore {
    readonly blobs = new Map<string, Buffer>();
    readonly uploads: string[] = [];
    readonly deletes: string[] = [];
    readonly downloaded: string[] = [];
    readonly leaseRequests: Array<{
        blobName: string;
        durationSeconds?: number;
    }> = [];
    failAcquire?: Error;
    failUploadFor = new Set<string>();
    failDeleteFor = new Set<string>();
    failDownloadFor = new Map<string, Error>();
    tamperDownloads = new Map<string, Buffer>();

    acquireLease(
        blobName: string,
        durationSeconds?: number,
        _signal?: AbortSignal,
    ): Promise<RenewableExportLease> {
        this.leaseRequests.push({ blobName, durationSeconds });
        if (this.failAcquire) throw this.failAcquire;
        return Promise.resolve({
            leaseId: 'lease-1',
            renew: () => Promise.resolve(),
            release: () => Promise.resolve(),
        });
    }

    upload(
        blobName: string,
        value: Buffer,
        _leaseId?: string,
        _signal?: AbortSignal,
    ): Promise<void> {
        if (this.failUploadFor.has(blobName)) {
            throw statusError(412, `upload conflict for ${blobName}`);
        }
        this.uploads.push(blobName);
        this.blobs.set(blobName, Buffer.from(value));
        return Promise.resolve();
    }

    download(blobName: string, _signal?: AbortSignal): Promise<Buffer> {
        this.downloaded.push(blobName);
        const failure = this.failDownloadFor.get(blobName);
        if (failure) throw failure;
        const tampered = this.tamperDownloads.get(blobName);
        if (tampered) return Promise.resolve(Buffer.from(tampered));
        const value = this.blobs.get(blobName);
        if (!value) throw statusError(404, `${blobName} is missing`);
        return Promise.resolve(Buffer.from(value));
    }

    list(prefix: string): Promise<ExportBlobInfo[]> {
        return Promise.resolve(
            [...this.blobs.keys()]
                .filter((name) => name.startsWith(prefix))
                .map((name) => ({ name })),
        );
    }

    delete(
        blobName: string,
        _leaseId?: string,
        _signal?: AbortSignal,
    ): Promise<void> {
        this.deletes.push(blobName);
        if (this.failDeleteFor.has(blobName)) {
            throw statusError(412, `delete conflict for ${blobName}`);
        }
        this.blobs.delete(blobName);
        return Promise.resolve();
    }
}

class StreamingExportStore extends MemoryExportStore {
    readonly uploadFileCalls: Array<{
        blobName: string;
        filePath: string;
        leaseId?: string;
    }> = [];
    readonly verifyBlobCalls: Array<{
        blobName: string;
        sizeBytes: number;
        sha256: string;
    }> = [];
    readonly uploadCalls: Array<{ blobName: string; leaseId?: string }> = [];

    override async upload(
        blobName: string,
        value: Buffer,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void> {
        this.uploadCalls.push({ blobName, leaseId });
        await super.upload(blobName, value, leaseId, signal);
    }

    async uploadFile(
        blobName: string,
        filePath: string,
        leaseId?: string,
        signal?: AbortSignal,
    ): Promise<void> {
        this.uploadFileCalls.push({ blobName, filePath, leaseId });
        await this.upload(blobName, await readFile(filePath), leaseId, signal);
    }

    verifyBlob(
        blobName: string,
        sizeBytes: number,
        sha256: string,
    ): Promise<boolean> {
        this.verifyBlobCalls.push({ blobName, sizeBytes, sha256 });
        const value = this.blobs.get(blobName);
        return Promise.resolve(
            value !== undefined &&
                value.length === sizeBytes &&
                createHash('sha256').update(value).digest('hex') === sha256,
        );
    }
}

function commandRunner(
    dump = Buffer.from('PGDMP\u0001portable-test-dump'),
    listing = ';; SECTION TABLE DATA\n',
): {
    runner: ExportCommandRunner;
    calls: Array<{ command: string; args: string[] }>;
} {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: ExportCommandRunner = {
        run: async (command, args): Promise<ExportCommandResult> => {
            calls.push({ command, args });
            if (command === 'pg_dump') {
                const fileIndex = args.indexOf('--file');
                await writeFile(args[fileIndex + 1], dump);
                return { exitCode: 0, stdout: '', stderr: '' };
            }
            if (command === 'pg_restore') {
                return { exitCode: 0, stdout: listing, stderr: '' };
            }
            throw new Error(`unexpected command ${command}`);
        },
    };
    return { runner, calls };
}

function manifestFor(
    prefix: string,
    completedAt: string,
    dump = Buffer.from(`dump-${prefix}`),
): { manifest: ExportManifest; blobs: Map<string, Buffer> } {
    const dumpBlob = `${prefix}/database.dump`;
    const contentsBlob = `${prefix}/contents.txt`;
    const hashBlob = `${prefix}/sha256.txt`;
    const sha256 = createHash('sha256').update(dump).digest('hex');
    const manifest: ExportManifest = {
        completed_at: completedAt,
        postgres_version: '16.4',
        migration_version: '1700000000000',
        image_digest: IMAGE_DIGEST,
        size_bytes: dump.length,
        sha256,
        dump_blob: dumpBlob,
        contents_blob: contentsBlob,
        hash_blob: hashBlob,
    };
    return {
        manifest,
        blobs: new Map([
            [dumpBlob, dump],
            [contentsBlob, Buffer.from('; contents')],
            [hashBlob, Buffer.from(`${sha256}\n`)],
            [`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest))],
        ]),
    };
}

function addManifest(
    store: MemoryExportStore,
    prefix: string,
    completedAt: string,
): void {
    const entry = manifestFor(prefix, completedAt);
    for (const [name, value] of entry.blobs) store.blobs.set(name, value);
}

function exportOptions(store: MemoryExportStore, runner: ExportCommandRunner) {
    return {
        store,
        runner,
        now: () => NOW,
        id: () => 'test-run',
        metadata: {
            postgresVersion: '16.4',
            migrationVersion: '1700000000000',
            imageDigest: IMAGE_DIGEST,
        },
        requestMarker: 'request-42',
    };
}

describe('portable database export', () => {
    it('runs a PG16 custom no-owner/no-acl dump and publishes its verified manifest', async () => {
        const store = new MemoryExportStore();
        const { runner, calls } = commandRunner();

        const result = await runExport(exportOptions(store, runner));

        expect(calls[0]?.command).toBe('pg_dump');
        expect(calls[0]?.args).toEqual(
            expect.arrayContaining([
                '--format=custom',
                '--no-owner',
                '--no-acl',
            ]),
        );
        expect(calls[1]?.command).toBe('pg_restore');
        expect(calls[1]?.args).toEqual(expect.arrayContaining(['--list']));
        expect(result.manifest).toMatchObject({
            postgres_version: '16.4',
            migration_version: '1700000000000',
            image_digest: IMAGE_DIGEST,
            request_marker: 'request-42',
        });
        expect(
            store.uploads.some((name) => name.endsWith('/manifest.json')),
        ).toBe(true);
    });

    it('does not publish a completion manifest when remote hash verification fails', async () => {
        const store = new MemoryExportStore();
        const { runner } = commandRunner();

        const dumpBlob = `exports/${NOW.getTime()}-request-42/database.dump`;
        const hashBlob = `exports/${NOW.getTime()}-request-42/sha256.txt`;
        store.tamperDownloads.set(dumpBlob, Buffer.from('tampered dump'));
        store.tamperDownloads.set(hashBlob, Buffer.from(`${'b'.repeat(64)}\n`));

        await expect(runExport(exportOptions(store, runner))).rejects.toThrow(
            /checksum verification|hash read-back verification/i,
        );
        expect(
            store.uploads.some((name) => name.endsWith('/manifest.json')),
        ).toBe(false);
    });

    it('leaves the two previously valid copies untouched when a new upload conflicts', async () => {
        const store = new MemoryExportStore();
        addManifest(
            store,
            'exports/1707000000000-older',
            '2024-02-04T00:00:00.000Z',
        );
        addManifest(
            store,
            'exports/1708000000000-newer',
            '2024-02-15T00:00:00.000Z',
        );
        const before = new Map(store.blobs);
        store.failUploadFor.add(
            'exports/1772323199000-request-42/database.dump',
        );
        const { runner } = commandRunner();

        await expect(
            runExport(exportOptions(store, runner)),
        ).rejects.toMatchObject({ statusCode: 412 });

        for (const [name, value] of before) {
            expect(store.blobs.get(name)).toEqual(value);
        }
        expect(store.deletes).not.toEqual(
            expect.arrayContaining([...before.keys()]),
        );
    });

    it('fails before starting a dump when the export lease is already held', async () => {
        const store = new MemoryExportStore();
        store.failAcquire = statusError(409, 'lease already held');
        const { runner, calls } = commandRunner();

        await expect(
            runExport(exportOptions(store, runner)),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(calls).toHaveLength(0);
    });

    it('retains the newest two valid completed sets and reports interrupted oldest deletion', async () => {
        const store = new MemoryExportStore();
        addManifest(
            store,
            'exports/1707000000000-oldest',
            '2024-02-01T00:00:00.000Z',
        );
        addManifest(
            store,
            'exports/1708000000000-middle',
            '2024-02-15T00:00:00.000Z',
        );
        addManifest(
            store,
            'exports/1709000000000-newest',
            '2024-02-20T00:00:00.000Z',
        );
        store.failDeleteFor.add('exports/1707000000000-oldest/contents.txt');
        const { runner } = commandRunner();

        const result = await runExport(exportOptions(store, runner));

        expect(result.cleanupFailures).toContain(
            'exports/1707000000000-oldest/contents.txt',
        );
        expect(
            store.blobs.has('exports/1707000000000-oldest/manifest.json'),
        ).toBe(true);
        expect(
            store.blobs.has('exports/1708000000000-middle/manifest.json'),
        ).toBe(false);
        expect(
            store.blobs.has('exports/1709000000000-newest/manifest.json'),
        ).toBe(true);
    });

    it('preserves completed copies when retention reads are transiently unavailable', async () => {
        const store = new MemoryExportStore();
        const olderPrefix = 'exports/1760000000000-older';
        const newerPrefix = 'exports/1761000000000-newer';
        addManifest(store, olderPrefix, '2025-10-09T00:00:00.000Z');
        addManifest(store, newerPrefix, '2025-10-20T00:00:00.000Z');
        store.failDownloadFor.set(
            `${olderPrefix}/manifest.json`,
            statusError(503, 'transient manifest read'),
        );
        store.failDownloadFor.set(
            `${newerPrefix}/database.dump`,
            statusError(503, 'transient dump read'),
        );
        const { runner } = commandRunner();

        const result = await runExport(exportOptions(store, runner));

        expect(result.cleanupFailures).toEqual(
            expect.arrayContaining([
                `${olderPrefix}/manifest.json`,
                `${newerPrefix}/manifest.json`,
            ]),
        );
        for (const prefix of [olderPrefix, newerPrefix]) {
            expect(store.blobs.has(`${prefix}/database.dump`)).toBe(true);
            expect(store.blobs.has(`${prefix}/contents.txt`)).toBe(true);
            expect(store.blobs.has(`${prefix}/sha256.txt`)).toBe(true);
            expect(store.blobs.has(`${prefix}/manifest.json`)).toBe(true);
            expect(store.deletes).not.toEqual(
                expect.arrayContaining([
                    `${prefix}/database.dump`,
                    `${prefix}/contents.txt`,
                    `${prefix}/sha256.txt`,
                    `${prefix}/manifest.json`,
                ]),
            );
        }
    });

    it('prunes an old incomplete prefix while keeping a recent incomplete prefix', async () => {
        const store = new MemoryExportStore();
        const oldPrefix = `exports/${NOW.getTime() - 2 * 24 * 60 * 60 * 1000}-orphan`;
        const recentPrefix = `exports/${NOW.getTime() - 60 * 60 * 1000}-orphan`;
        store.blobs.set(
            `${oldPrefix}/database.dump`,
            Buffer.from('old partial'),
        );
        store.blobs.set(
            `${recentPrefix}/database.dump`,
            Buffer.from('recent partial'),
        );
        const { runner } = commandRunner();

        await runExport(exportOptions(store, runner));

        expect(store.blobs.has(`${oldPrefix}/database.dump`)).toBe(false);
        expect(store.blobs.has(`${recentPrefix}/database.dump`)).toBe(true);
    });

    it('rejects a mutable tools image reference before taking the export lease', async () => {
        const store = new MemoryExportStore();
        const { runner, calls } = commandRunner();

        await expect(
            runExport({
                ...exportOptions(store, runner),
                metadata: {
                    ...exportOptions(store, runner).metadata,
                    imageDigest: 'latest',
                },
            }),
        ).rejects.toThrow(/immutable digest/i);
        expect(calls).toHaveLength(0);
        expect(store.uploads).toHaveLength(0);
    });

    it('uses the dedicated export lease marker for serialization', async () => {
        const store = new MemoryExportStore();
        const { runner } = commandRunner();

        await runExport(exportOptions(store, runner));

        expect(store.leaseRequests).toEqual([
            { blobName: EXPORT_LEASE_BLOB, durationSeconds: 60 },
        ]);
    });

    it('uses one dedicated lease while streaming the dump and verifying remote bytes', async () => {
        const store = new StreamingExportStore();
        const { runner } = commandRunner();

        const result = await runExport(exportOptions(store, runner));

        expect(store.leaseRequests).toEqual([
            { blobName: EXPORT_LEASE_BLOB, durationSeconds: 60 },
        ]);
        expect(store.uploadFileCalls).toHaveLength(1);
        expect(store.uploadFileCalls[0]).toMatchObject({
            blobName: result.manifest.dump_blob,
            leaseId: 'lease-1',
        });
        expect(store.verifyBlobCalls).toEqual([
            {
                blobName: result.manifest.dump_blob,
                sizeBytes: result.manifest.size_bytes,
                sha256: result.manifest.sha256,
            },
            {
                blobName: result.manifest.dump_blob,
                sizeBytes: result.manifest.size_bytes,
                sha256: result.manifest.sha256,
            },
        ]);
        expect(store.downloaded).toEqual(
            expect.arrayContaining([
                result.manifest.contents_blob,
                result.manifest.hash_blob,
            ]),
        );
        expect(store.downloaded).not.toContain(result.manifest.dump_blob);
        expect(
            store.uploadCalls.every(({ leaseId }) => leaseId === 'lease-1'),
        ).toBe(true);
    });
});

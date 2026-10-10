import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(testDirectory, '..');
const toolsImage =
    process.env.EXPORT_TOOLS_IMAGE ?? 'ciri-database-tools:local';
const apiImage = process.env.EXPORT_API_IMAGE ?? 'ciri-database-api:local';
const databaseImage = process.env.EXPORT_DATABASE_IMAGE ?? 'postgres:16';
const password = 'export-fixture-password';
const exporterPassword = 'exporter-fixture-password';
const marker = 'pg16-restore-fixture';

function delay(milliseconds) {
    return new Promise((resolvePromise) =>
        setTimeout(resolvePromise, milliseconds),
    );
}

function runProcess(command, args, { env = process.env, signal } = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, {
            cwd: backendDirectory,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        const abort = () => child.kill();
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        child.once('error', reject);
        child.once('close', (status) => {
            signal?.removeEventListener('abort', abort);
            resolvePromise({ status: status ?? 1, stdout, stderr });
        });
    });
}

async function runRequired(command, args, options = {}) {
    const result = await runProcess(command, args, options);
    if (result.status !== 0) {
        throw new Error(
            `${command} ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`,
        );
    }
    return result;
}

async function runDocker(args, options = {}) {
    return runRequired('docker', args, options);
}

async function runUtility(
    network,
    command,
    args,
    environment,
    mountDirectory,
    signal,
) {
    const dockerArgs = ['run', '--rm', '--network', network];
    if (mountDirectory) {
        dockerArgs.push(
            '--mount',
            `type=bind,source=${mountDirectory},target=/dump`,
        );
    }
    for (const name of [
        'POSTGRES_AUTH_MODE',
        'POSTGRES_SSL_MODE',
        'POSTGRES_HOST',
        'POSTGRES_PORT',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_DB',
        'PGHOST',
        'PGPORT',
        'PGUSER',
        'PGPASSWORD',
        'PGDATABASE',
        'PGSSLMODE',
        'PGSSLROOTCERT',
    ]) {
        if (environment[name] !== undefined)
            dockerArgs.push('-e', `${name}=${environment[name]}`);
    }
    dockerArgs.push('--entrypoint', command, toolsImage, ...args);
    return runDocker(dockerArgs, { signal });
}

class PrivateBlobStore {
    blobs = new Map();
    leaseRequests = [];
    uploadFileCalls = [];
    verifyBlobCalls = [];

    async acquireLease(blobName, durationSeconds) {
        this.leaseRequests.push({ blobName, durationSeconds });
        return {
            leaseId: 'fixture-lease',
            renew: async () => undefined,
            release: async () => undefined,
        };
    }

    async upload(blobName, value) {
        this.blobs.set(blobName, Buffer.from(value));
    }

    async uploadFile(blobName, filePath) {
        this.uploadFileCalls.push({ blobName, filePath });
        await this.upload(blobName, await readFile(filePath));
    }

    async verifyBlob(blobName, sizeBytes, sha256) {
        this.verifyBlobCalls.push({ blobName, sizeBytes, sha256 });
        const value = this.blobs.get(blobName);
        return Boolean(
            value &&
            value.length === sizeBytes &&
            createHash('sha256').update(value).digest('hex') === sha256,
        );
    }

    async download(blobName) {
        const value = this.blobs.get(blobName);
        if (!value) throw new Error(`missing private blob ${blobName}`);
        return Buffer.from(value);
    }

    async list(prefix) {
        return [...this.blobs.keys()]
            .filter((name) => name.startsWith(prefix))
            .map((name) => ({ name }));
    }

    async delete(blobName) {
        this.blobs.delete(blobName);
    }
}

async function psql(network, databaseContainer, database, sql, environment) {
    const result = await runUtility(
        network,
        'psql',
        ['-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-d', database, '-c', sql],
        {
            PGHOST: databaseContainer,
            PGPORT: '5432',
            ...environment,
        },
    );
    return result.stdout.trim();
}

async function waitForDatabase(container) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        const result = await runProcess('docker', [
            'exec',
            container,
            'pg_isready',
            '-U',
            'postgres',
            '-d',
            'postgres',
        ]);
        if (result.status === 0) return;
        await delay(500);
    }
    throw new Error('PostgreSQL 16 container did not become ready');
}

async function waitForApi(container, path) {
    let lastError = 'API did not expose a mapped port';
    for (let attempt = 0; attempt < 90; attempt += 1) {
        const portResult = await runProcess('docker', [
            'port',
            container,
            '3000/tcp',
        ]);
        const match = portResult.stdout.match(/:(\d+)\s*$/m);
        if (match) {
            try {
                const response = await fetch(
                    `http://127.0.0.1:${match[1]}${path}`,
                    { signal: AbortSignal.timeout(1_000) },
                );
                if (response.status === 200) return response;
                lastError = `${path} returned HTTP ${response.status}`;
            } catch (error) {
                lastError =
                    error instanceof Error ? error.message : String(error);
            }
        } else if (portResult.stderr) {
            lastError = portResult.stderr.trim();
        }
        await delay(500);
    }
    const logs = await runProcess('docker', ['logs', container]);
    throw new Error(
        `API did not become ready: ${lastError}\n${logs.stderr || logs.stdout}`,
    );
}

async function createFixtureSchema(network, databaseContainer) {
    const admin = {
        PGUSER: 'postgres',
        PGPASSWORD: password,
        POSTGRES_AUTH_MODE: 'password',
        POSTGRES_SSL_MODE: 'disable',
        POSTGRES_HOST: databaseContainer,
        POSTGRES_PORT: '5432',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: password,
    };
    await runDocker([
        'exec',
        databaseContainer,
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        'CREATE DATABASE export_source',
    ]);
    await runDocker([
        'exec',
        databaseContainer,
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        'CREATE DATABASE export_restore',
    ]);
    await runUtility(
        network,
        'node',
        ['/app/dist/database/maintenance.js', 'migrate'],
        { ...admin, POSTGRES_DB: 'export_source' },
    );
    await runUtility(
        network,
        'node',
        ['/app/dist/database/maintenance.js', 'seed'],
        { ...admin, POSTGRES_DB: 'export_source' },
    );
    await psql(
        network,
        databaseContainer,
        'postgres',
        `
      CREATE ROLE ciri_exporter LOGIN PASSWORD '${exporterPassword}';
      GRANT CONNECT ON DATABASE export_source TO ciri_exporter;
    `,
        admin,
    );
    await psql(
        network,
        databaseContainer,
        'export_source',
        `
      GRANT USAGE ON SCHEMA public TO ciri_exporter;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO ciri_exporter;
      GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ciri_exporter;
    `,
        admin,
    );
}

async function snapshot(network, databaseContainer, database) {
    const data = await psql(
        network,
        databaseContainer,
        database,
        "SELECT count(*)::text || ':' || string_agg(id::text || ':' || slug || ':' || metadata_provenance::text, ',' ORDER BY id) FROM games",
        { PGUSER: 'postgres', PGPASSWORD: password },
    );
    const apiRead = await psql(
        network,
        databaseContainer,
        database,
        "SELECT slug || '|' || name || '|' || status FROM games WHERE slug = 'cyberpunk-2077'",
        { PGUSER: 'postgres', PGPASSWORD: password },
    );
    const indexes = await psql(
        network,
        databaseContainer,
        database,
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname",
        { PGUSER: 'postgres', PGPASSWORD: password },
    );
    const sequences = await psql(
        network,
        databaseContainer,
        database,
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname",
        { PGUSER: 'postgres', PGPASSWORD: password },
    );
    const ledger = await psql(
        network,
        databaseContainer,
        database,
        "SELECT count(*)::text || ':' || string_agg(name, ',' ORDER BY id) FROM migrations",
        { PGUSER: 'postgres', PGPASSWORD: password },
    );
    return { data, apiRead, indexes, sequences, ledger };
}

async function main() {
    const network = `ciri-export-fixture-${process.pid}-${Date.now()}`;
    const databaseContainer = `${network}-db`;
    const apiContainer = `${network}-api`;
    const temporaryDirectory = await mkdtemp(
        join(process.cwd(), 'export-pg16-'),
    );
    const sourceEnvironment = {
        POSTGRES_AUTH_MODE: 'password',
        POSTGRES_SSL_MODE: 'disable',
        POSTGRES_HOST: databaseContainer,
        POSTGRES_PORT: '5432',
        POSTGRES_USER: 'ciri_exporter',
        POSTGRES_PASSWORD: exporterPassword,
        POSTGRES_DB: 'export_source',
        TOOLS_IMAGE_DIGEST: `ciri-database-tools@sha256:${'a'.repeat(64)}`,
        CIRI_EXPORT_REQUEST_MARKER: marker,
    };
    let runExport;
    const store = new PrivateBlobStore();
    try {
        await runDocker(['network', 'create', network]);
        await runDocker([
            'run',
            '-d',
            '--rm',
            '--name',
            databaseContainer,
            '--network',
            network,
            '-e',
            `POSTGRES_PASSWORD=${password}`,
            databaseImage,
        ]);
        await waitForDatabase(databaseContainer);
        await createFixtureSchema(network, databaseContainer);

        const exportModule = await import(
            pathToFileURL(
                resolve(backendDirectory, 'dist/maintenance/export.js'),
            ).href
        );
        runExport = exportModule.runExport;
        const runner = {
            run: async (command, args, options) => {
                const dumpPath = args.find((argument) =>
                    argument.endsWith('database.dump'),
                );
                const mountDirectory = dumpPath ? dirname(dumpPath) : undefined;
                const mappedArgs = args.map((argument) =>
                    argument === dumpPath
                        ? `/dump/${basename(dumpPath)}`
                        : argument,
                );
                const result = await runUtility(
                    network,
                    command,
                    mappedArgs,
                    {
                        PGHOST: databaseContainer,
                        PGPORT: '5432',
                        PGUSER: sourceEnvironment.POSTGRES_USER,
                        PGPASSWORD: sourceEnvironment.POSTGRES_PASSWORD,
                        PGDATABASE: sourceEnvironment.POSTGRES_DB,
                    },
                    mountDirectory,
                    options.signal,
                );
                return {
                    exitCode: result.status,
                    stdout: result.stdout,
                    stderr: result.stderr,
                };
            },
        };
        const before = await snapshot(
            network,
            databaseContainer,
            'export_source',
        );
        const result = await runExport({
            env: sourceEnvironment,
            store,
            runner,
            requestMarker: marker,
            metadata: {
                postgresVersion: '16.15',
                migrationVersion: '1790985600000',
                imageDigest: sourceEnvironment.TOOLS_IMAGE_DIGEST,
            },
        });

        assert.equal(store.leaseRequests.length, 1);
        assert.equal(store.uploadFileCalls.length, 1);
        assert.equal(
            store.uploadFileCalls[0].blobName,
            result.manifest.dump_blob,
        );
        assert.equal(store.verifyBlobCalls.length, 2);
        assert.ok(store.blobs.has(result.manifest.contents_blob));
        assert.ok(store.blobs.has(result.manifest.hash_blob));
        assert.ok(
            store.blobs.has(
                `${result.manifest.dump_blob.slice(0, -'database.dump'.length)}manifest.json`,
            ),
        );

        const restoreDumpPath = join(temporaryDirectory, 'restore.dump');
        await writeFile(
            restoreDumpPath,
            await store.download(result.manifest.dump_blob),
        );
        await runUtility(
            network,
            'pg_restore',
            [
                '--exit-on-error',
                '--no-owner',
                '--no-acl',
                '--dbname',
                'export_restore',
                '/dump/restore.dump',
            ],
            {
                PGHOST: databaseContainer,
                PGPORT: '5432',
                PGUSER: 'postgres',
                PGPASSWORD: password,
                PGDATABASE: 'export_restore',
            },
            temporaryDirectory,
        );

        const restored = await snapshot(
            network,
            databaseContainer,
            'export_restore',
        );
        assert.deepEqual(restored, before);
        assert.match(restored.indexes, /games_pkey/);
        assert.match(restored.indexes, /games_slug_key/);
        assert.match(restored.indexes, /games_rawg_id_key/);
        assert.match(restored.indexes, /idx_perf_lookup/);
        assert.match(restored.sequences, /games_id_seq/);
        assert.match(restored.sequences, /performance_records_id_seq/);
        assert.match(restored.ledger, /AzureBaseline1790985600000/);
        assert.equal(
            restored.apiRead,
            'cyberpunk-2077|Cyberpunk 2077|published',
        );

        await runDocker([
            'run',
            '-d',
            '--rm',
            '--name',
            apiContainer,
            '--network',
            network,
            '-p',
            '127.0.0.1::3000',
            '-e',
            'NODE_ENV=test',
            '-e',
            'PORT=3000',
            '-e',
            'POSTGRES_AUTH_MODE=password',
            '-e',
            'POSTGRES_SSL_MODE=disable',
            '-e',
            `POSTGRES_HOST=${databaseContainer}`,
            '-e',
            'POSTGRES_PORT=5432',
            '-e',
            'POSTGRES_USER=postgres',
            '-e',
            `POSTGRES_PASSWORD=${password}`,
            '-e',
            'POSTGRES_DB=export_restore',
            apiImage,
        ]);
        await waitForApi(apiContainer, '/api/health/ready');
        const apiPortResult = await runDocker([
            'port',
            apiContainer,
            '3000/tcp',
        ]);
        const apiPort = apiPortResult.stdout.match(/:(\d+)\s*$/m)?.[1];
        assert.ok(apiPort, 'API container did not expose a host port');
        const gamesResponse = await fetch(
            `http://127.0.0.1:${apiPort}/api/v2/games`,
        );
        assert.equal(gamesResponse.status, 200);
        const gamesBody = await gamesResponse.json();
        assert.match(JSON.stringify(gamesBody), /cyberpunk-2077/);

        const deniedWrite = await runProcess('docker', [
            'run',
            '--rm',
            '--network',
            network,
            '-e',
            `PGHOST=${databaseContainer}`,
            '-e',
            'PGPORT=5432',
            '-e',
            'PGUSER=ciri_exporter',
            '-e',
            `PGPASSWORD=${exporterPassword}`,
            '-e',
            'PGDATABASE=export_source',
            '--entrypoint',
            'psql',
            toolsImage,
            '-v',
            'ON_ERROR_STOP=1',
            '-d',
            'export_source',
            '-c',
            "INSERT INTO games (slug, name, status, metadata_provenance) VALUES ('denied', 'Denied', 'published', '{}')",
        ]);
        assert.notEqual(deniedWrite.status, 0);
        assert.match(
            `${deniedWrite.stderr}${deniedWrite.stdout}`,
            /permission denied/i,
        );
        assert.equal(
            (await snapshot(network, databaseContainer, 'export_source')).data,
            before.data,
        );

        console.log(
            JSON.stringify(
                {
                    dump: 'pg_dump custom format through compiled exporter',
                    restore: 'pg_restore 16.15 into isolated PostgreSQL 16',
                    api: 'ciri-database-api reads restored /api/v2/games data',
                    manifest: result.manifest,
                    source: before,
                    restored,
                    exporterWrite: 'denied as ciri_exporter',
                },
                null,
                2,
            ),
        );
    } finally {
        await runProcess('docker', ['rm', '-f', apiContainer]);
        await runProcess('docker', ['rm', '-f', databaseContainer]);
        await runProcess('docker', ['network', 'rm', network]);
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});

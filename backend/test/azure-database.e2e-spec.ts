import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DataSource } from 'typeorm';

import { buildDatabaseOptions } from '../src/database/database.config';
import {
    maintenanceDataSource,
    runMaintenance,
} from '../src/database/maintenance';

// Explicit opt-in: this suite creates disposable databases on a supplied PostgreSQL 16 server.
const suite = process.env.AZURE_DB_TEST_HOST ? describe : describe.skip;

type Row = Record<string, unknown>;
type RoleName = 'ciri-runtime' | 'ciri-migrator' | 'ciri-exporter';

const roles: Record<RoleName, string> = {
    'ciri-runtime': 'runtime-test-password',
    'ciri-migrator': 'migrator-test-password',
    'ciri-exporter': 'exporter-test-password',
};

suite('database lifecycle on isolated PostgreSQL 16', () => {
    let admin: DataSource;
    let source: DataSource | undefined;
    let databaseName = '';
    const createdRoles: RoleName[] = [];
    const host = process.env.AZURE_DB_TEST_HOST ?? '';
    const port = process.env.AZURE_DB_TEST_PORT ?? '5432';
    const password = process.env.AZURE_DB_TEST_PASSWORD ?? 'ciri-test';
    const connectionEnvironment = (
        database: string,
        user = process.env.AZURE_DB_TEST_USER ?? 'postgres',
        rolePassword = password,
    ): NodeJS.ProcessEnv => ({
        POSTGRES_AUTH_MODE: 'password',
        POSTGRES_SSL_MODE: 'disable',
        POSTGRES_HOST: host,
        POSTGRES_PORT: port,
        POSTGRES_USER: user,
        POSTGRES_PASSWORD: rolePassword,
        POSTGRES_DB: database,
    });

    beforeAll(async () => {
        admin = new DataSource(
            buildDatabaseOptions(connectionEnvironment('postgres')),
        );
        await admin.initialize();
        adminForSuite = admin;
        const existing = await queryRows<{ rolname: RoleName }>(
            admin,
            'SELECT rolname FROM pg_roles WHERE rolname = ANY($1)',
            [Object.keys(roles)],
        );
        if (existing.length)
            throw new Error(
                `Reserved Azure database test roles already exist: ${existing
                    .map(({ rolname }) => rolname)
                    .join(', ')}`,
            );
        for (const [name, rolePassword] of Object.entries(roles) as [
            RoleName,
            string,
        ][]) {
            await admin.query(
                `CREATE ROLE "${name}" LOGIN PASSWORD '${rolePassword}'`,
            );
            createdRoles.push(name);
        }
    });

    beforeEach(async () => {
        databaseName = `ciri_db_test_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
        await admin.query(`CREATE DATABASE "${databaseName}"`);
        const database = maintenanceDataSource(
            connectionEnvironment(databaseName),
        );
        source = database;
        sourceForSuite = database;
        await database.initialize();
    });

    afterEach(async () => {
        if (source?.isInitialized) await source.destroy();
        await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        source = undefined;
        sourceForSuite = undefined;
    });

    afterAll(async () => {
        for (const name of createdRoles)
            await admin.query(`DROP ROLE IF EXISTS "${name}"`);
        adminForSuite = undefined;
        if (admin?.isInitialized) await admin.destroy();
    });

    it('creates a fresh schema, seeds explicitly, and preserves operator edits on repeat runs', async () => {
        const database = getSource();
        await runMaintenance(database, 'migrate');
        await runMaintenance(database, 'seed');

        const before = await queryRows<{ count: number }>(
            database,
            'SELECT count(*)::int AS count FROM performance_records',
        );
        expect(before[0]?.count).toBeGreaterThan(0);

        await database.query(
            "UPDATE gpus SET name='Operator GPU' WHERE slug='nvidia-rtx-4080'",
        );
        await database.query(
            "UPDATE performance_records SET fps_avg=999, source='operator', source_url='operator-reference' WHERE id=(SELECT min(id) FROM performance_records)",
        );

        await runMaintenance(database, 'seed');
        await runMaintenance(database, 'seed');
        await runMaintenance(database, 'migrate');

        await expect(
            queryRows<{ count: number }>(
                database,
                'SELECT count(*)::int AS count FROM performance_records',
            ),
        ).resolves.toEqual(before);
        await expect(
            queryRows<{ name: string }>(
                database,
                "SELECT name FROM gpus WHERE slug='nvidia-rtx-4080'",
            ),
        ).resolves.toEqual([{ name: 'Operator GPU' }]);
        await expect(
            queryRows<{ fps_avg: number; source: string; source_url: string }>(
                database,
                'SELECT fps_avg, source, source_url FROM performance_records WHERE id=(SELECT min(id) FROM performance_records)',
            ),
        ).resolves.toEqual([
            {
                fps_avg: 999,
                source: 'operator',
                source_url: 'operator-reference',
            },
        ]);
        await expect(runMaintenance(database, 'status')).resolves.toBe(false);
    }, 30_000);

    it('adopts a current schema without replaying the fresh baseline or losing provenance', async () => {
        const database = getSource();
        await installCurrentSchema(database, true);
        await database.query(
            "UPDATE games SET status='rejected', rejection_reason='operator', metadata_provenance='{\"origin\":\"operator\"}' WHERE id=1",
        );
        await database.query(
            "UPDATE performance_records SET source='gemini', source_url='https://example.test/gemini' WHERE id=1",
        );

        await runMaintenance(database, 'migrate');
        await runMaintenance(database, 'migrate');

        await expect(
            queryRows<{ count: number }>(
                database,
                'SELECT count(*)::int AS count FROM games',
            ),
        ).resolves.toEqual([{ count: 10 }]);
        await expect(
            queryRows<{
                id: number;
                status: string;
                rejection_reason: string;
                metadata_provenance: Record<string, string>;
            }>(
                database,
                'SELECT id, status, rejection_reason, metadata_provenance FROM games WHERE id=1',
            ),
        ).resolves.toEqual([
            {
                id: 1,
                status: 'rejected',
                rejection_reason: 'operator',
                metadata_provenance: { origin: 'operator' },
            },
        ]);
        await expect(
            queryRows<{ id: number; source: string; source_url: string }>(
                database,
                'SELECT id, source, source_url FROM performance_records WHERE id=1',
            ),
        ).resolves.toEqual([
            {
                id: 1,
                source: 'gemini',
                source_url: 'https://example.test/gemini',
            },
        ]);
        await expect(
            queryRows<{ count: number }>(
                database,
                'SELECT count(*)::int AS count FROM migrations',
            ),
        ).resolves.toEqual([{ count: 3 }]);
    }, 30_000);

    it.each([
        {
            name: 'expanded status check accepts an unexpected label',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_status_check',
                );
                await database.query(
                    "ALTER TABLE games ADD CONSTRAINT games_status_check CHECK (status IN ('pending_approval', 'published', 'rejected', 'unexpected_status'))",
                );
            },
        },
        {
            name: 'status check changes the case of a known literal',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_status_check',
                );
                await database.query(
                    "ALTER TABLE games ADD CONSTRAINT games_status_check CHECK (status IN ('pending_approval', 'PUBLISHED', 'rejected'))",
                );
            },
        },
        {
            name: 'status check adds whitespace inside a known literal',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_status_check',
                );
                await database.query(
                    "ALTER TABLE games ADD CONSTRAINT games_status_check CHECK (status IN ('pending_approval', 'pub lished', 'rejected'))",
                );
            },
        },
        {
            name: 'same-name RAWG constraint is not unique',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_rawg_id_key',
                );
                await database.query(
                    'ALTER TABLE games ADD CONSTRAINT games_rawg_id_key CHECK (rawg_id IS NULL OR rawg_id > 0)',
                );
            },
        },
        {
            name: 'status check is owned by the wrong table',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_status_check',
                );
                await database.query(
                    'CREATE TABLE status_holder (status text)',
                );
                await database.query(
                    "ALTER TABLE status_holder ADD CONSTRAINT games_status_check CHECK (status IN ('pending_approval', 'published', 'rejected'))",
                );
            },
        },
        {
            name: 'status constraint has the wrong PostgreSQL type',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_status_check',
                );
                await database.query(
                    'ALTER TABLE games ADD CONSTRAINT games_status_check UNIQUE (status)',
                );
            },
        },
        {
            name: 'status check is not validated',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_status_check',
                );
                await database.query(
                    "ALTER TABLE games ADD CONSTRAINT games_status_check CHECK (status IN ('pending_approval', 'published', 'rejected')) NOT VALID",
                );
            },
        },
    ])(
        'rejects $name before baseline adoption and preserves data',
        async ({ alter }) => {
            const database = getSource();
            await installCurrentSchema(database);
            await database.query(
                "INSERT INTO games (slug, name, status, rawg_id) VALUES ('operator-adoption-row', 'Operator adoption row', 'pending_approval', 42)",
            );
            const before = await queryRows<{
                id: number;
                slug: string;
                name: string;
                status: string;
                rawg_id: number;
            }>(
                database,
                "SELECT id, slug, name, status, rawg_id FROM games WHERE slug='operator-adoption-row'",
            );

            await alter(database);

            await expect(runMaintenance(database, 'migrate')).rejects.toThrow(
                /incompatible|constraint|schema/i,
            );
            await expect(
                queryRows<{
                    id: number;
                    slug: string;
                    name: string;
                    status: string;
                    rawg_id: number;
                }>(
                    database,
                    "SELECT id, slug, name, status, rawg_id FROM games WHERE slug='operator-adoption-row'",
                ),
            ).resolves.toEqual(before);
            await expectNoLedger(database);
        },
        30_000,
    );

    it('upgrades a true V1 schema while preserving nonfixture IDs and Gemini provenance', async () => {
        const database = getSource();
        await installV1Schema(database);
        await insertLegacyRows(database);

        await runMaintenance(database, 'migrate');

        await expect(
            queryRows<{
                id: number;
                status: string;
                source: string;
                source_url: string;
            }>(
                database,
                'SELECT g.id, g.status, p.source, p.source_url FROM games g JOIN performance_records p ON p.game_id=g.id WHERE g.id=430',
            ),
        ).resolves.toEqual([
            {
                id: 430,
                status: 'published',
                source: 'gemini',
                source_url: 'gemini',
            },
        ]);
        await expect(
            queryRows<{ count: number }>(
                database,
                'SELECT count(*)::int AS count FROM migrations',
            ),
        ).resolves.toEqual([{ count: 3 }]);
    }, 30_000);

    it('upgrades a database that already applied lifecycle migration 001 exactly once', async () => {
        const database = getSource();
        await installV1Schema(database);
        await insertLegacyRows(database);
        await database.query(
            readFileSync(
                resolve(
                    infrastructureForTests(),
                    'migrations/001-v2-game-lifecycle.sql',
                ),
                'utf8',
            ),
        );

        await runMaintenance(database, 'migrate');
        await runMaintenance(database, 'migrate');

        await expect(
            queryRows<{
                id: number;
                status: string;
                source: string;
                source_url: string;
            }>(
                database,
                'SELECT g.id, g.status, p.source, p.source_url FROM games g JOIN performance_records p ON p.game_id=g.id WHERE g.id=430',
            ),
        ).resolves.toEqual([
            {
                id: 430,
                status: 'published',
                source: 'gemini',
                source_url: 'gemini',
            },
        ]);
        await expect(
            queryRows<{ count: number }>(
                database,
                'SELECT count(*)::int AS count FROM migrations',
            ),
        ).resolves.toEqual([{ count: 3 }]);
    }, 30_000);

    it.each([
        {
            name: 'altered type',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE gpus ALTER COLUMN vram_gb TYPE bigint',
                );
            },
        },
        {
            name: 'dropped not-null constraint',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games ALTER COLUMN name DROP NOT NULL',
                );
            },
        },
        {
            name: 'altered default',
            alter: async (database: DataSource) => {
                await database.query(
                    "ALTER TABLE games ALTER COLUMN status SET DEFAULT 'published'",
                );
            },
        },
        {
            name: 'missing primary key',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_pkey CASCADE',
                );
            },
        },
        {
            name: 'missing foreign key',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE performance_records DROP CONSTRAINT performance_records_game_id_fkey',
                );
            },
        },
        {
            name: 'wrong check definition',
            alter: async (database: DataSource) => {
                await database.query(
                    'ALTER TABLE games DROP CONSTRAINT games_status_check',
                );
                await database.query(
                    'ALTER TABLE games ADD CONSTRAINT games_status_check CHECK (true)',
                );
            },
        },
        {
            name: 'wrong index definition',
            alter: async (database: DataSource) => {
                await database.query('DROP INDEX idx_perf_lookup');
                await database.query(
                    'CREATE INDEX idx_perf_lookup ON performance_records (fps_avg)',
                );
            },
        },
    ])(
        '$name fails closed before recording the baseline',
        async ({ alter }) => {
            const database = getSource();
            await installCurrentSchema(database);
            await database.query(
                "INSERT INTO games (slug, name, status) VALUES ('operator-schema-row', 'Operator row', 'published')",
            );
            const before = await queryRows<{ slug: string; name: string }>(
                database,
                "SELECT slug, name FROM games WHERE slug='operator-schema-row'",
            );
            await alter(database);

            await expect(runMaintenance(database, 'migrate')).rejects.toThrow(
                /incompatible|partial|schema/i,
            );
            await expect(
                queryRows<{ slug: string; name: string }>(
                    database,
                    "SELECT slug, name FROM games WHERE slug='operator-schema-row'",
                ),
            ).resolves.toEqual(before);
            await expectNoLedger(database);
        },
        30_000,
    );

    it('keeps nullable engine versions and nonfixture foreign keys stable across repeated seed runs', async () => {
        const database = getSource();
        await runMaintenance(database, 'migrate');
        await database.query(
            "INSERT INTO game_engines (id, name, version) VALUES (900, 'RAGE', NULL)",
        );
        await database.query(
            "INSERT INTO gpus (id, slug, name, manufacturer, vram_gb) VALUES (901, 'nvidia-rtx-4080', 'Operator GPU', 'Nvidia', 16)",
        );
        await database.query(
            "INSERT INTO cpus (id, slug, name, manufacturer, cores, threads, base_clock_ghz) VALUES (902, 'intel-core-i7-13700k', 'Operator CPU', 'Intel', 16, 24, 3.4)",
        );
        await database.query(
            "INSERT INTO games (id, slug, name, status, metadata_provenance) VALUES (903, 'cyberpunk-2077', 'Operator Game', 'published', '{\"owner\":\"operator\"}')",
        );
        await database.query(
            "INSERT INTO performance_records (id, game_id, gpu_id, cpu_id, ram_gb, res_width, res_height, settings, upscaler, fps_avg, verified, source, source_url) VALUES (904, 903, 901, 902, 32, 1920, 1080, 'ultra', 'off', 777, true, 'operator', 'operator-reference')",
        );

        await runMaintenance(database, 'seed');
        const countAfterFirst = await queryRows<{ count: number }>(
            database,
            "SELECT count(*)::int AS count FROM performance_records WHERE game_id=903 AND gpu_id=901 AND cpu_id=902 AND ram_gb=32 AND ram_mhz IS NULL AND res_width=1920 AND res_height=1080 AND settings='ultra' AND upscaler='off' AND upscaler_quality IS NULL",
        );
        await runMaintenance(database, 'seed');
        const countAfterSecond = await queryRows<{ count: number }>(
            database,
            "SELECT count(*)::int AS count FROM performance_records WHERE game_id=903 AND gpu_id=901 AND cpu_id=902 AND ram_gb=32 AND ram_mhz IS NULL AND res_width=1920 AND res_height=1080 AND settings='ultra' AND upscaler='off' AND upscaler_quality IS NULL",
        );

        expect(countAfterFirst).toEqual([{ count: 1 }]);
        expect(countAfterSecond).toEqual([{ count: 1 }]);
        await expect(
            queryRows<{ name: string; version: string | null }>(
                database,
                'SELECT name, version FROM game_engines WHERE id=900',
            ),
        ).resolves.toEqual([{ name: 'RAGE', version: null }]);
        await expect(
            queryRows<{ name: string; metadata_provenance: Row }>(
                database,
                'SELECT name, metadata_provenance FROM games WHERE id=903',
            ),
        ).resolves.toEqual([
            {
                name: 'Operator Game',
                metadata_provenance: { owner: 'operator' },
            },
        ]);
        await expect(
            queryRows<{ fps_avg: number; source: string; source_url: string }>(
                database,
                'SELECT fps_avg, source, source_url FROM performance_records WHERE id=904',
            ),
        ).resolves.toEqual([
            {
                fps_avg: 777,
                source: 'operator',
                source_url: 'operator-reference',
            },
        ]);
    }, 30_000);

    it('requires TEMP for the restricted migrator and enforces runtime/exporter write boundaries', async () => {
        const database = getSource();
        await configureRestrictedDatabase(databaseName);
        const migrator = maintenanceDataSource(
            connectionEnvironment(
                databaseName,
                'ciri-migrator',
                roles['ciri-migrator'],
            ),
        );
        try {
            await migrator.initialize();
            await runMaintenance(migrator, 'migrate');
            await expect(runMaintenance(migrator, 'seed')).rejects.toThrow(
                /permission denied|temporary|temp/i,
            );
            await admin.query(
                `GRANT TEMP ON DATABASE "${databaseName}" TO "ciri-migrator"`,
            );
            await runMaintenance(migrator, 'seed');
        } finally {
            if (migrator.isInitialized) await migrator.destroy();
        }

        const runtime = await connectRole(
            databaseName,
            'ciri-runtime',
            roles['ciri-runtime'],
        );
        const exporter = await connectRole(
            databaseName,
            'ciri-exporter',
            roles['ciri-exporter'],
        );
        try {
            await expect(
                queryRows<{ count: number }>(
                    runtime,
                    'SELECT count(*)::int AS count FROM games',
                ),
            ).resolves.toEqual([{ count: 10 }]);
            await runtime.query(
                "UPDATE games SET name='Runtime edit' WHERE slug='cyberpunk-2077'",
            );
            await expect(
                runtime.query("DELETE FROM games WHERE slug='cyberpunk-2077'"),
            ).rejects.toThrow(/permission denied/i);
            await expect(
                runtime.query('CREATE TABLE runtime_forbidden (id integer)'),
            ).rejects.toThrow(/permission denied/i);

            await expect(
                queryRows<{ count: number }>(
                    exporter,
                    'SELECT count(*)::int AS count FROM performance_records',
                ),
            ).resolves.toEqual([{ count: 25 }]);
            await expect(
                exporter.query(
                    "UPDATE games SET name='Exporter edit' WHERE id=1",
                ),
            ).rejects.toThrow(/permission denied/i);
            await expect(
                exporter.query('CREATE TABLE exporter_forbidden (id integer)'),
            ).rejects.toThrow(/permission denied/i);

            await expect(
                queryRows<{
                    rolcreatedb: boolean;
                    rolcreaterole: boolean;
                    rolreplication: boolean;
                    rolbypassrls: boolean;
                }>(
                    database,
                    "SELECT rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname='ciri-migrator'",
                ),
            ).resolves.toEqual([
                {
                    rolcreatedb: false,
                    rolcreaterole: false,
                    rolreplication: false,
                    rolbypassrls: false,
                },
            ]);
        } finally {
            if (runtime.isInitialized) await runtime.destroy();
            if (exporter.isInitialized) await exporter.destroy();
        }
    }, 30_000);

    it('fails a concurrent maintenance run without mutating a fresh database', async () => {
        const database = getSource();
        const lock = database.createQueryRunner();
        await lock.connect();
        await lock.query('SELECT pg_advisory_lock(1128878665, 3)');
        try {
            await expect(runMaintenance(database, 'migrate')).rejects.toThrow(
                /already running|lock/i,
            );
        } finally {
            await lock.query('SELECT pg_advisory_unlock(1128878665, 3)');
            await lock.release();
        }
        await expectNoLedger(database);
    }, 30_000);

    it('rolls back an incompatible partial schema without recording a baseline', async () => {
        const database = getSource();
        await database.query('CREATE TABLE games (id integer PRIMARY KEY)');

        await expect(runMaintenance(database, 'migrate')).rejects.toThrow(
            /partial|incompatible/i,
        );
        await expectNoLedger(database);
    }, 30_000);
});

function getSource(): DataSource {
    if (!sourceForSuite)
        throw new Error('database test source is not initialized');
    return sourceForSuite;
}

let sourceForSuite: DataSource | undefined;
let adminForSuite: DataSource | undefined;

async function queryRows<T extends Row>(
    database: DataSource,
    statement: string,
    parameters: unknown[] = [],
): Promise<T[]> {
    const result: unknown = await database.query(statement, parameters);
    return result as T[];
}

async function expectNoLedger(database: DataSource): Promise<void> {
    const ledger = await queryRows<{ ledger: string | null }>(
        database,
        "SELECT to_regclass('public.migrations') AS ledger",
    );
    if (ledger[0]?.ledger === null) return;
    await expect(
        queryRows<{ count: number }>(
            database,
            'SELECT count(*)::int AS count FROM migrations',
        ),
    ).resolves.toEqual([{ count: 0 }]);
}

async function installCurrentSchema(
    database: DataSource,
    withSeed = false,
): Promise<void> {
    for (const file of [
        '01-enums-schema.sql',
        '02-hardware-schema.sql',
        '03-games-schema.sql',
        '04-performance-schema.sql',
    ])
        await database.query(
            readFileSync(
                resolve(infrastructureForTests(), 'init-scripts', file),
                'utf8',
            ),
        );
    if (withSeed)
        await database.query(
            readFileSync(
                resolve(infrastructureForTests(), 'init-scripts/05-seed.sql'),
                'utf8',
            ),
        );
}

async function installV1Schema(database: DataSource): Promise<void> {
    await installCurrentSchema(database);
    await database.query(
        'ALTER TABLE games DROP CONSTRAINT games_status_check, DROP CONSTRAINT games_rawg_id_key, DROP CONSTRAINT games_rawg_id_check, DROP CONSTRAINT games_rawg_payload_check, DROP CONSTRAINT games_metadata_provenance_check, DROP CONSTRAINT games_rejection_reason_check',
    );
    await database.query(
        'ALTER TABLE games DROP COLUMN status, DROP COLUMN rawg_id, DROP COLUMN rawg_payload, DROP COLUMN metadata_provenance, DROP COLUMN rejection_reason',
    );
    await database.query('ALTER TABLE performance_records DROP COLUMN source');
}

async function insertLegacyRows(database: DataSource): Promise<void> {
    await database.query(
        "INSERT INTO game_engines (id, name, version) VALUES (410, 'Legacy Engine', NULL)",
    );
    await database.query(
        "INSERT INTO gpus (id, slug, name, manufacturer, vram_gb) VALUES (420, 'legacy-gpu', 'Legacy GPU', 'Nvidia', 8)",
    );
    await database.query(
        "INSERT INTO cpus (id, slug, name, manufacturer, cores, threads, base_clock_ghz) VALUES (421, 'legacy-cpu', 'Legacy CPU', 'Intel', 6, 12, 2.5)",
    );
    await database.query(
        "INSERT INTO games (id, slug, name, game_engine_id) VALUES (430, 'legacy-game', 'Legacy Game', 410)",
    );
    await database.query(
        "INSERT INTO performance_records (id, game_id, gpu_id, cpu_id, ram_gb, res_width, res_height, settings, upscaler, fps_avg, verified, source_url) VALUES (440, 430, 420, 421, 16, 1920, 1080, 'high', 'off', 60, true, 'gemini')",
    );
}

function infrastructureForTests(): string {
    return (
        [
            resolve(__dirname, '../../infra'),
            resolve(__dirname, '../infra'),
            '/infra',
            '/app/infra',
        ].find((candidate) =>
            existsSync(resolve(candidate, 'init-scripts/01-enums-schema.sql')),
        ) ?? resolve(__dirname, '../../infra')
    );
}

async function configureRestrictedDatabase(
    databaseName: string,
): Promise<void> {
    const admin = getSource();
    await admin.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await admin.query('ALTER SCHEMA public OWNER TO "ciri-migrator"');
    await adminForTests().query(
        `GRANT CONNECT ON DATABASE "${databaseName}" TO "ciri-runtime", "ciri-migrator", "ciri-exporter"`,
    );
    await adminForTests().query(
        `REVOKE TEMP ON DATABASE "${databaseName}" FROM PUBLIC, "ciri-migrator"`,
    );
}

async function connectRole(
    databaseName: string,
    role: RoleName,
    rolePassword: string,
): Promise<DataSource> {
    const database = maintenanceDataSource(
        environmentForTests(databaseName, role, rolePassword),
    );
    await database.initialize();
    return database;
}

function environmentForTests(
    databaseName: string,
    role: RoleName,
    rolePassword: string,
): NodeJS.ProcessEnv {
    return {
        POSTGRES_AUTH_MODE: 'password',
        POSTGRES_SSL_MODE: 'disable',
        POSTGRES_HOST: process.env.AZURE_DB_TEST_HOST ?? '',
        POSTGRES_PORT: process.env.AZURE_DB_TEST_PORT ?? '5432',
        POSTGRES_USER: role,
        POSTGRES_PASSWORD: rolePassword,
        POSTGRES_DB: databaseName,
    };
}

function adminForTests(): DataSource {
    if (!adminForSuite)
        throw new Error('database test admin is not initialized');
    return adminForSuite;
}

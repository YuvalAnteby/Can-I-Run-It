import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import { databaseOptions } from '../src/database/connection-options';
import {
    maintenanceDataSource,
    runMaintenance,
} from '../src/database/maintenance';

// Explicit opt-in: this suite creates disposable databases on the supplied local PG16 server.
const suite = process.env.AZURE_DB_TEST_HOST ? describe : describe.skip;
suite(
    'Azure database lifecycle on isolated PostgreSQL 16 (not Azure pgaadauth)',
    () => {
        let admin: DataSource;
        let source: DataSource;
        let name: string;
        const infra = resolve(__dirname, '../../infra');
        beforeAll(async () => {
            admin = new DataSource(
                databaseOptions({
                    POSTGRES_HOST: process.env.AZURE_DB_TEST_HOST,
                    POSTGRES_PORT: process.env.AZURE_DB_TEST_PORT ?? '55436',
                    POSTGRES_USER: 'postgres',
                    POSTGRES_PASSWORD: 'ciri-test',
                    POSTGRES_DB: 'postgres',
                }),
            );
            await admin.initialize();
        });
        beforeEach(async () => {
            name = `ciri_check_${Date.now()}`;
            await admin.query(`CREATE DATABASE ${name}`);
            source = maintenanceDataSource({
                POSTGRES_HOST: process.env.AZURE_DB_TEST_HOST,
                POSTGRES_PORT: process.env.AZURE_DB_TEST_PORT ?? '55436',
                POSTGRES_USER: 'postgres',
                POSTGRES_PASSWORD: 'ciri-test',
                POSTGRES_DB: name,
            });
            await source.initialize();
        });
        afterEach(async () => {
            await source.destroy();
            await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
        });
        afterAll(async () => {
            await admin.destroy();
        });
        it('uses the locked connection for maintenance with a one-connection pool', async () => {
            await source.destroy();
            source = new DataSource({
                ...(source.options as PostgresConnectionOptions),
                poolSize: 1,
            });
            await source.initialize();
            await runMaintenance(source, 'migrate');
            await runMaintenance(source, 'seed');
            expect(await runMaintenance(source, 'show')).toBe(false);
        }, 20000);
        it('creates an empty schema, seeds once and preserves operator edits across repeat runs', async () => {
            await runMaintenance(source, 'migrate');
            await runMaintenance(source, 'seed');
            await source.query(
                "UPDATE gpus SET name='Operator GPU' WHERE slug='nvidia-rtx-4080'",
            );
            await source.query(
                "UPDATE performance_records SET fps_avg=999, source='operator', source_url='operator-reference' WHERE id=(SELECT min(id) FROM performance_records)",
            );
            await runMaintenance(source, 'seed');
            await runMaintenance(source, 'migrate');
            expect(
                await source.query(
                    'SELECT count(*)::int AS count FROM performance_records',
                ),
            ).toEqual([{ count: 25 }]);
            expect(
                await source.query(
                    "SELECT name FROM gpus WHERE slug='nvidia-rtx-4080'",
                ),
            ).toEqual([{ name: 'Operator GPU' }]);
            expect(
                await source.query(
                    'SELECT max(fps_avg) AS fps FROM performance_records',
                ),
            ).toEqual([{ fps: 999 }]);
            expect(
                await source.query(
                    'SELECT count(*)::int AS count FROM migrations',
                ),
            ).toEqual([{ count: 3 }]);
        });
        (process.env.AZURE_DB_TEST_CONTAINER ? it : it.skip)(
            'restores a PG16 custom dump including ledger, indexes, IDs and sequence state',
            async () => {
                await runMaintenance(source, 'migrate');
                await runMaintenance(source, 'seed');
                const container = process.env.AZURE_DB_TEST_CONTAINER!;
                const restored = `${name}_restore`;
                await admin.query(`CREATE DATABASE ${restored}`);
                const dump = execFileSync('docker', [
                    'exec',
                    container,
                    'pg_dump',
                    '-U',
                    'postgres',
                    '-d',
                    name,
                    '--format=custom',
                    '--no-owner',
                    '--no-acl',
                ]);
                execFileSync(
                    'docker',
                    [
                        'exec',
                        '-i',
                        container,
                        'pg_restore',
                        '-U',
                        'postgres',
                        '-d',
                        restored,
                        '--no-owner',
                        '--no-acl',
                        '--exit-on-error',
                    ],
                    { input: dump },
                );
                const restoredSource = new DataSource({
                    ...(source.options as PostgresConnectionOptions),
                    database: restored,
                });
                await restoredSource.initialize();
                try {
                    expect(
                        await restoredSource.query(
                            'SELECT count(*)::int AS count FROM performance_records',
                        ),
                    ).toEqual([{ count: 25 }]);
                    expect(
                        await restoredSource.query(
                            'SELECT count(*)::int AS count FROM migrations',
                        ),
                    ).toEqual([{ count: 3 }]);
                    expect(
                        await restoredSource.query(
                            "SELECT indexname FROM pg_indexes WHERE indexname='idx_perf_lookup'",
                        ),
                    ).toHaveLength(1);
                    expect(
                        await restoredSource.query(
                            "SELECT nextval('games_id_seq')::int AS next",
                        ),
                    ).toEqual([{ next: 11 }]);
                    await runMaintenance(restoredSource, 'migrate');
                } finally {
                    await restoredSource.destroy();
                    await admin.query(`DROP DATABASE ${restored} WITH (FORCE)`);
                }
            },
        );
        it.each(['fresh', 'legacy'])(
            'adopts %s schema and keeps IDs, indexes and lifecycle data',
            async (kind) => {
                for (const file of [
                    '01-enums-schema.sql',
                    '02-hardware-schema.sql',
                    '03-games-schema.sql',
                    '04-performance-schema.sql',
                    '05-seed.sql',
                ])
                    await source.query(
                        readFileSync(
                            resolve(infra, 'init-scripts', file),
                            'utf8',
                        ),
                    );
                if (kind === 'legacy') {
                    await source.query(
                        'ALTER TABLE games DROP COLUMN status, DROP COLUMN rawg_id, DROP COLUMN rawg_payload, DROP COLUMN metadata_provenance, DROP COLUMN rejection_reason',
                    );
                    await source.query(
                        'ALTER TABLE performance_records DROP COLUMN source',
                    );
                    await source.query(
                        "UPDATE performance_records SET source_url='gemini' WHERE id=1",
                    );
                } else
                    await source.query(
                        "UPDATE games SET status='rejected', rejection_reason='operator', metadata_provenance='{\"origin\":\"operator\"}' WHERE id=1",
                    );
                await runMaintenance(source, 'migrate');
                await runMaintenance(source, 'migrate');
                expect(
                    await source.query(
                        'SELECT count(*)::int AS count FROM games',
                    ),
                ).toEqual([{ count: 10 }]);
                expect(
                    await source.query(
                        'SELECT id FROM games ORDER BY id LIMIT 1',
                    ),
                ).toEqual([{ id: 1 }]);
                if (kind === 'legacy')
                    expect(
                        await source.query(
                            'SELECT source FROM performance_records WHERE id=1',
                        ),
                    ).toEqual([{ source: 'gemini' }]);
                else
                    expect(
                        await source.query(
                            'SELECT status, rejection_reason FROM games WHERE id=1',
                        ),
                    ).toEqual([
                        { status: 'rejected', rejection_reason: 'operator' },
                    ]);
                expect(
                    await source.query(
                        "SELECT indexname FROM pg_indexes WHERE indexname='idx_perf_lookup'",
                    ),
                ).toHaveLength(1);
            },
        );
        it('rejects a concurrent maintenance execution without mutating the schema', async () => {
            const lock = source.createQueryRunner();
            await lock.connect();
            await lock.query('SELECT pg_advisory_lock(1128878665, 3)');
            try {
                await expect(runMaintenance(source, 'migrate')).rejects.toThrow(
                    'already running',
                );
            } finally {
                await lock.query('SELECT pg_advisory_unlock(1128878665, 3)');
                await lock.release();
            }
            expect(
                await source.query(
                    "SELECT to_regclass('public.migrations') AS ledger",
                ),
            ).toEqual([{ ledger: null }]);
        });
        it('rolls back incompatible partial schemas without recording a baseline', async () => {
            await source.query('CREATE TABLE games (id integer PRIMARY KEY)');
            await expect(runMaintenance(source, 'migrate')).rejects.toThrow(
                'Partial',
            );
            expect(await source.query('SELECT * FROM migrations')).toEqual([]);
        });
    },
);

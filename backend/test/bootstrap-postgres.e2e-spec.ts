import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DataSource } from 'typeorm';

import {
    maintenanceDataSource,
    runMaintenance,
} from '../src/database/maintenance';

const suite = process.env.AZURE_DB_TEST_CONTAINER ? describe : describe.skip;
suite(
    'PG16 bootstrap SQL privileges (local pgaadauth stub; Azure behavior unverified)',
    () => {
        const container = process.env.AZURE_DB_TEST_CONTAINER!;
        const appDb = 'ciri_bootstrap_check';
        const ids = [
            '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333',
        ];
        let script: string;
        function psql(
            sql: string,
            database = 'postgres',
            variables: string[] = [],
        ): string {
            return execFileSync(
                'docker',
                [
                    'exec',
                    '-i',
                    container,
                    'psql',
                    '-X',
                    '-U',
                    'postgres',
                    '-d',
                    database,
                    '-v',
                    'ON_ERROR_STOP=1',
                    '-At',
                    ...variables,
                ],
                {
                    input: sql,
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'pipe'],
                },
            );
        }
        function bootstrap(sql = script): string {
            return psql(sql, 'postgres', [
                '-v',
                `app_db=${appDb}`,
                '-v',
                `runtime_oid=${ids[0]}`,
                '-v',
                `migrator_oid=${ids[1]}`,
                '-v',
                `exporter_oid=${ids[2]}`,
            ]);
        }
        beforeAll(() => {
            script = readFileSync(
                process.env.BOOTSTRAP_TEST_SOURCE_PATH ??
                    resolve(
                        __dirname,
                        '../../infra/database/azure/bootstrap-roles.sql',
                    ),
                'utf8',
            );
            psql(`DROP DATABASE IF EXISTS ${appDb} WITH (FORCE); CREATE DATABASE ${appDb};
            CREATE TABLE IF NOT EXISTS public.local_entra_stub (rolename text, objectid text, principaltype text, isadmin integer);
            TRUNCATE public.local_entra_stub;
            CREATE OR REPLACE FUNCTION pg_catalog.pgaadauth_create_principal_with_oid(role_name text, object_id text, principal_type text, admin boolean, mfa boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE format('CREATE ROLE %I LOGIN',role_name); INSERT INTO public.local_entra_stub VALUES (role_name,object_id,principal_type,0); END $$;
            CREATE OR REPLACE FUNCTION pg_catalog.pgaadauth_list_principals(include_admin boolean) RETURNS TABLE(rolename text, objectid text, principaltype text, isadmin integer) LANGUAGE sql AS $$ SELECT * FROM public.local_entra_stub $$;`);
            // Dedicated disposable server only. Keep any already-created local roles mapped.
            for (const [index, role] of [
                'ciri-runtime',
                'ciri-migrator',
                'ciri-exporter',
            ].entries())
                psql(
                    `INSERT INTO public.local_entra_stub SELECT '${role}', '${ids[index]}', 'service', 0 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}')`,
                );
        });
        afterAll(() => {
            psql(`DROP DATABASE ${appDb} WITH (FORCE)`);
        });
        it('returns a nonzero exit for missing variables', () => {
            expect(() => psql(script)).toThrow();
        });
        it('reconciles drifted global and schema defaults on rerun', () => {
            bootstrap();
            psql(
                `SET ROLE "ciri-migrator";
            ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC, "ciri-runtime", "ciri-exporter";
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC, "ciri-runtime", "ciri-exporter";
            ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO PUBLIC, "ciri-runtime", "ciri-exporter";
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO PUBLIC, "ciri-runtime", "ciri-exporter";
            ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC, "ciri-runtime", "ciri-exporter";
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, "ciri-runtime", "ciri-exporter";
            ALTER DEFAULT PRIVILEGES GRANT USAGE ON TYPES TO PUBLIC;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON TYPES TO PUBLIC;`,
                appDb,
            );
            bootstrap();
            bootstrap();
            psql(
                `SET ROLE "ciri-migrator"; CREATE TABLE future_readonly(id serial PRIMARY KEY, value text); CREATE FUNCTION future_function() RETURNS integer LANGUAGE sql AS $$SELECT 1$$; CREATE TYPE future_type AS ENUM ('one');`,
                appDb,
            );
            expect(
                psql(
                    `SELECT has_table_privilege('ciri-runtime','future_readonly','SELECT'), has_table_privilege('ciri-runtime','future_readonly','INSERT'), has_table_privilege('ciri-exporter','future_readonly','UPDATE'), has_sequence_privilege('ciri-runtime','future_readonly_id_seq','USAGE'), has_sequence_privilege('ciri-exporter','future_readonly_id_seq','SELECT'), has_function_privilege('ciri-runtime','future_function()','EXECUTE'), has_function_privilege('ciri-exporter','future_function()','EXECUTE'), has_type_privilege('ciri-runtime','future_type','USAGE');`,
                    appDb,
                ).trim(),
            ).toBe('t|f|f|f|t|f|f|t');
            expect(() =>
                psql(
                    'SET ROLE "ciri-runtime"; DELETE FROM future_readonly;',
                    appDb,
                ),
            ).toThrow();
            expect(() =>
                psql(
                    'SET ROLE "ciri-exporter"; INSERT INTO future_readonly(value) VALUES (\'bad\');',
                    appDb,
                ),
            ).toThrow();
            expect(() =>
                psql(
                    'SET ROLE "ciri-runtime"; CREATE TABLE forbidden(id int);',
                    appDb,
                ),
            ).toThrow();
        });
        it('migrates and seeds as the schema-only migrator; runtime writes only approved tables', async () => {
            psql('CREATE EXTENSION IF NOT EXISTS pg_trgm', appDb);
            const original = maintenanceDataSource({
                POSTGRES_HOST: process.env.AZURE_DB_TEST_HOST ?? '127.0.0.1',
                POSTGRES_PORT: process.env.AZURE_DB_TEST_PORT ?? '55436',
                POSTGRES_USER: 'postgres',
                POSTGRES_PASSWORD: 'ciri-test',
                POSTGRES_DB: appDb,
            });
            const source = new DataSource({
                ...original.options,
                extra: {
                    ...(original.options.extra as Record<string, unknown>),
                    options: '-c role=ciri-migrator',
                },
            });
            await source.initialize();
            try {
                await runMaintenance(source, 'migrate');
                await runMaintenance(source, 'seed');
            } finally {
                await source.destroy();
            }
            expect(
                psql(
                    `SET ROLE "ciri-runtime"; INSERT INTO cpus(slug,name,manufacturer,cores,threads,base_clock_ghz) VALUES ('operator-cpu','CPU','Intel',4,8,3); UPDATE cpus SET name='Edited' WHERE slug='operator-cpu'; SELECT name FROM cpus WHERE slug='operator-cpu';`,
                    appDb,
                ),
            ).toContain('Edited');
            expect(() =>
                psql('SET ROLE "ciri-runtime"; DELETE FROM cpus', appDb),
            ).toThrow();
            expect(() =>
                psql(
                    'SET ROLE "ciri-runtime"; INSERT INTO game_engines(name) VALUES (\'forbidden\')',
                    appDb,
                ),
            ).toThrow();
            expect(() =>
                psql(
                    'SET ROLE "ciri-runtime"; INSERT INTO migrations(timestamp,name) VALUES (1,\'forbidden\')',
                    appDb,
                ),
            ).toThrow();
            expect(
                psql(
                    'SET ROLE "ciri-exporter"; SELECT count(*) FROM performance_records',
                    appDb,
                ),
            ).toContain('25');
            expect(() =>
                psql(
                    'SET ROLE "ciri-exporter"; UPDATE cpus SET name=\'bad\'',
                    appDb,
                ),
            ).toThrow();
        });
        it('rejects conflicting Entra object IDs and role elevation', () => {
            expect(() =>
                bootstrap(
                    script.replace(
                        ":'runtime_oid'::uuid",
                        "'44444444-4444-4444-4444-444444444444'::uuid",
                    ),
                ),
            ).toThrow();
            psql('ALTER ROLE "ciri-runtime" CREATEDB');
            try {
                expect(() => bootstrap()).toThrow();
            } finally {
                psql('ALTER ROLE "ciri-runtime" NOCREATEDB');
            }
        });
    },
);

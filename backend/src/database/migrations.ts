import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MigrationInterface, QueryRunner } from 'typeorm';

// Source and compiled tools use the same checked-in SQL; HTTP startup never invokes it.
const toolsInfra = resolve(__dirname, '../../infra');
export const infraDirectory = existsSync(resolve(toolsInfra, 'init-scripts'))
    ? toolsInfra
    : resolve(__dirname, '../../../infra');
const tables = [
    'game_engines',
    'gpus',
    'cpus',
    'games',
    'game_requirements',
    'performance_records',
];
function sql(directory: string, name: string): string {
    return readFileSync(
        resolve(infraDirectory, directory, name),
        'utf8',
    ).replace(/^\s*(BEGIN|COMMIT);\s*$/gm, '');
}

export class AzureBaseline1790985600000 implements MigrationInterface {
    async up(runner: QueryRunner): Promise<void> {
        const present = (await runner.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)",
            [tables],
        )) as { tablename: string }[];
        if (!present.length) {
            for (const file of [
                '01-enums-schema.sql',
                '02-hardware-schema.sql',
                '03-games-schema.sql',
                '04-performance-schema.sql',
            ])
                await runner.query(sql('init-scripts', file));
        } else {
            if (present.length !== tables.length)
                throw new Error(
                    'Partial application schema; review before baseline adoption',
                );
            const columns = (await runner.query(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='games'",
            )) as { column_name: string }[];
            const lifecycle = [
                'status',
                'rawg_id',
                'rawg_payload',
                'metadata_provenance',
                'rejection_reason',
            ];
            const found = lifecycle.filter((name) =>
                columns.some((column) => column.column_name === name),
            );
            if (!found.length)
                await runner.query(
                    sql('migrations', '001-v2-game-lifecycle.sql'),
                );
            else if (found.length !== lifecycle.length)
                throw new Error(
                    'Partial game lifecycle schema; review before baseline adoption',
                );
            const constraints = (await runner.query(
                "SELECT conname FROM pg_constraint WHERE conrelid='public.games'::regclass",
            )) as { conname: string }[];
            for (const name of [
                'games_status_check',
                'games_rawg_id_key',
                'games_rawg_id_check',
                'games_rawg_payload_check',
                'games_metadata_provenance_check',
                'games_rejection_reason_check',
            ]) {
                if (
                    !constraints.some(
                        (constraint) => constraint.conname === name,
                    )
                )
                    throw new Error(`Incompatible game schema missing ${name}`);
            }
        }
    }
    down(): Promise<void> {
        throw new Error('Baseline is irreversible; restore an approved backup');
    }
}

export class PerformanceSource1790985600001 implements MigrationInterface {
    async up(runner: QueryRunner): Promise<void> {
        await runner.query(
            sql('migrations', '002-demo-performance-source.sql'),
        );
    }
    down(): Promise<void> {
        throw new Error(
            'Performance source migration preserves provenance and cannot be reversed',
        );
    }
}

export class RuntimeGrants1790985600002 implements MigrationInterface {
    async up(runner: QueryRunner): Promise<void> {
        // Local Compose has no Azure roles. Azure bootstrap supplies all three.
        const roles = (await runner.query(
            "SELECT rolname FROM pg_roles WHERE rolname IN ('ciri-runtime','ciri-migrator','ciri-exporter')",
        )) as { rolname: string }[];
        if (!roles.length) return;
        if (roles.length !== 3)
            throw new Error('Incomplete Azure SQL bootstrap');
        await runner.query(
            'GRANT USAGE ON SCHEMA public TO "ciri-runtime", "ciri-exporter"',
        );
        await runner.query(
            'GRANT SELECT ON ALL TABLES IN SCHEMA public TO "ciri-runtime", "ciri-exporter"',
        );
        await runner.query(
            'GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO "ciri-exporter"',
        );
        for (const table of tables.filter(
            (table) => table !== 'game_engines',
        )) {
            await runner.query(
                `GRANT INSERT, UPDATE ON TABLE public.${table} TO "ciri-runtime"`,
            );
            await runner.query(
                `GRANT USAGE ON SEQUENCE public.${table}_id_seq TO "ciri-runtime"`,
            );
        }
    }
    down(): Promise<void> {
        throw new Error(
            'Review grants explicitly before removing runtime access',
        );
    }
}

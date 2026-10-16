import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Canonical schema and seed SQL, shared with Compose's docker-entrypoint-initdb.d mount. */
export const INIT_SCRIPTS_DIR = resolve(__dirname, '..', 'init-scripts');

export const INIT_SCRIPT_FILES = [
    '01-enums-schema.sql',
    '02-hardware-schema.sql',
    '03-games-schema.sql',
    '04-performance-schema.sql',
    '05-seed.sql',
] as const;

/**
 * Creates the schema and seed on an empty database. Databases initialized by
 * Compose from the same SQL (where `games` already exists) only record it.
 */
export class Baseline1792022400000 implements MigrationInterface {
    name = 'Baseline1792022400000';

    private readonly logger = new Logger('Migrations');

    async up(queryRunner: QueryRunner): Promise<void> {
        const [{ exists }] = (await queryRunner.query(
            `SELECT to_regclass('public.games') IS NOT NULL AS "exists"`,
        )) as { exists: boolean }[];
        if (exists) {
            this.logger.log(
                'Baseline: schema already present, recording without changes',
            );
            return;
        }

        for (const file of INIT_SCRIPT_FILES) {
            await queryRunner.query(
                readFileSync(join(INIT_SCRIPTS_DIR, file), 'utf8'),
            );
        }
        this.logger.log('Baseline: schema and seed applied');
    }

    // Irreversible by design; re-running up() against existing tables is a no-op.
    async down(): Promise<void> {}
}

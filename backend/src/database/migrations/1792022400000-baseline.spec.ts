import { Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { QueryRunner } from 'typeorm';

import {
    Baseline1792022400000,
    INIT_SCRIPT_FILES,
    INIT_SCRIPTS_DIR,
} from './1792022400000-baseline';

const fakeRunner = (schemaExists: boolean) => {
    const query = jest.fn((sql: string) =>
        Promise.resolve(
            sql.includes('to_regclass') ? [{ exists: schemaExists }] : [],
        ),
    );
    return { runner: { query } as unknown as QueryRunner, query };
};

describe('Baseline1792022400000', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('lists the five init scripts in run order', () => {
        expect(INIT_SCRIPT_FILES).toEqual([
            '01-enums-schema.sql',
            '02-hardware-schema.sql',
            '03-games-schema.sql',
            '04-performance-schema.sql',
            '05-seed.sql',
        ]);
    });

    it('resolves every init script on disk', () => {
        for (const file of INIT_SCRIPT_FILES) {
            expect(existsSync(join(INIT_SCRIPTS_DIR, file))).toBe(true);
        }
    });

    it('only records itself when the games table already exists', async () => {
        const { runner, query } = fakeRunner(true);

        await new Baseline1792022400000().up(runner);

        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][0]).toContain("to_regclass('public.games')");
    });

    it('runs the init scripts in order on an empty database', async () => {
        const { runner, query } = fakeRunner(false);

        await new Baseline1792022400000().up(runner);

        expect(query.mock.calls.slice(1).map(([sql]) => sql)).toEqual(
            INIT_SCRIPT_FILES.map((file) =>
                readFileSync(join(INIT_SCRIPTS_DIR, file), 'utf8'),
            ),
        );
        expect(query.mock.calls[1][0]).toContain('CREATE TYPE gpu_brand');
        expect(query.mock.calls[5][0]).toContain(
            'INSERT INTO public.game_engines',
        );
    });
});

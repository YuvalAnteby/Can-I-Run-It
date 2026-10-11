import { DataSource, MigrationExecutor } from 'typeorm';

import { runMaintenance } from './maintenance';

describe('database maintenance lock boundary', () => {
    type QueryRunnerStub = {
        connect: jest.Mock;
        query: jest.Mock;
        release: jest.Mock;
    };

    const makeSource = (runner: QueryRunnerStub): DataSource =>
        ({
            createQueryRunner: jest.fn(() => runner),
            options: { migrations: [] },
            driver: {
                options: { type: 'postgres', schema: undefined },
                database: undefined,
                buildTableName: jest.fn((table: string) => table),
            },
        }) as unknown as DataSource;

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('fails closed when another maintenance run owns the advisory lock', async () => {
        const runner: QueryRunnerStub = {
            connect: jest.fn(),
            query: jest.fn().mockResolvedValue([{ acquired: false }]),
            release: jest.fn(),
        };

        await expect(
            runMaintenance(makeSource(runner), 'migrate'),
        ).rejects.toThrow(/already running|lock/i);
        expect(runner.connect).toHaveBeenCalledTimes(1);
        expect(runner.query).toHaveBeenCalledTimes(1);
        expect(runner.release).toHaveBeenCalledTimes(1);
    });

    it('releases the advisory lock and runner when migration execution fails', async () => {
        const runner: QueryRunnerStub = {
            connect: jest.fn(),
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            release: jest.fn(),
        };
        jest.spyOn(
            MigrationExecutor.prototype,
            'executePendingMigrations',
        ).mockRejectedValue(new Error('migration failed'));

        await expect(
            runMaintenance(makeSource(runner), 'migrate'),
        ).rejects.toThrow('migration failed');
        expect(runner.query).toHaveBeenCalledTimes(2);
        expect(runner.query).toHaveBeenNthCalledWith(
            2,
            expect.stringMatching(/advisory_unlock/i),
        );
        expect(runner.release).toHaveBeenCalledTimes(1);
    });

    it('reports pending status while preserving the same lock cleanup path', async () => {
        const runner: QueryRunnerStub = {
            connect: jest.fn(),
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            release: jest.fn(),
        };
        jest.spyOn(
            MigrationExecutor.prototype,
            'showMigrations',
        ).mockResolvedValue(true);

        await expect(
            runMaintenance(makeSource(runner), 'status'),
        ).resolves.toBe(true);
        expect(runner.query).toHaveBeenCalledTimes(2);
        expect(runner.query).toHaveBeenNthCalledWith(
            2,
            expect.stringMatching(/advisory_unlock/i),
        );
        expect(runner.release).toHaveBeenCalledTimes(1);
    });

    it('rejects unknown commands before opening a query runner', async () => {
        const runner: QueryRunnerStub = {
            connect: jest.fn(),
            query: jest.fn(),
            release: jest.fn(),
        };
        const source = makeSource(runner);

        await expect(runMaintenance(source, 'drop')).rejects.toThrow(
            /Expected.*migrate.*seed.*status/i,
        );
        expect(runner.query).not.toHaveBeenCalled();
    });

    it('releases the runner even when unlocking fails and keeps the migration error', async () => {
        const runner: QueryRunnerStub = {
            connect: jest.fn(),
            query: jest
                .fn()
                .mockResolvedValueOnce([{ acquired: true }])
                .mockRejectedValueOnce(new Error('unlock failed')),
            release: jest.fn(),
        };
        jest.spyOn(
            MigrationExecutor.prototype,
            'executePendingMigrations',
        ).mockRejectedValue(new Error('migration failed'));

        await expect(
            runMaintenance(makeSource(runner), 'migrate'),
        ).rejects.toThrow('migration failed');
        expect(runner.release).toHaveBeenCalledTimes(1);
    });

    it('propagates runner release failures after a successful unlock', async () => {
        const runner: QueryRunnerStub = {
            connect: jest.fn(),
            query: jest.fn().mockResolvedValue([{ acquired: true }]),
            release: jest.fn().mockRejectedValue(new Error('release failed')),
        };
        jest.spyOn(
            MigrationExecutor.prototype,
            'showMigrations',
        ).mockResolvedValue(false);

        await expect(
            runMaintenance(makeSource(runner), 'status'),
        ).rejects.toThrow('release failed');
        expect(runner.query).toHaveBeenCalledTimes(2);
    });
});

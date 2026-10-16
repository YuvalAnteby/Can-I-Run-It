import { ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { DataSource } from 'typeorm';

import { HealthService } from './health.service';

describe('HealthService', () => {
    let service: HealthService;
    let health: { check: jest.Mock };
    let database: { pingCheck: jest.Mock };
    let dataSource: DataSource;

    beforeEach(() => {
        health = { check: jest.fn() };
        database = { pingCheck: jest.fn() };
        dataSource = {} as DataSource;
        service = new HealthService(
            health as unknown as HealthCheckService,
            database as unknown as TypeOrmHealthIndicator,
            dataSource,
        );
    });

    it('returns the live response without running health checks', () => {
        expect(service.live()).toEqual({ status: 'ok' });
        expect(health.check).not.toHaveBeenCalled();
        expect(database.pingCheck).not.toHaveBeenCalled();
    });

    it('returns ready after a successful database ping with a one-second timeout', async () => {
        health.check.mockResolvedValue({
            status: 'ok',
            info: { database: { status: 'up' } },
        });
        database.pingCheck.mockResolvedValue({
            database: { status: 'up' },
        });

        await expect(service.ready()).resolves.toEqual({ status: 'ok' });

        expect(health.check).toHaveBeenCalledWith([expect.any(Function)]);
        const [checks] = health.check.mock.calls[0] as [
            Array<() => Promise<unknown>>,
        ];
        await checks[0]();
        expect(database.pingCheck).toHaveBeenCalledWith('database', {
            connection: dataSource,
            timeout: 1_000,
        });
    });

    it('keeps the full PostgreSQL diagnostic result on the diagnostic method', async () => {
        const diagnostic = {
            status: 'ok',
            info: { database: { status: 'up' } },
            details: { database: { status: 'up' } },
        };
        health.check.mockResolvedValue(diagnostic);
        database.pingCheck.mockResolvedValue({
            database: { status: 'up' },
        });

        await expect(service.postgres()).resolves.toBe(diagnostic);

        expect(health.check).toHaveBeenCalledWith([expect.any(Function)]);
        const [checks] = health.check.mock.calls[0] as [
            Array<() => Promise<unknown>>,
        ];
        await checks[0]();
        expect(database.pingCheck).toHaveBeenCalledWith(
            'database',
            expect.objectContaining({ connection: dataSource }),
        );
    });

    it('maps database errors, including timeouts, to a sanitized 503 response', async () => {
        const failure = new Error(
            'timeout connecting to postgres.internal with password=secret',
        );
        health.check.mockImplementation(
            async (checks: Array<() => unknown>) => {
                await checks[0]();
                return { status: 'ok' };
            },
        );
        database.pingCheck.mockRejectedValue(failure);

        let error: unknown;
        try {
            await service.ready();
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getStatus()).toBe(503);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
            status: 'unavailable',
        });
        expect(JSON.stringify(error)).not.toContain('postgres.internal');
        expect(JSON.stringify(error)).not.toContain('secret');
    });
});

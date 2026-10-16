import { HealthCheckResult } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
    let controller: HealthController;
    let health: {
        live: jest.Mock;
        ready: jest.Mock;
        postgres: jest.Mock;
    };

    beforeEach(async () => {
        health = {
            live: jest.fn().mockReturnValue({ status: 'ok' }),
            ready: jest.fn().mockResolvedValue({ status: 'ok' }),
            postgres: jest.fn().mockResolvedValue({
                status: 'ok',
                info: { database: { status: 'up' } },
            } as unknown as HealthCheckResult),
        };

        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [{ provide: HealthService, useValue: health }],
        }).compile();

        controller = moduleFixture.get(HealthController);
    });

    it('delegates liveness to HealthService', () => {
        expect(controller.live()).toEqual({ status: 'ok' });
        expect(health.live).toHaveBeenCalledTimes(1);
    });

    it('delegates readiness to HealthService', async () => {
        await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
        expect(health.ready).toHaveBeenCalledTimes(1);
    });

    it('delegates PostgreSQL diagnostics to HealthService', async () => {
        const diagnostic = await controller.check();

        expect(diagnostic).toEqual({
            status: 'ok',
            info: { database: { status: 'up' } },
        });
        expect(health.postgres).toHaveBeenCalledTimes(1);
    });

    it('propagates the sanitized readiness exception from HealthService', async () => {
        const error = new Error('service unavailable');
        health.ready.mockRejectedValue(error);

        await expect(controller.ready()).rejects.toBe(error);
        expect(health.ready).toHaveBeenCalledTimes(1);
    });
});

import {
    HealthCheckService,
    HealthIndicatorService,
    TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';

import { RabbitMqService } from '../messaging/rabbitmq.service';
import { HealthController } from './health.controller';

type HealthIndicatorResult = Record<string, { status: string }>;
type HealthCheck = () => HealthIndicatorResult | Promise<HealthIndicatorResult>;
type HealthResult = {
    status: 'ok' | 'error';
    info?: HealthIndicatorResult;
    error?: HealthIndicatorResult;
};

const summarizeHealth = async (
    checks: HealthCheck[],
): Promise<HealthResult> => {
    const results = await Promise.all(
        checks.map((check) => Promise.resolve(check())),
    );
    const result = results.reduce<HealthIndicatorResult>(
        (combined, current) => ({ ...combined, ...current }),
        {},
    );
    const error = Object.entries(result).reduce<HealthIndicatorResult>(
        (down, [name, indicator]) => {
            if (indicator.status === 'down') {
                down[name] = indicator;
            }
            return down;
        },
        {},
    );

    return Object.keys(error).length > 0
        ? { status: 'error', error }
        : { status: 'ok', info: result };
};

describe('HealthController', () => {
    let controller: HealthController;
    let rabbitMq: { isConnected: jest.Mock };

    beforeEach(async () => {
        rabbitMq = { isConnected: jest.fn().mockReturnValue(true) };
        const health = { check: jest.fn(summarizeHealth) };
        const rabbitMqIndicator = {
            check: jest.fn(() => ({
                up: (): HealthIndicatorResult => ({
                    rabbitmq: { status: 'up' },
                }),
                down: (): HealthIndicatorResult => ({
                    rabbitmq: { status: 'down' },
                }),
            })),
        };
        const database = {
            pingCheck: jest.fn().mockResolvedValue({
                database: { status: 'up' },
            }),
        };

        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                { provide: HealthCheckService, useValue: health },
                {
                    provide: HealthIndicatorService,
                    useValue: rabbitMqIndicator,
                },
                { provide: RabbitMqService, useValue: rabbitMq },
                { provide: TypeOrmHealthIndicator, useValue: database },
                { provide: 'DATA_SOURCE', useValue: {} },
            ],
        }).compile();

        controller = moduleFixture.get(HealthController);
    });

    it('reports a connected RabbitMQ broker as up without exposing the URL', async () => {
        const result = await controller.checkRabbitMq();

        expect(result).toEqual({
            status: 'ok',
            info: { rabbitmq: { status: 'up' } },
        });
        expect(JSON.stringify(result)).not.toContain('amqp://');
    });

    it('reports a disconnected RabbitMQ broker as down while Postgres stays healthy', async () => {
        rabbitMq.isConnected.mockReturnValue(false);

        const rabbitResult = await controller.checkRabbitMq();
        const postgresResult = await controller.check();

        expect(rabbitResult).toEqual({
            status: 'error',
            error: { rabbitmq: { status: 'down' } },
        });
        expect(postgresResult).toEqual({
            status: 'ok',
            info: { database: { status: 'up' } },
        });
    });
});

import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'net';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { RawgClient } from '../src/modules/games/rawg.client';
import { GeminiService } from '../src/modules/gemini/gemini.service';

interface HealthResponse {
    status: string;
    [key: string]: unknown;
}

const quoteIdentifier = (value: string): string =>
    `"${value.replaceAll('"', '""')}"`;

const wait = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('HealthController (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let adminDataSource: DataSource;
    const targetDatabase = process.env.POSTGRES_DB || 'test_db';

    const server = (): Server => app.getHttpServer() as Server;

    const setConnectionsAllowed = async (allowed: boolean): Promise<void> => {
        await adminDataSource.query(
            `ALTER DATABASE ${quoteIdentifier(targetDatabase)} ALLOW_CONNECTIONS ${allowed ? 'true' : 'false'}`,
        );
    };

    const terminateTargetSessions = async (): Promise<void> => {
        await adminDataSource.query(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
            [targetDatabase],
        );
    };

    const waitForReady = async (): Promise<void> => {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
            const response = await request(server()).get('/api/health/ready');
            if (response.status === 200) {
                expect(response.body).toEqual({ status: 'ok' });
                return;
            }
            await wait(100);
        }
        throw new Error(
            'PostgreSQL readiness did not recover within 10 seconds',
        );
    };

    beforeAll(async () => {
        if (targetDatabase !== 'test_db') {
            throw new Error(
                `Refusing to disable connections for non-test database: ${targetDatabase}`,
            );
        }

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('api');
        app.enableVersioning({
            type: VersioningType.URI,
            defaultVersion: '1',
        });
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                transformOptions: { enableImplicitConversion: true },
            }),
        );
        await app.init();

        dataSource = app.get<DataSource>('DATA_SOURCE');
        adminDataSource = new DataSource({
            type: 'postgres',
            host: process.env.POSTGRES_HOST || 'postgres',
            port: Number(process.env.POSTGRES_PORT || 5432),
            username: process.env.POSTGRES_USER || 'username',
            password: process.env.POSTGRES_PASSWORD || 'changeme',
            database: 'postgres',
        });
        await adminDataSource.initialize();
    });

    afterAll(async () => {
        if (adminDataSource?.isInitialized) {
            try {
                await setConnectionsAllowed(true);
            } finally {
                await adminDataSource.destroy();
            }
        }
        if (app) await app.close();
        if (dataSource?.isInitialized) await dataSource.destroy();
    });

    it('serves unversioned liveness repeatedly without authentication, throttling, or provider calls', async () => {
        const healthCheckSpy = jest
            .spyOn(HealthCheckService.prototype, 'check')
            .mockRejectedValue(
                new Error('liveness must not check dependencies'),
            );
        const pingCheckSpy = jest
            .spyOn(TypeOrmHealthIndicator.prototype, 'pingCheck')
            .mockRejectedValue(new Error('liveness must not ping PostgreSQL'));
        const querySpy = jest
            .spyOn(dataSource, 'query')
            .mockRejectedValue(new Error('liveness must not query PostgreSQL'));
        const geminiSpy = jest
            .spyOn(app.get(GeminiService), 'estimate')
            .mockRejectedValue(new Error('liveness must not call Gemini'));
        const rawgSearchSpy = jest
            .spyOn(app.get(RawgClient), 'search')
            .mockRejectedValue(new Error('liveness must not call RAWG'));
        const rawgDetailSpy = jest
            .spyOn(app.get(RawgClient), 'getById')
            .mockRejectedValue(new Error('liveness must not call RAWG'));

        try {
            for (let attempt = 0; attempt < 12; attempt += 1) {
                const response =
                    await request(server()).get('/api/health/live');
                expect(response.status).toBe(200);
                expect(response.body).toEqual({ status: 'ok' });
            }
            expect(healthCheckSpy).not.toHaveBeenCalled();
            expect(pingCheckSpy).not.toHaveBeenCalled();
            expect(querySpy).not.toHaveBeenCalled();
            expect(geminiSpy).not.toHaveBeenCalled();
            expect(rawgSearchSpy).not.toHaveBeenCalled();
            expect(rawgDetailSpy).not.toHaveBeenCalled();
        } finally {
            healthCheckSpy.mockRestore();
            pingCheckSpy.mockRestore();
            querySpy.mockRestore();
            geminiSpy.mockRestore();
            rawgSearchSpy.mockRestore();
            rawgDetailSpy.mockRestore();
        }
    });

    it('returns the healthy readiness body without exposing diagnostics', async () => {
        await request(server())
            .get('/api/health/ready')
            .expect(200)
            .expect({ status: 'ok' });
    });

    it('returns a sanitized 503 within the database timeout for an unresolved query', async () => {
        const querySpy = jest
            .spyOn(dataSource, 'query')
            .mockImplementation(() => new Promise<never>(() => undefined));

        try {
            const startedAt = Date.now();
            const response = await request(server()).get('/api/health/ready');

            expect(Date.now() - startedAt).toBeLessThan(1_500);
            expect(response.status).toBe(503);
            expect(response.body).toEqual({ status: 'unavailable' });
            expect(JSON.stringify(response.body)).not.toMatch(
                /postgres|password|timeout|connection/i,
            );
        } finally {
            querySpy.mockRestore();
        }

        await request(server())
            .get('/api/health/ready')
            .expect(200)
            .expect({ status: 'ok' });
    });

    it('keeps readiness failures isolated from liveness and recovers on the same app and DataSource', async () => {
        const initialApp = app;
        const initialDataSource = dataSource;

        try {
            await setConnectionsAllowed(false);
            await terminateTargetSessions();

            for (let attempt = 0; attempt < 2; attempt += 1) {
                const startedAt = Date.now();
                const ready = await request(server()).get('/api/health/ready');
                expect(Date.now() - startedAt).toBeLessThan(1_500);
                expect(ready.status).toBe(503);
                expect(ready.body).toEqual({ status: 'unavailable' });

                await request(server())
                    .get('/api/health/live')
                    .expect(200)
                    .expect({ status: 'ok' });
            }
        } finally {
            await setConnectionsAllowed(true);
        }

        await waitForReady();
        expect(app).toBe(initialApp);
        expect(app.get<DataSource>('DATA_SOURCE')).toBe(initialDataSource);
        expect(dataSource.isInitialized).toBe(true);
    });

    it('/api/health/postgres (GET) preserves the diagnostic contract', () => {
        return request(server())
            .get('/api/health/postgres')
            .expect(200)
            .expect((res) => {
                const body = res.body as HealthResponse;

                expect(body).toHaveProperty('status', 'ok');
                expect(body).toHaveProperty('info');
                expect(body.info).toHaveProperty('database');
                expect(
                    (body.info as Record<string, unknown>).database,
                ).toHaveProperty('status', 'up');
            });
    });
});

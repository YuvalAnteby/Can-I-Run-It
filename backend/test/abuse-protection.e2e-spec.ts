import type { Server } from 'node:net';

import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { RawgClient } from '../src/modules/games/rawg.client';
import { GeminiService } from '../src/modules/gemini/gemini.service';

const rawgId = 1_700_000_000 + (process.pid % 100_000);

describe('abuse protection (isolated e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let dateNow: jest.SpyInstance<number, []>;
    let rawg: { search: jest.Mock; getById: jest.Mock };
    let observedIps: string[];
    const savedEnvironment = new Map<string, string | undefined>();
    const limitEnvironment = {
        EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: '10',
        EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: '100',
        GEMINI_REQUESTS_PER_MINUTE: '30',
        RAWG_REQUESTS_PER_MINUTE: '60',
        GEMINI_MAX_CONCURRENT: '2',
        RAWG_MAX_CONCURRENT: '4',
        GEMINI_TIMEOUT_MS: '8000',
        RAWG_TIMEOUT_MS: '3000',
        TRUST_PROXY: '1',
    } as const;

    const api = () => request(app.getHttpServer() as Server);

    const withClientIp = (value: string) => ({
        get: (path: string) => api().get(path).set('X-Forwarded-For', value),
        post: (path: string) => api().post(path).set('X-Forwarded-For', value),
    });

    const checkBody = (cpuId: number, gpuId: number) => ({
        gameSlug: 'cyberpunk-2077',
        hardware: { cpuId, gpuId, ramGb: 32, isSsd: true },
        settings: {
            resolutionWidth: 1920,
            resolutionHeight: 1080,
            tier: 'recommended',
            preset: 'high',
            targetFps: 60,
        },
    });

    const admitCheck = (ip: string, body: Record<string, unknown>) =>
        withClientIp(ip).post('/api/v1/check').send(body);

    const admitDiscovery = (ip: string) =>
        withClientIp(ip)
            .get('/api/v2/games/discover')
            .query({ q: 'Cyberpunk' });

    const admitSelection = (ip: string) =>
        withClientIp(ip).post(`/api/v2/games/rawg/${rawgId}/select`);

    beforeAll(async () => {
        for (const [key, value] of Object.entries(limitEnvironment)) {
            savedEnvironment.set(key, process.env[key]);
            process.env[key] = value;
        }

        rawg = {
            search: jest.fn().mockResolvedValue({
                available: false,
                results: [],
            }),
            getById: jest.fn().mockResolvedValue({
                id: rawgId,
                name: 'Issue 77 fixture',
                slug: 'issue-77-fixture',
                background_image: null,
                released: null,
                description_raw: null,
                developers: [],
                publishers: [],
                genres: [],
                tags: [],
                platforms: [],
            }),
        };

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(RawgClient)
            .useValue(rawg)
            .overrideProvider(GeminiService)
            .useValue({ estimate: jest.fn().mockResolvedValue(null) })
            .compile();

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
        const expressApp = app.getHttpAdapter().getInstance() as {
            set(setting: string, value: boolean | number): void;
            use(
                middleware: (
                    request: { ip?: string },
                    response: unknown,
                    next: () => void,
                ) => void,
            ): void;
        };
        expressApp.set('trust proxy', 1);
        observedIps = [];
        expressApp.use((request, _response, next) => {
            observedIps.push(request.ip ?? '');
            next();
        });

        await app.init();

        dataSource = app.get<DataSource>('DATA_SOURCE');
        await dataSource.query(`DELETE FROM games WHERE rawg_id = $1`, [
            rawgId,
        ]);
        dateNow = jest.spyOn(Date, 'now').mockReturnValue(0);
    });

    afterAll(async () => {
        dateNow?.mockRestore();
        if (dataSource?.isInitialized)
            await dataSource.query('DELETE FROM games WHERE rawg_id = $1', [
                rawgId,
            ]);
        if (app) await app.close();
        for (const [key, value] of savedEnvironment) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        if (dataSource?.isInitialized) await dataSource.destroy();
    });

    it('forwards only the trusted rightmost hop and shares one budget across real modules', async () => {
        const catalogBefore = observedIps.length;
        await api()
            .get('/api/v2/games')
            .set('X-Forwarded-For', '198.51.100.1, 203.0.113.10')
            .query({ limit: 1 })
            .expect(200);
        expect(observedIps[catalogBefore]).toBe('203.0.113.10');

        const untrusted = app.getHttpAdapter().getInstance() as {
            set(setting: string, value: boolean | number): void;
        };
        untrusted.set('trust proxy', false);
        const untrustedBefore = observedIps.length;
        await api()
            .get('/api/v2/games')
            .set('X-Forwarded-For', '198.51.100.99, 203.0.113.99')
            .query({ limit: 1 })
            .expect(200);
        expect(observedIps[untrustedBefore]).not.toBe('203.0.113.99');
        untrusted.set('trust proxy', 1);

        const leftRotationBefore = observedIps.length;
        await api()
            .get('/api/v2/games')
            .set('X-Forwarded-For', '198.51.100.2, 203.0.113.10')
            .query({ limit: 1 })
            .expect(200);
        expect(observedIps[leftRotationBefore]).toBe('203.0.113.10');

        const ipv6Before = observedIps.length;
        await api()
            .get('/api/v2/games')
            .set('X-Forwarded-For', '2001:db8::1, 2001:db8::2')
            .query({ limit: 1 })
            .expect(200);
        expect(observedIps[ipv6Before]).toBe('2001:db8::2');

        const headerlessBefore = observedIps.length;
        await api().get('/api/v2/games').query({ limit: 1 }).expect(200);
        expect(observedIps[headerlessBefore]).not.toBe('');

        const [{ cpuId, gpuId }] = await dataSource.query<
            { cpuId: number; gpuId: number }[]
        >(
            `SELECT
                (SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k') AS "cpuId",
                (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3080') AS "gpuId"`,
        );

        const sameIp = '203.0.113.10';
        const admitted = [
            () =>
                withClientIp(`198.51.100.1, ${sameIp}`)
                    .post('/api/v1/check')
                    .send(checkBody(cpuId, gpuId)),
            () =>
                withClientIp(`192.0.2.2, ${sameIp}`)
                    .get('/api/v2/games/discover')
                    .query({ q: 'Cyberpunk' }),
            () =>
                withClientIp(`198.51.100.3, ${sameIp}`).post(
                    `/api/v2/games/rawg/${rawgId}/select`,
                ),
            () => admitCheck(sameIp, checkBody(cpuId, gpuId)),
            () => admitDiscovery(sameIp),
            () => admitSelection(sameIp),
            () => admitCheck(sameIp, checkBody(cpuId, gpuId)),
            () => admitDiscovery(sameIp),
            () => admitSelection(sameIp),
            () => admitCheck(sameIp, checkBody(cpuId, gpuId)),
        ];
        for (const operation of admitted)
            await operation().expect((response) => {
                expect([200, 201]).toContain(response.status);
            });

        await admitDiscovery(sameIp)
            .expect(429)
            .expect((response) => {
                expect(response.headers['retry-after']).toBe('60');
            });

        await admitDiscovery('203.0.113.11').expect(200);

        const globalClients = Array.from(
            { length: 9 },
            (_, index) => `198.51.100.${20 + index}`,
        );
        for (const ip of globalClients) {
            for (let attempt = 0; attempt < 9; attempt += 1)
                await admitDiscovery(ip).expect(200);
        }
        for (let attempt = 0; attempt < 8; attempt += 1)
            await admitDiscovery('198.51.100.29').expect(200);

        await admitDiscovery('198.51.100.30')
            .expect(429)
            .expect((response) => {
                expect(response.headers['retry-after']).toBe('60');
            });

        await api().get('/api/v2/games').query({ limit: 1 }).expect(200);
        await api().get('/api/v1/cpus/intel-core-i7-13700k').expect(200);
        await api().get('/api/v1/gpus/nvidia-rtx-3080').expect(200);
        await api().get('/api/health/live').expect(200);
    });
});

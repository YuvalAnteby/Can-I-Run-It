import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'net';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';

interface HardwareResponse {
    id: number;
}

interface CheckResponse {
    source: string;
    verdict: string;
    targetFps: number;
}

describe('CheckController (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;

    beforeAll(async () => {
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
    });

    afterAll(async () => {
        if (!app) return;
        await app.close();
        await dataSource.destroy();
    });

    it('checks a seeded measured game through the public API', async () => {
        const cpu = await request(app.getHttpServer() as Server)
            .get('/api/v1/cpus/intel-core-i7-13700k')
            .expect(200);
        const gpu = await request(app.getHttpServer() as Server)
            .get('/api/v1/gpus/nvidia-rtx-3080')
            .expect(200);
        const cpuBody = cpu.body as HardwareResponse;
        const gpuBody = gpu.body as HardwareResponse;

        await request(app.getHttpServer() as Server)
            .post('/api/v1/check')
            .send({
                gameSlug: 'cyberpunk-2077',
                hardware: {
                    cpuId: cpuBody.id,
                    gpuId: gpuBody.id,
                    ramGb: 32,
                    isSsd: true,
                },
                settings: {
                    resolutionWidth: 1920,
                    resolutionHeight: 1080,
                    tier: 'recommended',
                    preset: 'ultra',
                    targetFps: 90,
                },
            })
            .expect(200)
            .expect((response) => {
                const body = response.body as CheckResponse;
                expect(body.source).toBe('measured');
                expect(body.verdict).toBe('Can run');
                expect(body.targetFps).toBe(90);
            });
    });

    it('does not reuse a non-null quality for an explicit-null published HTTP request', async () => {
        const [hardware] = await dataSource.query<
            { cpuId: number; gpuId: number }[]
        >(
            `SELECT
                (SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k') AS "cpuId",
                (SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3080') AS "gpuId"`,
        );
        const sourceUrl = 'https://example.test/explicit-null-quality';
        await dataSource.query(
            `INSERT INTO performance_records
                (game_id, gpu_id, cpu_id, ram_gb, res_width, res_height,
                 settings, upscaler, upscaler_quality, fps_avg, verified,
                 source, source_url)
             VALUES
                ((SELECT id FROM games WHERE slug = 'cyberpunk-2077'), $1, $2,
                 32, 1920, 1080, 'high', 'DLSS', 'quality', 144, true,
                 'measured', $3)`,
            [hardware.gpuId, hardware.cpuId, sourceUrl],
        );

        try {
            await request(app.getHttpServer() as Server)
                .post('/api/v1/check')
                .send({
                    gameSlug: 'cyberpunk-2077',
                    hardware: {
                        cpuId: hardware.cpuId,
                        gpuId: hardware.gpuId,
                        ramGb: 32,
                        isSsd: true,
                    },
                    settings: {
                        resolutionWidth: 1920,
                        resolutionHeight: 1080,
                        tier: 'recommended',
                        preset: 'high',
                        targetFps: 60,
                        upscaler: 'DLSS',
                        upscalerQuality: null,
                    },
                })
                .expect(200)
                .expect((response) => {
                    const body = response.body as CheckResponse;
                    expect(body.source).not.toBe('measured');
                });
        } finally {
            await dataSource.query(
                'DELETE FROM performance_records WHERE source_url = $1',
                [sourceUrl],
            );
        }
    });

    it('returns 400 when the published check body omits nested hardware and settings', async () => {
        await request(app.getHttpServer() as Server)
            .post('/api/v1/check')
            .send({ gameSlug: 'cyberpunk-2077' })
            .expect(400);
    });

    it('returns 400 when the pending check body omits nested hardware and settings', async () => {
        await request(app.getHttpServer() as Server)
            .post('/api/v2/check/pending/1')
            .send({})
            .expect(400);
    });
});

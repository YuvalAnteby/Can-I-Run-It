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
    });

    afterAll(async () => {
        if (!app) return;
        const dataSource = app.get<DataSource>('DATA_SOURCE');
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
});

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

interface HealthResponse {
    status: string;
    info: Record<string, unknown>;
    error: Record<string, unknown>;
    details: Record<string, unknown>;
}

describe('HealthController (e2e)', () => {
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

    it('/api/health/postgres (GET)', () => {
        return request(app.getHttpServer() as Server)
            .get('/api/health/postgres')
            .expect(200)
            .expect((res) => {
                const body = res.body as HealthResponse;

                expect(body).toHaveProperty('status', 'ok');
                expect(body).toHaveProperty('info');
                expect(body.info).toHaveProperty('database');
                expect(body.info.database).toHaveProperty('status', 'up');
            });
    });
});

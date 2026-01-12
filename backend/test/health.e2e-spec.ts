import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'net';
import request from 'supertest';

import { AppModule } from '../src/app.module';

interface HealthResponse {
    status: string;
    info: Record<string, unknown>;
    error: Record<string, unknown>;
    details: Record<string, unknown>;
}

describe('HealthController (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('/health/postgres (GET)', () => {
        return request(app.getHttpServer() as Server)
            .get('/health/postgres')
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

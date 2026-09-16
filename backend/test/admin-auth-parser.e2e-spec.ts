import { Server } from 'node:http';

import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AdminAuthModule } from '../src/modules/admin-auth/admin-auth.module';
import { installAdminLoginNoStoreMiddleware } from '../src/modules/admin-auth/admin-login-no-store.middleware';

describe('Admin authentication parser errors (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                AdminAuthModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        installAdminLoginNoStoreMiddleware(app);
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
        await app?.close();
    });

    it('returns no-store for syntactically invalid login JSON', async () => {
        const response = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', 'http://localhost:3000')
            .set('Content-Type', 'application/json')
            .send('{"username":"test-admin","password":')
            .expect(400);

        expect(response.headers['cache-control']).toBe('no-store');
    });
});

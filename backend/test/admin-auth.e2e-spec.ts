import { Server } from 'node:http';

import {
    Controller,
    INestApplication,
    Module,
    Post,
    UnauthorizedException,
    UseGuards,
    ValidationPipe,
    Version,
    VersioningType,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { AdminGuard } from '../src/modules/admin-auth/admin.guard';
import { AdminAuthController } from '../src/modules/admin-auth/admin-auth.controller';
import { AdminAuthModule } from '../src/modules/admin-auth/admin-auth.module';
import { AdminAuthService } from '../src/modules/admin-auth/admin-auth.service';
import { AdminLoginDto } from '../src/modules/admin-auth/dto/admin-login.dto';
import {
    TEST_ADMIN_ORIGIN,
    TEST_ADMIN_PASSWORD,
    TEST_ADMIN_PASSWORD_HASH,
    TEST_ADMIN_USERNAME,
} from './e2e-env';

@Controller('test-admin')
class TestAdminController {
    @Post('protected')
    @Version('1')
    @UseGuards(AdminGuard)
    getProtected(): { ok: true } {
        return { ok: true };
    }
}

@Module({
    imports: [AdminAuthModule],
    controllers: [TestAdminController],
})
class TestAdminModule {}

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), AdminAuthModule],
})
class AuthOnlyTestModule {}

interface SessionResponse {
    username: string;
    expiresAt: string;
}

function configureApp(app: INestApplication): void {
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
}

function rawSetCookie(response: { headers: Record<string, unknown> }): string {
    const cookies = response.headers['set-cookie'];
    if (!Array.isArray(cookies) || typeof cookies[0] !== 'string') {
        throw new Error('Expected an auth Set-Cookie header');
    }
    return cookies[0];
}

function sessionCookie(response: { headers: Record<string, unknown> }): string {
    return rawSetCookie(response).split(';', 1)[0];
}

function authConfig(overrides: Record<string, string> = {}): ConfigService {
    return new ConfigService({
        ADMIN_USERNAME: TEST_ADMIN_USERNAME,
        ADMIN_PASSWORD_HASH: TEST_ADMIN_PASSWORD_HASH,
        REACT_URL: TEST_ADMIN_ORIGIN,
        NODE_ENV: 'test',
        ...overrides,
    });
}

describe('Admin authentication (e2e)', () => {
    let app: INestApplication;
    let rateApp: INestApplication;
    let originRateApp: INestApplication;
    let cookie: string;
    let expiresAt: string;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule, TestAdminModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        configureApp(app);
        await app.init();

        const rateModule = await Test.createTestingModule({
            imports: [AuthOnlyTestModule],
        }).compile();
        rateApp = rateModule.createNestApplication();
        configureApp(rateApp);
        await rateApp.init();

        const originRateModule = await Test.createTestingModule({
            imports: [AuthOnlyTestModule],
        }).compile();
        originRateApp = originRateModule.createNestApplication();
        configureApp(originRateApp);
        await originRateApp.init();
    });

    afterAll(async () => {
        if (originRateApp) await originRateApp.close();
        if (rateApp) await rateApp.close();
        if (!app) return;

        const dataSource = app.get<DataSource>('DATA_SOURCE');
        await app.close();
        await dataSource.destroy();
    });

    it('keeps the public compatibility root available', async () => {
        await request(app.getHttpServer() as Server)
            .get('/api/v1')
            .expect(200)
            .expect('Hello World!');
    });

    it('logs in, returns a no-store session, and sets a host-only cookie', async () => {
        const response = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .send({
                username: TEST_ADMIN_USERNAME,
                password: TEST_ADMIN_PASSWORD,
            })
            .expect(200);

        const setCookie = rawSetCookie(response);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(setCookie).toContain('Max-Age=1800');
        expect(setCookie).toContain('Path=/api');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('SameSite=Strict');
        expect(setCookie).not.toContain('Domain=');
        expect(setCookie).not.toContain('Secure');

        cookie = sessionCookie(response);
        const body = response.body as SessionResponse;
        expect(body.username).toBe(TEST_ADMIN_USERNAME);
        expect(body.expiresAt).toMatch(/Z$/);
        expiresAt = body.expiresAt;
    });

    it('returns the session through the cookie without exposing the token', async () => {
        const response = await request(app.getHttpServer() as Server)
            .get('/api/v1/admin/auth/session')
            .set('Cookie', cookie)
            .expect(200);

        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toEqual({
            username: TEST_ADMIN_USERNAME,
            expiresAt,
        });
        expect(response.body).not.toHaveProperty('token');
    });

    it('rejects non-string login credentials with 400 and no-store', async () => {
        const server = app.getHttpServer() as Server;
        for (const payload of [
            { username: 123, password: TEST_ADMIN_PASSWORD },
            { username: TEST_ADMIN_USERNAME, password: { value: 'password' } },
        ]) {
            const response = await request(server)
                .post('/api/v1/admin/auth/login')
                .set('Origin', TEST_ADMIN_ORIGIN)
                .send(payload)
                .expect(400);

            expect(response.headers['cache-control']).toBe('no-store');
        }
    });

    it('rejects a credential object with a non-callable toString as 400', async () => {
        const response = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .send({
                username: TEST_ADMIN_USERNAME,
                password: { toString: null },
            })
            .expect(400);

        expect(response.headers['cache-control']).toBe('no-store');
    });

    it('marks authentication guard and origin failures as no-store', async () => {
        const missingSession = await request(app.getHttpServer() as Server)
            .get('/api/v1/admin/auth/session')
            .expect(401);
        expect(missingSession.headers['cache-control']).toBe('no-store');

        const invalidOriginLogin = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', 'https://evil.example')
            .send({
                username: TEST_ADMIN_USERNAME,
                password: TEST_ADMIN_PASSWORD,
            })
            .expect(403);
        expect(invalidOriginLogin.headers['cache-control']).toBe('no-store');

        const invalidOriginLogout = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/logout')
            .set('Origin', 'https://evil.example')
            .expect(403);
        expect(invalidOriginLogout.headers['cache-control']).toBe('no-store');
    });

    it('uses the same unauthorized response for invalid and unknown credentials', async () => {
        const invalidPassword = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .send({ username: TEST_ADMIN_USERNAME, password: 'wrong password' })
            .expect(401);
        const unknownUsername = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .send({ username: 'unknown-admin', password: TEST_ADMIN_PASSWORD })
            .expect(401);

        expect(unknownUsername.body).toEqual(invalidPassword.body);
        expect(invalidPassword.headers['cache-control']).toBe('no-store');
        expect(unknownUsername.headers['cache-control']).toBe('no-store');
    });

    it('rejects missing or mismatched origins on login and protected mutations', async () => {
        await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .send({
                username: TEST_ADMIN_USERNAME,
                password: TEST_ADMIN_PASSWORD,
            })
            .expect(403);
        await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', 'https://evil.example')
            .send({
                username: TEST_ADMIN_USERNAME,
                password: TEST_ADMIN_PASSWORD,
            })
            .expect(403);

        await request(app.getHttpServer() as Server)
            .post('/api/v1/test-admin/protected')
            .set('Cookie', cookie)
            .expect(403);
        await request(app.getHttpServer() as Server)
            .post('/api/v1/test-admin/protected')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .set('Cookie', cookie)
            .expect(201)
            .expect({ ok: true });

        await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/logout')
            .set('Origin', 'https://evil.example')
            .set('Cookie', cookie)
            .expect(403);
        await request(app.getHttpServer() as Server)
            .get('/api/v1/admin/auth/session')
            .set('Cookie', cookie)
            .expect(200);
    });

    it('rejects an expired session without sliding its expiry', async () => {
        const now = jest
            .spyOn(Date, 'now')
            .mockReturnValue(Date.parse(expiresAt));
        try {
            await request(app.getHttpServer() as Server)
                .get('/api/v1/admin/auth/session')
                .set('Cookie', cookie)
                .expect(401);
        } finally {
            now.mockRestore();
        }
    });

    it('starts a fresh in-memory store empty after a service restart', () => {
        const token = cookie.split('=', 2)[1];
        const freshService = new AdminAuthService(authConfig());

        expect(() => freshService.getSession(token)).toThrow(
            UnauthorizedException,
        );
    });

    it('logs out idempotently and rejects replay of the captured cookie', async () => {
        const login = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .send({
                username: TEST_ADMIN_USERNAME,
                password: TEST_ADMIN_PASSWORD,
            })
            .expect(200);
        const logoutCookie = sessionCookie(login);

        const logout = await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/logout')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .set('Cookie', logoutCookie)
            .expect(204);
        const clearCookie = rawSetCookie(logout);
        expect(logout.headers['cache-control']).toBe('no-store');
        expect(clearCookie).toContain('Path=/api');
        expect(clearCookie).toContain('HttpOnly');
        expect(clearCookie).toContain('SameSite=Strict');
        expect(clearCookie).not.toContain('Max-Age');

        await request(app.getHttpServer() as Server)
            .get('/api/v1/admin/auth/session')
            .set('Cookie', logoutCookie)
            .expect(401);
        await request(app.getHttpServer() as Server)
            .post('/api/v1/admin/auth/logout')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .set('Cookie', logoutCookie)
            .expect(204);
    });

    it('emits Secure production cookies without relying on an HTTP client to resend them', async () => {
        const productionOrigin = 'https://frontend.example';
        const productionConfig = authConfig({
            NODE_ENV: 'production',
            REACT_URL: productionOrigin,
        });
        const productionController = new AdminAuthController(
            new AdminAuthService(productionConfig),
            productionConfig,
        );
        const productionApp = express();
        productionApp.use(express.json());
        productionApp.post(
            '/login',
            (req: Request, res: Response, next: NextFunction) => {
                void productionController
                    .login(req.body as AdminLoginDto, req, res)
                    .then((body) => res.status(200).json(body))
                    .catch(next);
            },
        );
        productionApp.post(
            '/logout',
            (req: Request, res: Response, next: NextFunction) => {
                try {
                    productionController.logout(req, res);
                    res.status(204).end();
                } catch (error: unknown) {
                    next(error);
                }
            },
        );

        const login = await request(productionApp)
            .post('/login')
            .set('Origin', productionOrigin)
            .send({
                username: TEST_ADMIN_USERNAME,
                password: TEST_ADMIN_PASSWORD,
            })
            .expect(200);
        const setCookie = rawSetCookie(login);
        expect(setCookie).toContain('Secure');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('SameSite=Strict');
        expect(setCookie).toContain('Path=/api');
        expect(setCookie).not.toContain('Domain=');

        const logout = await request(productionApp)
            .post('/logout')
            .set('Origin', productionOrigin)
            .set('Cookie', sessionCookie(login))
            .expect(204);
        const clearCookie = rawSetCookie(logout);
        expect(clearCookie).toContain('Secure');
        expect(clearCookie).not.toContain('Max-Age');
    });

    it('does not charge invalid-origin login posts against the valid-origin quota', async () => {
        const server = originRateApp.getHttpServer() as Server;
        for (let attempt = 0; attempt < 10; attempt += 1) {
            await request(server)
                .post('/api/v1/admin/auth/login')
                .set('Origin', 'https://evil.example')
                .send({ username: 'wrong', password: 'wrong' })
                .expect(403);
        }

        const validOriginAttempt = await request(server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .send({ username: 'wrong', password: 'wrong' })
            .expect(401);

        expect(validOriginAttempt.headers['cache-control']).toBe('no-store');
    });

    it('returns 429 on the eleventh login attempt in a fresh rate-limit store', async () => {
        const server = rateApp.getHttpServer() as Server;
        for (let attempt = 0; attempt < 10; attempt += 1) {
            await request(server)
                .post('/api/v1/admin/auth/login')
                .set('Origin', TEST_ADMIN_ORIGIN)
                .send({ username: 'wrong', password: 'wrong' })
                .expect(401);
        }

        const throttled = await request(server)
            .post('/api/v1/admin/auth/login')
            .set('Origin', TEST_ADMIN_ORIGIN)
            .send({ username: 'wrong', password: 'wrong' })
            .expect(429);
        expect(throttled.headers['retry-after']).toBeDefined();
        expect(throttled.headers['cache-control']).toBe('no-store');
    });
});

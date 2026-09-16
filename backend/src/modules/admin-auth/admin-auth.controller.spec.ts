import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import {
    ADMIN_SESSION_COOKIE_NAME,
    ADMIN_SESSION_MAX_AGE_SECONDS,
    AdminSession,
    IssuedAdminSession,
} from './admin-auth.types';
import { AdminLoginDto } from './dto/admin-login.dto';

const origin = 'http://localhost:3000';
const session: AdminSession = {
    username: 'admin',
    expiresAt: new Date(1_800_000).toISOString(),
};
const issued: IssuedAdminSession = { token: 'A'.repeat(43), session };

function requestFor(
    overrides: { headers?: Request['headers']; admin?: AdminSession } = {},
): Request & { admin?: AdminSession } {
    return {
        headers: { origin },
        ...overrides,
    } as Request & { admin?: AdminSession };
}

function responseFor(): Response & {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
    setHeader: jest.Mock;
} {
    return {
        cookie: jest.fn(),
        clearCookie: jest.fn(),
        setHeader: jest.fn(),
    } as unknown as Response & {
        cookie: jest.Mock;
        clearCookie: jest.Mock;
        setHeader: jest.Mock;
    };
}

describe('AdminAuthController', () => {
    const service = {
        login: jest.fn(),
        getSession: jest.fn(),
        logout: jest.fn(),
        assertOrigin: jest.fn(),
    };
    let controller: AdminAuthController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new AdminAuthController(
            service as unknown as AdminAuthService,
            new ConfigService({ NODE_ENV: 'test' }),
        );
    });

    it('validates origin, replaces the presented cookie session, and sets the host-only auth cookie', async () => {
        service.login.mockResolvedValue(issued);
        const request = requestFor({
            headers: {
                origin,
                cookie: `${ADMIN_SESSION_COOKIE_NAME}=old-token`,
            },
        });
        const response = responseFor();
        const dto: AdminLoginDto = { username: 'admin', password: 'password' };

        await expect(controller.login(dto, request, response)).resolves.toEqual(
            session,
        );

        expect(service.assertOrigin).toHaveBeenCalledWith(origin);
        expect(service.login).toHaveBeenCalledWith(
            'admin',
            'password',
            'old-token',
        );
        expect(response.cookie).toHaveBeenCalledWith(
            ADMIN_SESSION_COOKIE_NAME,
            issued.token,
            {
                httpOnly: true,
                secure: false,
                sameSite: 'strict',
                path: '/api',
                maxAge: ADMIN_SESSION_MAX_AGE_SECONDS * 1_000,
            },
        );
        expect(response.setHeader).toHaveBeenCalledWith(
            'Cache-Control',
            'no-store',
        );
    });

    it('returns the guard-attached session without exposing a token', () => {
        const request = requestFor({ admin: session });
        const response = responseFor();

        expect(controller.getSession(request, response)).toEqual(session);
        expect(response.setHeader).toHaveBeenCalledWith(
            'Cache-Control',
            'no-store',
        );
    });

    it('revokes and clears the cookie on logout', () => {
        const request = requestFor({
            headers: {
                origin,
                cookie: `${ADMIN_SESSION_COOKIE_NAME}=old-token`,
            },
        });
        const response = responseFor();

        expect(controller.logout(request, response)).toBeUndefined();

        expect(service.assertOrigin).toHaveBeenCalledWith(origin);
        expect(service.logout).toHaveBeenCalledWith('old-token');
        expect(response.clearCookie).toHaveBeenCalledWith(
            ADMIN_SESSION_COOKIE_NAME,
            {
                httpOnly: true,
                secure: false,
                sameSite: 'strict',
                path: '/api',
            },
        );
    });
});

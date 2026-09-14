import {
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common';

import { AdminGuard } from './admin.guard';
import { AdminAuthService } from './admin-auth.service';
import {
    ADMIN_SESSION_COOKIE_NAME,
    AdminRequest,
    AdminSession,
} from './admin-auth.types';

const session: AdminSession = {
    username: 'admin',
    expiresAt: new Date(1_800_000).toISOString(),
};

function contextFor(request: AdminRequest): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request,
        }),
    } as unknown as ExecutionContext;
}

function requestFor(
    method: string,
    cookie?: string,
    origin?: string,
): AdminRequest {
    return {
        method,
        headers: { cookie, origin },
    } as AdminRequest;
}

describe('AdminGuard', () => {
    const service = {
        getSession: jest.fn(),
        assertOrigin: jest.fn(),
    };
    let guard: AdminGuard;

    beforeEach(() => {
        jest.clearAllMocks();
        guard = new AdminGuard(service as unknown as AdminAuthService);
    });

    it('passes the parsed session cookie to the service and attaches the validated admin', () => {
        service.getSession.mockReturnValue(session);
        const request = requestFor(
            'GET',
            `${ADMIN_SESSION_COOKIE_NAME}=valid-token`,
        );

        expect(guard.canActivate(contextFor(request))).toBe(true);

        expect(service.getSession).toHaveBeenCalledWith('valid-token');
        expect(request.admin).toEqual(session);
        expect(service.assertOrigin).not.toHaveBeenCalled();
    });

    it('treats a malformed cookie as unauthenticated instead of throwing a parser error', () => {
        service.getSession.mockImplementation(() => {
            throw new UnauthorizedException('Invalid session');
        });
        const request = requestFor('GET', 'not-a-cookie');

        expect(() => guard.canActivate(contextFor(request))).toThrow(
            UnauthorizedException,
        );
        expect(service.getSession).toHaveBeenCalledWith(undefined);
        expect(request.admin).toBeUndefined();
    });

    it('propagates missing, unknown, and expired session failures', () => {
        service.getSession.mockImplementation(() => {
            throw new UnauthorizedException('Invalid session');
        });

        for (const cookie of [
            undefined,
            `${ADMIN_SESSION_COOKIE_NAME}=expired`,
        ]) {
            const request = requestFor('GET', cookie);
            expect(() => guard.canActivate(contextFor(request))).toThrow(
                UnauthorizedException,
            );
        }
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
        'requires the configured Origin for %s requests, including with a valid session',
        (method) => {
            service.getSession.mockReturnValue(session);
            service.assertOrigin
                .mockImplementationOnce(() => {
                    throw new ForbiddenException('Invalid origin');
                })
                .mockImplementationOnce(() => {
                    throw new ForbiddenException('Invalid origin');
                })
                .mockImplementationOnce(() => undefined);

            const missingOrigin = requestFor(
                method,
                `${ADMIN_SESSION_COOKIE_NAME}=valid-token`,
            );
            const badOrigin = requestFor(
                method,
                `${ADMIN_SESSION_COOKIE_NAME}=valid-token`,
                'https://evil.example',
            );
            const validOrigin = requestFor(
                method,
                `${ADMIN_SESSION_COOKIE_NAME}=valid-token`,
                'http://localhost:3000',
            );

            expect(() => guard.canActivate(contextFor(missingOrigin))).toThrow(
                ForbiddenException,
            );
            expect(() => guard.canActivate(contextFor(badOrigin))).toThrow(
                ForbiddenException,
            );
            expect(guard.canActivate(contextFor(validOrigin))).toBe(true);

            expect(service.assertOrigin).toHaveBeenNthCalledWith(1, undefined);
            expect(service.assertOrigin).toHaveBeenNthCalledWith(
                2,
                'https://evil.example',
            );
            expect(service.assertOrigin).toHaveBeenNthCalledWith(
                3,
                'http://localhost:3000',
            );
            expect(validOrigin.admin).toEqual(session);
        },
    );
});

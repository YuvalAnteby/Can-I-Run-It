import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AdminAuthService } from './admin-auth.service';

const username = 'admin';
const password = 'correct horse battery staple';
const hash =
    'scrypt:16384:8:1:000102030405060708090a0b0c0d0e0f:' +
    'd7590aca2c9801cf06eeba772a69dc31ce3862591d96522ac4e6bba6ad1f31a52d6f736f2b85adaa6262335eb112e56f014f417a37d74be0def7669b2c51c29e';
const origin = 'http://localhost:3000';

function config(overrides: Record<string, string> = {}): ConfigService {
    return new ConfigService({
        ADMIN_USERNAME: username,
        ADMIN_PASSWORD_HASH: hash,
        REACT_URL: origin,
        NODE_ENV: 'test',
        ...overrides,
    });
}

describe('AdminAuthService', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(0);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('issues a session for valid credentials', async () => {
        const service = new AdminAuthService(config());

        const issued = await service.login(username, password);

        expect(issued.session).toEqual({
            username,
            expiresAt: new Date(1_800_000).toISOString(),
        });
        expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(service.getSession(issued.token)).toEqual(issued.session);
    });

    it('uses the same unauthorized error for an unknown username and wrong password', async () => {
        const service = new AdminAuthService(config());

        const wrongPassword = service.login(username, 'wrong password');
        const unknownUsername = service.login('other-admin', password);

        const [wrongPasswordError, unknownUsernameError] = await Promise.all([
            wrongPassword.catch((error: unknown) => error),
            unknownUsername.catch((error: unknown) => error),
        ]);
        expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
        expect(unknownUsernameError).toBeInstanceOf(UnauthorizedException);
        expect(
            (wrongPasswordError as UnauthorizedException).getResponse(),
        ).toEqual(
            (unknownUsernameError as UnauthorizedException).getResponse(),
        );
    });

    it('rejects malformed, unknown, and expired tokens', async () => {
        const service = new AdminAuthService(config());

        expect(() => service.getSession(undefined)).toThrow(
            UnauthorizedException,
        );
        expect(() => service.getSession('malformed')).toThrow(
            UnauthorizedException,
        );
        expect(() => service.getSession('A'.repeat(43))).toThrow(
            UnauthorizedException,
        );

        const issued = await service.login(username, password);
        jest.mocked(Date.now).mockReturnValue(1_800_000);

        expect(() => service.getSession(issued.token)).toThrow(
            UnauthorizedException,
        );
    });

    it('revokes a session on logout and rejects replay while keeping logout idempotent', async () => {
        const service = new AdminAuthService(config());
        const issued = await service.login(username, password);

        service.logout(issued.token);
        service.logout(issued.token);

        expect(() => service.getSession(issued.token)).toThrow(
            UnauthorizedException,
        );
    });

    it('replaces a presented session after a successful login', async () => {
        const service = new AdminAuthService(config());
        const oldSession = await service.login(username, password);

        const newSession = await service.login(
            username,
            password,
            oldSession.token,
        );

        expect(() => service.getSession(oldSession.token)).toThrow(
            UnauthorizedException,
        );
        expect(service.getSession(newSession.token)).toEqual(
            newSession.session,
        );
    });

    it('accepts only the configured origin', () => {
        const service = new AdminAuthService(config());

        expect(() => service.assertOrigin(origin)).not.toThrow();
        expect(() => service.assertOrigin(undefined)).toThrow(
            ForbiddenException,
        );
        expect(() => service.assertOrigin('http://localhost:4000')).toThrow(
            ForbiddenException,
        );
    });

    it('fails closed when required configuration is missing or insecure in production', () => {
        expect(
            () =>
                new AdminAuthService(
                    config({ ADMIN_PASSWORD_HASH: 'not-a-password-hash' }),
                ),
        ).toThrow(/ADMIN_PASSWORD_HASH/);
        expect(
            () =>
                new AdminAuthService(
                    config({
                        NODE_ENV: 'production',
                        REACT_URL: 'http://localhost:3000',
                    }),
                ),
        ).toThrow(/REACT_URL/);
    });
});

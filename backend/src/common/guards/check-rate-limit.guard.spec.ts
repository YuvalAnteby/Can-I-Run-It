import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { CheckController } from '../../modules/check/check.controller';
import { GamesController } from '../../modules/games/games.controller';
import { HealthController } from '../../modules/health/health.controller';
import { AbuseProtectionService } from '../abuse-protection/abuse-protection.service';
import {
    CheckRateLimitGuard,
    TooManyRequestsException,
} from './check-rate-limit.guard';

function executionContextFor(request: {
    ip?: string;
    socket?: { remoteAddress?: string };
    res: { setHeader: jest.Mock };
}): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => request,
            getResponse: () => request.res,
        }),
    } as unknown as ExecutionContext;
}

describe('CheckRateLimitGuard', () => {
    let abuseProtection: AbuseProtectionService;

    const methodGuards = (
        method: 'discoverGames' | 'selectRawgGame',
    ): unknown =>
        Reflect.getMetadata(
            GUARDS_METADATA,
            Object.getOwnPropertyDescriptor(GamesController.prototype, method)
                ?.value as object,
        );

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(0);
        abuseProtection = new AbuseProtectionService({
            get: jest.fn((_key: string, fallback?: unknown) => fallback),
        } as never);
    });
    afterEach(() => {
        abuseProtection.onApplicationShutdown();
        jest.restoreAllMocks();
    });

    it('allows ten requests and rejects the eleventh for one IP', () => {
        const guard = new CheckRateLimitGuard(abuseProtection);
        const request = { ip: '203.0.113.10', res: { setHeader: jest.fn() } };
        const context = executionContextFor(request);
        for (let attempt = 0; attempt < 10; attempt += 1) {
            expect(guard.canActivate(context)).toBe(true);
        }
        expect(() => guard.canActivate(context)).toThrow(
            TooManyRequestsException,
        );
        expect(request.res.setHeader).toHaveBeenCalledWith('Retry-After', 60);
        expect(new TooManyRequestsException().getStatus()).toBe(
            HttpStatus.TOO_MANY_REQUESTS,
        );
        expect(
            guard.canActivate(
                executionContextFor({ ...request, ip: '203.0.113.11' }),
            ),
        ).toBe(true);
    });

    it('keeps a fixed deadline, rounds Retry-After up, and resets at one minute', () => {
        const guard = new CheckRateLimitGuard(abuseProtection);
        const request = { ip: '203.0.113.10', res: { setHeader: jest.fn() } };
        const context = executionContextFor(request);
        guard.canActivate(context);
        jest.mocked(Date.now).mockReturnValue(30_000);
        for (let attempt = 1; attempt < 10; attempt += 1)
            guard.canActivate(context);
        jest.mocked(Date.now).mockReturnValue(59_001);
        expect(() => guard.canActivate(context)).toThrow(
            TooManyRequestsException,
        );
        expect(request.res.setHeader).toHaveBeenLastCalledWith(
            'Retry-After',
            1,
        );
        jest.mocked(Date.now).mockReturnValue(60_000);
        for (let attempt = 0; attempt < 10; attempt += 1)
            expect(guard.canActivate(context)).toBe(true);
        expect(() => guard.canActivate(context)).toThrow(
            TooManyRequestsException,
        );
        expect(request.res.setHeader).toHaveBeenLastCalledWith(
            'Retry-After',
            60,
        );
    });

    it('caps a route group across rotating IPs and resets after one minute', () => {
        const guard = new CheckRateLimitGuard(abuseProtection);
        const res = { setHeader: jest.fn() };
        for (let i = 0; i < 100; i++) {
            guard.canActivate(executionContextFor({ ip: `client-${i}`, res }));
        }
        expect(() =>
            guard.canActivate(executionContextFor({ ip: 'new-client', res })),
        ).toThrow(TooManyRequestsException);
        expect(res.setHeader).toHaveBeenLastCalledWith('Retry-After', 60);
        jest.mocked(Date.now).mockReturnValue(60_000);
        expect(
            guard.canActivate(executionContextFor({ ip: 'new-client', res })),
        ).toBe(true);
    });

    it('attaches protection to checks and public RAWG routes while leaving reads open', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, CheckController)).toEqual([
            CheckRateLimitGuard,
        ]);
        expect(
            Reflect.getMetadata(GUARDS_METADATA, GamesController),
        ).toBeUndefined();
        expect(methodGuards('discoverGames')).toEqual([CheckRateLimitGuard]);
        expect(methodGuards('selectRawgGame')).toEqual([CheckRateLimitGuard]);
        expect(
            Reflect.getMetadata(GUARDS_METADATA, HealthController),
        ).toBeUndefined();
    });
});

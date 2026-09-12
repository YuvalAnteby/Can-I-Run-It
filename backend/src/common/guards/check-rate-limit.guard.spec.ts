import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { CheckController } from '../../modules/check/check.controller';
import { GamesController } from '../../modules/games/games.controller';
import { HealthController } from '../../modules/health/health.controller';
import {
    CheckRateLimitGuard,
    TooManyRequestsException,
} from './check-rate-limit.guard';

function executionContextFor(request: {
    ip: string;
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
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(0);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('allows ten requests and rejects the eleventh for one IP', () => {
        const guard = new CheckRateLimitGuard();
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
        const guard = new CheckRateLimitGuard();
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

    it('attaches protection to checks and leaves game and health reads open', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, CheckController)).toEqual([
            CheckRateLimitGuard,
        ]);
        for (const controller of [GamesController, HealthController]) {
            expect(
                Reflect.getMetadata(GUARDS_METADATA, controller),
            ).toBeUndefined();
        }
    });
});

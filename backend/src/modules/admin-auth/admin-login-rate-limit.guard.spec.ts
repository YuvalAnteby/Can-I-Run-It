import { ExecutionContext, HttpStatus } from '@nestjs/common';

import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { AdminLoginRateLimitGuard } from './admin-login-rate-limit.guard';

function contextFor(request: {
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

describe('AdminLoginRateLimitGuard', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(0);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('allows ten login attempts and rejects the eleventh with Retry-After', () => {
        const guard = new AdminLoginRateLimitGuard();
        const request = { ip: '203.0.113.10', res: { setHeader: jest.fn() } };
        const context = contextFor(request);

        for (let attempt = 0; attempt < 10; attempt += 1) {
            expect(guard.canActivate(context)).toBe(true);
        }

        expect(() => guard.canActivate(context)).toThrow();
        expect(request.res.setHeader).toHaveBeenCalledWith('Retry-After', 60);
        expect(guard).toBeInstanceOf(CheckRateLimitGuard);
        expect(HttpStatus.TOO_MANY_REQUESTS).toBe(429);
    });

    it('keeps login counters independent from the public check guard', () => {
        const loginGuard = new AdminLoginRateLimitGuard();
        const checkGuard = new CheckRateLimitGuard();
        const request = { ip: '203.0.113.10', res: { setHeader: jest.fn() } };

        for (let attempt = 0; attempt < 10; attempt += 1) {
            expect(loginGuard.canActivate(contextFor(request))).toBe(true);
        }
        expect(checkGuard.canActivate(contextFor(request))).toBe(true);
    });
});

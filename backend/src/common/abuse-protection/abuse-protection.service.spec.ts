import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AbuseProtectionService } from './abuse-protection.service';

const config = (values: Record<string, unknown> = {}): ConfigService =>
    ({
        get: jest.fn((key: string, fallback?: unknown) =>
            key in values ? values[key] : fallback,
        ),
        getOrThrow: jest.fn((key: string) => {
            if (!(key in values)) throw new Error(`Missing ${key}`);
            return values[key];
        }),
    }) as unknown as ConfigService;

describe('AbuseProtectionService', () => {
    let warnSpy: jest.SpiedFunction<Logger['warn']>;
    const services: AbuseProtectionService[] = [];

    const makeService = (
        values: Record<string, unknown> = {},
    ): AbuseProtectionService => {
        const service = new AbuseProtectionService(config(values));
        services.push(service);
        return service;
    };

    beforeEach(() => {
        jest.spyOn(Date, 'now').mockReturnValue(0);
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        for (const service of services.splice(0))
            service.onApplicationShutdown();
        jest.restoreAllMocks();
    });

    it('ten_acceptances_then_429', () => {
        const service = makeService();

        for (let attempt = 0; attempt < 10; attempt += 1)
            expect(service.consumeExpensiveRequest('203.0.113.10')).toBeNull();

        expect(service.consumeExpensiveRequest('203.0.113.10')).toBe(60);
    });

    it('fixed_window_retry_after_and_recovery', () => {
        const service = makeService();

        for (let attempt = 0; attempt < 10; attempt += 1)
            service.consumeExpensiveRequest('203.0.113.10');

        jest.mocked(Date.now).mockReturnValue(59_001);
        expect(service.consumeExpensiveRequest('203.0.113.10')).toBe(1);

        jest.mocked(Date.now).mockReturnValue(60_000);
        expect(service.consumeExpensiveRequest('203.0.113.10')).toBeNull();
    });

    it('denials_do_not_consume_global_budget', () => {
        const service = makeService({
            EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: 1,
            EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 2,
        });

        expect(service.consumeExpensiveRequest('203.0.113.10')).toBeNull();
        expect(service.consumeExpensiveRequest('203.0.113.10')).toBe(60);
        expect(service.consumeExpensiveRequest('203.0.113.11')).toBeNull();
        expect(service.consumeExpensiveRequest('203.0.113.12')).toBe(60);
    });

    it('rotated_ips_stop_at_100', () => {
        const service = makeService({
            EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: 1_000,
            EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 100,
        });

        for (let attempt = 0; attempt < 100; attempt += 1)
            expect(
                service.consumeExpensiveRequest(`198.51.100.${attempt}`),
            ).toBeNull();
        expect(service.consumeExpensiveRequest('198.51.100.200')).toBe(60);

        jest.mocked(Date.now).mockReturnValue(60_000);
        expect(service.consumeExpensiveRequest('198.51.100.200')).toBeNull();
    });

    it('uses separate concurrency and minute budgets with idempotent release', () => {
        const service = makeService({
            GEMINI_REQUESTS_PER_MINUTE: 1,
            GEMINI_MAX_CONCURRENT: 1,
        });

        const release = service.tryAcquireProvider('gemini');
        expect(release).toEqual(expect.any(Function));
        expect(service.tryAcquireProvider('gemini')).toBeNull();

        release?.();
        release?.();
        expect(service.tryAcquireProvider('gemini')).toBeNull();

        jest.mocked(Date.now).mockReturnValue(60_000);
        expect(service.tryAcquireProvider('gemini')).toEqual(
            expect.any(Function),
        );
    });

    it('applies the default RAWG concurrency and minute budget', () => {
        const service = makeService();
        const releases = Array.from({ length: 4 }, () =>
            service.tryAcquireProvider('rawg'),
        );

        expect(releases).toHaveLength(4);
        expect(releases.every((release) => typeof release === 'function')).toBe(
            true,
        );
        expect(service.tryAcquireProvider('rawg')).toBeNull();
        releases.forEach((release) => release?.());
    });

    it('labels provider concurrency and budget denials without recording failures', () => {
        const service = makeService({
            GEMINI_REQUESTS_PER_MINUTE: 1,
            GEMINI_MAX_CONCURRENT: 1,
        });
        const release = service.tryAcquireProvider('gemini');

        expect(service.tryAcquireProvider('gemini')).toBeNull();
        release?.();
        expect(service.tryAcquireProvider('gemini')).toBeNull();

        const warnings = warnSpy.mock.calls.map(([message]) => String(message));
        expect(warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining('provider.gemini.concurrency'),
                expect.stringContaining('provider.gemini.budget'),
            ]),
        );
        expect(warnings.join('\n')).not.toContain('provider.gemini.failure');
    });

    it('throttles repeated fixed-label events and flushes pending counts on shutdown', () => {
        const service = makeService();

        service.recordEvent('provider.gemini.failure');
        service.recordEvent('provider.gemini.failure');
        service.recordEvent('provider.gemini.failure');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('secret');

        jest.mocked(Date.now).mockReturnValue(60_000);
        service.recordEvent('provider.gemini.failure');
        expect(warnSpy).toHaveBeenCalledTimes(2);

        service.recordEvent('provider.rawg.timeout');
        service.recordEvent('provider.rawg.timeout');
        service.onApplicationShutdown();
        expect(warnSpy).toHaveBeenCalledTimes(4);
        expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('https://');
    });
});

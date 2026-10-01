const counterAdds: Record<string, jest.Mock> = {};
const mockSpan = {
    end: jest.fn(),
    recordException: jest.fn(),
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
    spanContext: jest.fn(() => ({})),
};

jest.mock('@opentelemetry/api', () => {
    return {
        SpanKind: { CLIENT: 2, INTERNAL: 0 },
        SpanStatusCode: { ERROR: 2, OK: 1 },
        context: {
            active: jest.fn(() => ({})),
            with: jest.fn(
                (
                    _context: unknown,
                    operation: (...args: never[]) => unknown,
                    ...args: never[]
                ) => operation(...args),
            ),
        },
        metrics: {
            getMeter: jest.fn(() => ({
                createCounter: jest.fn((name: string) => {
                    const add = jest.fn();
                    counterAdds[name] = add;
                    return { add };
                }),
                createHistogram: jest.fn(() => ({ record: jest.fn() })),
            })),
        },
        trace: {
            getActiveSpan: jest.fn(() => undefined),
            getTracer: jest.fn(() => ({
                startActiveSpan: jest.fn(
                    (
                        _name: string,
                        _options: unknown,
                        operation: (activeSpan: typeof mockSpan) => unknown,
                    ) => operation(mockSpan),
                ),
                startSpan: jest.fn(() => mockSpan),
            })),
        },
        __mockSpan: mockSpan,
    };
});

import {
    normalizeHttpMethod,
    observeProvider,
    observeStage,
    recordTelemetryEvent,
} from './telemetry';

describe('telemetry helpers', () => {
    beforeEach(() => {
        for (const counter of Object.values(counterAdds)) counter.mockClear();
        mockSpan.end.mockClear();
        mockSpan.recordException.mockClear();
        mockSpan.setAttribute.mockClear();
        mockSpan.setStatus.mockClear();
    });

    it('preserves a successful stage result', async () => {
        const operation = jest.fn().mockResolvedValue({ state: 'ok' });

        await expect(observeStage('check.inputs', operation)).resolves.toEqual({
            state: 'ok',
        });
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('preserves the original stage error', async () => {
        const failure = new Error('private provider response');
        const operation = jest.fn().mockRejectedValue(failure);

        await expect(observeStage('check.db_lookup', operation)).rejects.toBe(
            failure,
        );
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('invokes an admitted provider operation exactly once', async () => {
        const operation = jest.fn().mockResolvedValue(null);

        await expect(observeProvider('gemini', operation)).resolves.toBeNull();
        expect(operation).toHaveBeenCalledTimes(1);
        expect(counterAdds['ciri.provider.calls']).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ provider: 'gemini' }),
        );
    });

    it('marks an unavailable provider result as an error span', async () => {
        await expect(
            observeProvider('rawg', jest.fn().mockResolvedValue(null)),
        ).resolves.toBeNull();

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2 });
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('maps abuse events to bounded rejection/failure metrics', () => {
        recordTelemetryEvent('provider.rawg.failure');
        recordTelemetryEvent('provider.gemini.timeout');
        recordTelemetryEvent('provider.gemini.budget');
        recordTelemetryEvent('rate_limit.ip');

        expect(counterAdds['ciri.provider.failures']).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ provider: 'rawg' }),
        );
        expect(counterAdds['ciri.provider.timeouts']).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ provider: 'gemini' }),
        );
        expect(counterAdds['ciri.provider.rejections']).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ provider: 'gemini', reason: 'budget' }),
        );
        expect(counterAdds['ciri.rate_limit.rejections']).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ scope: 'ip' }),
        );
    });

    it.each([
        ['get', 'GET'],
        ['POST', 'POST'],
        ['CONNECT', 'OTHER'],
        ['GET\nX-Forwarded-For: secret', 'OTHER'],
    ])('normalizes HTTP method %s to %s', (method, normalized) => {
        expect(normalizeHttpMethod(method)).toBe(normalized);
    });
});

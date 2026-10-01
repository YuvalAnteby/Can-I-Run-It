import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AbuseProtectionService } from '../../common/abuse-protection/abuse-protection.service';
import { SettingsDto } from '../check/dto/settings.dto';
import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { Gpu } from '../gpu/entities/gpu.entity';
import {
    SettingPreset,
    UpscalerQualityMode,
    UpscalerType,
} from '../performance/entities/performance-record.entity';
import { GeminiService } from './gemini.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGame = {
    id: 1,
    name: 'Elden Ring',
    slug: 'elden-ring',
} as unknown as Game;
const mockCpu = {
    id: 1,
    name: 'Intel Core i5-12400F',
    slug: 'intel-core-i5-12400f',
} as unknown as Cpu;
const mockGpu = {
    id: 1,
    name: 'NVIDIA GeForce RTX 3070',
    slug: 'nvidia-geforce-rtx-3070',
} as unknown as Gpu;
const mockRamGb = 16;
const mockSettings: SettingsDto = {
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    preset: SettingPreset.HIGH,
};

const validGeminiPayload = {
    candidates: [
        {
            content: {
                parts: [
                    {
                        text: JSON.stringify({
                            fps: { low: 95, med: 72, high: 55, ultra: 38 },
                            note: null,
                        }),
                    },
                ],
            },
        },
    ],
};

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GeminiService', () => {
    let service: GeminiService;
    let abuseProtection: AbuseProtectionService;
    let fetchSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(async () => {
        errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => {});
        debugSpy = jest
            .spyOn(Logger.prototype, 'debug')
            .mockImplementation(() => {});
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GeminiService,
                AbuseProtectionService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string) =>
                            key === 'GEMINI_API_KEY'
                                ? 'test-api-key'
                                : undefined,
                    },
                },
            ],
        }).compile();

        service = module.get(GeminiService);
        abuseProtection = module.get(AbuseProtectionService);

        // Mock global fetch
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('coalesces concurrent identical estimates into one provider call', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify(validGeminiPayload)),
        );
        const results = await Promise.all(
            Array.from({ length: 5 }, () =>
                service.estimate(
                    mockGame,
                    mockCpu,
                    mockGpu,
                    mockRamGb,
                    mockSettings,
                ),
            ),
        );
        expect(results.every((result) => result?.fps.high === 55)).toBe(true);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('fails fast for a third distinct Gemini request and admits work after settlement', async () => {
        const first = deferred<{ text: string }>();
        const second = deferred<{ text: string }>();
        const third = deferred<{ text: string }>();
        const generateContent = jest
            .spyOn(
                (
                    service as unknown as {
                        genAI: {
                            models: { generateContent: jest.Mock };
                        };
                    }
                ).genAI.models,
                'generateContent',
            )
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(() => second.promise)
            .mockImplementationOnce(() => third.promise);

        const estimate = (name: string) =>
            service.estimate(
                { ...mockGame, name } as unknown as Game,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            );

        const firstEstimate = estimate('Concurrent Game One');
        const secondEstimate = estimate('Concurrent Game Two');
        await Promise.resolve();
        await Promise.resolve();

        await expect(estimate('Concurrent Game Three')).resolves.toBeNull();
        expect(generateContent).toHaveBeenCalledTimes(2);

        first.resolve({
            text: JSON.stringify({
                fps: { low: 95, med: 72, high: 55, ultra: 38 },
                note: null,
            }),
        });
        await expect(firstEstimate).resolves.toEqual({
            fps: { low: 95, med: 72, high: 55, ultra: 38 },
            note: null,
        });
        await Promise.resolve();
        await Promise.resolve();

        const fourthEstimate = estimate('Concurrent Game Four');
        await Promise.resolve();
        second.resolve({
            text: JSON.stringify({
                fps: { low: 90, med: 70, high: 50, ultra: 35 },
                note: null,
            }),
        });
        third.resolve({
            text: JSON.stringify({
                fps: { low: 80, med: 60, high: 45, ultra: 30 },
                note: null,
            }),
        });
        await expect(secondEstimate).resolves.not.toBeNull();
        await expect(fourthEstimate).resolves.not.toBeNull();
        expect(generateContent).toHaveBeenCalledTimes(3);
    });

    it('holds a Gemini permit after timeout until the SDK promise settles', async () => {
        jest.useFakeTimers();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GeminiService,
                AbuseProtectionService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string, fallback?: unknown) => {
                            if (key === 'GEMINI_API_KEY') return 'test-api-key';
                            if (key === 'GEMINI_TIMEOUT_MS') return 100;
                            if (key === 'GEMINI_MAX_CONCURRENT') return 1;
                            return fallback;
                        }),
                    },
                },
            ],
        }).compile();
        const timeoutService = module.get(GeminiService);
        const timeoutAbuseProtection = module.get(AbuseProtectionService);
        const underlying = deferred<{ text: string }>();
        let signal: AbortSignal | undefined;
        const generateContent = jest
            .spyOn(
                (
                    timeoutService as unknown as {
                        genAI: {
                            models: { generateContent: jest.Mock };
                        };
                    }
                ).genAI.models,
                'generateContent',
            )
            .mockImplementationOnce(
                (request: { config?: { abortSignal?: AbortSignal } }) => {
                    signal = request.config?.abortSignal;
                    return underlying.promise;
                },
            )
            .mockResolvedValue({
                text: JSON.stringify({
                    fps: { low: 80, med: 60, high: 45, ultra: 30 },
                    note: null,
                }),
            });

        const estimate = (name: string) =>
            timeoutService.estimate(
                { ...mockGame, name } as unknown as Game,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            );

        const first = estimate('Timeout Game');
        await Promise.resolve();
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(100);
        await expect(first).resolves.toBeNull();
        expect(signal?.aborted).toBe(true);

        await expect(estimate('Distinct While Settling')).resolves.toBeNull();
        await expect(estimate('Timeout Game')).resolves.toBeNull();
        expect(generateContent).toHaveBeenCalledTimes(1);

        underlying.resolve({
            text: JSON.stringify({
                fps: { low: 80, med: 60, high: 45, ultra: 30 },
                note: null,
            }),
        });
        await Promise.resolve();
        await Promise.resolve();
        for (let tick = 0; tick < 6; tick += 1) await Promise.resolve();
        await expect(estimate('After Settlement')).resolves.not.toBeNull();
        expect(generateContent).toHaveBeenCalledTimes(2);
        expect(jest.getTimerCount()).toBe(0);
        timeoutAbuseProtection.onApplicationShutdown();
    });

    it('handles a late Gemini rejection after a timeout without an unhandled promise', async () => {
        jest.useFakeTimers();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GeminiService,
                AbuseProtectionService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string, fallback?: unknown) => {
                            if (key === 'GEMINI_API_KEY') return 'test-api-key';
                            if (key === 'GEMINI_TIMEOUT_MS') return 100;
                            return fallback;
                        }),
                    },
                },
            ],
        }).compile();
        const timeoutService = module.get(GeminiService);
        const timeoutAbuseProtection = module.get(AbuseProtectionService);
        const underlying = deferred<{ text: string }>();
        jest.spyOn(
            (
                timeoutService as unknown as {
                    genAI: { models: { generateContent: jest.Mock } };
                }
            ).genAI.models,
            'generateContent',
        ).mockReturnValue(underlying.promise);

        const first = timeoutService.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        await Promise.resolve();
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(100);
        await expect(first).resolves.toBeNull();

        underlying.reject(new Error('late provider failure'));
        await Promise.resolve();
        await Promise.resolve();
        expect(jest.getTimerCount()).toBe(0);
        timeoutAbuseProtection.onApplicationShutdown();
    });

    it('caps provider requests across games at thirty per minute and recovers', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(0);
        fetchSpy.mockImplementation(() =>
            Promise.resolve(new Response(JSON.stringify(validGeminiPayload))),
        );
        for (let i = 0; i < 30; i++) {
            expect(
                await service.estimate(
                    mockGame,
                    mockCpu,
                    mockGpu,
                    mockRamGb,
                    mockSettings,
                ),
            ).not.toBeNull();
        }
        expect(
            await service.estimate(
                mockGame,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            ),
        ).toBeNull();
        expect(fetchSpy).toHaveBeenCalledTimes(30);
        jest.mocked(Date.now).mockReturnValue(60_000);
        expect(
            await service.estimate(
                mockGame,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            ),
        ).not.toBeNull();
        expect(fetchSpy).toHaveBeenCalledTimes(31);
    });

    // --- Happy path ---

    it('returns fps estimate and null note on a valid response', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () => Promise.resolve(validGeminiPayload),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );

        expect(result).toEqual({
            fps: { low: 95, med: 72, high: 55, ultra: 38 },
            note: null,
        });
    });

    it('returns the note string when Gemini provides one', async () => {
        const payload = {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: JSON.stringify({
                                    fps: {
                                        low: 90,
                                        med: 68,
                                        high: 50,
                                        ultra: 35,
                                    },
                                    note: 'May stutter during shader compilation',
                                }),
                            },
                        ],
                    },
                },
            ],
        };

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () => Promise.resolve(payload),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result?.note).toBe('May stutter during shader compilation');
    });

    it('uses the same no-upscaling prompt for omitted and explicit off', async () => {
        const generateContent = jest
            .spyOn(
                (
                    service as unknown as {
                        genAI: {
                            models: { generateContent: jest.Mock };
                        };
                    }
                ).genAI.models,
                'generateContent',
            )
            .mockResolvedValue({
                text: JSON.stringify({
                    fps: { low: 95, med: 72, high: 55, ultra: 38 },
                    note: null,
                }),
            });

        await service.estimate(mockGame, mockCpu, mockGpu, mockRamGb, {
            ...mockSettings,
            upscalerQuality: null,
        } as unknown as SettingsDto);
        const unavailablePrompt = String(
            (
                generateContent.mock.calls[0]?.[0] as {
                    contents: unknown;
                }
            ).contents,
        );
        await service.estimate(mockGame, mockCpu, mockGpu, mockRamGb, {
            ...mockSettings,
            upscaler: UpscalerType.OFF,
        });
        const explicitOffPrompt = String(
            (generateContent.mock.calls[1]?.[0] as { contents: unknown })
                .contents,
        );
        expect(unavailablePrompt).toBe(explicitOffPrompt);
        expect(unavailablePrompt).toContain('Upscaler: off');
        expect(unavailablePrompt).not.toContain('Upscaler quality:');

        await service.estimate(mockGame, mockCpu, mockGpu, mockRamGb, {
            ...mockSettings,
            upscaler: UpscalerType.DLSS,
            upscalerQuality: UpscalerQualityMode.QUALITY,
        });
        const availablePrompt = String(
            (
                generateContent.mock.calls[2]?.[0] as {
                    contents: unknown;
                }
            ).contents,
        );
        expect(availablePrompt).toContain('Upscaler: DLSS');
        expect(availablePrompt).toContain('Upscaler quality: quality');
    });

    // --- No API key ---

    it('returns null and logs a warning when API key is not configured', async () => {
        const moduleNoKey: TestingModule = await Test.createTestingModule({
            providers: [
                GeminiService,
                AbuseProtectionService,
                {
                    provide: ConfigService,
                    useValue: { get: () => undefined },
                },
            ],
        }).compile();

        const serviceNoKey = moduleNoKey.get(GeminiService);
        const noKeyProtection = moduleNoKey.get(AbuseProtectionService);
        const acquireSpy = jest.spyOn(noKeyProtection, 'tryAcquireProvider');
        const result = await serviceNoKey.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );

        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(acquireSpy).not.toHaveBeenCalled();
    });

    // --- Network / HTTP errors ---

    it('returns null when fetch throws (network error)', async () => {
        fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result).toBeNull();
    });

    it.each([429, 402, 503])(
        'returns null on non-OK HTTP response %s',
        async (status) => {
            fetchSpy.mockResolvedValueOnce({
                ok: false,
                headers: new Headers(),
                status,
                text: () => Promise.resolve('Rate limit exceeded'),
            } as Response);

            const result = await service.estimate(
                mockGame,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            );
            expect(result).toBeNull();
        },
    );

    it('returns null on request timeout (AbortError)', async () => {
        fetchSpy.mockRejectedValueOnce(
            Object.assign(new Error('The operation was aborted'), {
                name: 'AbortError',
            }),
        );

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result).toBeNull();
    });

    // --- Malformed response parsing ---

    describe.each(['low', 'med', 'high', 'ultra'])(
        '%s FPS validation',
        (key) => {
            it.each([
                '-1',
                '0',
                '0.1',
                '10001',
                '1e400',
                '-1e400',
                'null',
                '"60"',
            ])('returns null for %s', async (value) => {
                const fps = { low: 95, med: 72, high: 55, ultra: 38 };
                const fields = Object.entries(fps).map(
                    ([name, valid]) =>
                        `"${name}":${name === key ? value : valid}`,
                );
                fetchSpy.mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            candidates: [
                                {
                                    content: {
                                        parts: [
                                            {
                                                text: `{"fps":{${fields.join(',')}}}`,
                                            },
                                        ],
                                    },
                                },
                            ],
                        }),
                    ),
                );
                expect(
                    await service.estimate(
                        mockGame,
                        mockCpu,
                        mockGpu,
                        mockRamGb,
                        mockSettings,
                    ),
                ).toBeNull();
            });
        },
    );

    it.each(['null', '[]', '{"fps":null}', '{"fps":[]}'])(
        'returns null for invalid response shape %s',
        async (text) => {
            fetchSpy.mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        candidates: [{ content: { parts: [{ text }] } }],
                    }),
                ),
            );
            expect(
                await service.estimate(
                    mockGame,
                    mockCpu,
                    mockGpu,
                    mockRamGb,
                    mockSettings,
                ),
            ).toBeNull();
        },
    );

    it('returns null at eight seconds when the provider never responds', async () => {
        jest.useFakeTimers();
        let signal: AbortSignal | null | undefined;
        fetchSpy.mockImplementation((_url: unknown, options?: RequestInit) => {
            signal = options?.signal;
            return new Promise<Response>(() => {});
        });
        let result: unknown = 'pending';
        const estimate = service
            .estimate(mockGame, mockCpu, mockGpu, mockRamGb, mockSettings)
            .then((value) => {
                result = value;
            });
        await jest.advanceTimersByTimeAsync(7_999);
        expect(result).toBe('pending');
        await jest.advanceTimersByTimeAsync(1);
        expect(result).toBeNull();
        expect(signal?.aborted).toBe(true);
        await estimate;
        expect(jest.getTimerCount()).toBe(0);
    });

    it('clears its deadline after a successful response', async () => {
        jest.useFakeTimers();
        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify(validGeminiPayload)),
        );
        expect(
            await service.estimate(
                mockGame,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            ),
        ).not.toBeNull();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('does not log provider errors, credentials, or stack traces', async () => {
        const eventSpy = jest.spyOn(abuseProtection, 'recordEvent');
        fetchSpy.mockRejectedValueOnce(
            new Error('provider-secret test-api-key'),
        );
        expect(
            await service.estimate(
                mockGame,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            ),
        ).toBeNull();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(eventSpy).toHaveBeenCalledWith('provider.gemini.failure');
    });

    it('does not log raw malformed provider output', async () => {
        const eventSpy = jest.spyOn(abuseProtection, 'recordEvent');
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    { text: 'provider-secret test-api-key' },
                                ],
                            },
                        },
                    ],
                }),
            ),
        );
        expect(
            await service.estimate(
                mockGame,
                mockCpu,
                mockGpu,
                mockRamGb,
                mockSettings,
            ),
        ).toBeNull();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(eventSpy).toHaveBeenCalledWith('provider.gemini.failure');
        expect(JSON.stringify(debugSpy.mock.calls)).not.toContain(
            'provider-secret',
        );
    });

    it('returns null when Gemini returns invalid JSON', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () =>
                Promise.resolve({
                    candidates: [
                        { content: { parts: [{ text: 'not json at all' }] } },
                    ],
                }),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result).toBeNull();
    });

    it('returns null when fps fields are missing', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () =>
                Promise.resolve({
                    candidates: [
                        { content: { parts: [{ text: '{"note": null}' }] } },
                    ],
                }),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result).toBeNull();
    });

    it('returns null when fps values are strings instead of numbers', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () =>
                Promise.resolve({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: JSON.stringify({
                                            fps: {
                                                low: '95',
                                                med: '72',
                                                high: '55',
                                                ultra: '38',
                                            },
                                            note: null,
                                        }),
                                    },
                                ],
                            },
                        },
                    ],
                }),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result).toBeNull();
    });

    it('returns null when candidates array is empty', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () => Promise.resolve({ candidates: [] }),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result).toBeNull();
    });

    // --- Markdown fence stripping ---

    it('correctly parses a response wrapped in markdown fences', async () => {
        const fenced =
            '```json\n' +
            JSON.stringify({
                fps: { low: 80, med: 60, high: 45, ultra: 30 },
                note: null,
            }) +
            '\n```';

        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () =>
                Promise.resolve({
                    candidates: [{ content: { parts: [{ text: fenced }] } }],
                }),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result?.fps.low).toBe(80);
    });

    // --- FPS rounding ---

    it('rounds float fps values to integers', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            headers: new Headers(),
            json: () =>
                Promise.resolve({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: JSON.stringify({
                                            fps: {
                                                low: 94.7,
                                                med: 71.3,
                                                high: 54.9,
                                                ultra: 37.1,
                                            },
                                            note: null,
                                        }),
                                    },
                                ],
                            },
                        },
                    ],
                }),
        } as Response);

        const result = await service.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );
        expect(result?.fps).toEqual({ low: 95, med: 71, high: 55, ultra: 37 });
    });
});

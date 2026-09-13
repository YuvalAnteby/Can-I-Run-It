import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsDto } from '../check/dto/settings.dto';
import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { Gpu } from '../gpu/entities/gpu.entity';
import { SettingPreset } from '../performance/entities/performance-record.entity';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GeminiService', () => {
    let service: GeminiService;
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

        // Mock global fetch
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
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

    // --- No API key ---

    it('returns null and logs a warning when API key is not configured', async () => {
        const moduleNoKey: TestingModule = await Test.createTestingModule({
            providers: [
                GeminiService,
                {
                    provide: ConfigService,
                    useValue: { get: () => undefined },
                },
            ],
        }).compile();

        const serviceNoKey = moduleNoKey.get(GeminiService);
        const result = await serviceNoKey.estimate(
            mockGame,
            mockCpu,
            mockGpu,
            mockRamGb,
            mockSettings,
        );

        expect(result).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
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

    it('returns null on non-OK HTTP response', async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: false,
            headers: new Headers(),
            status: 429,
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
    });

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
            it.each(['-1', '0', '0.1', '1e400', '-1e400', 'null', '"60"'])(
                'returns null for %s',
                async (value) => {
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
                },
            );
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
        expect(errorSpy).toHaveBeenCalledWith('Gemini API call failed');
    });

    it('does not log raw malformed provider output', async () => {
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
        expect(errorSpy).toHaveBeenCalledWith(
            'Failed to parse Gemini response',
        );
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

import { Cpu, CpuBrand } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { GameRequirement } from '../games/entities/game-requirement.entity';
import { GeminiEstimate } from '../gemini/gemini.service';
import { Gpu, GpuBrand } from '../gpu/entities/gpu.entity';
import {
    PerformanceRecord,
    SettingPreset,
    UpscalerType,
} from '../performance/entities/performance-record.entity';
import {
    buildInsufficientResponse,
    buildResponseFromFallback,
    buildResponseFromGemini,
    buildResponseFromRecord,
} from './check.response-builder';
import { HardwareDto } from './dto/hardware.dto';
import {
    SettingPreset as RequestSettingPreset,
    SettingsDto,
    TargetFps,
} from './dto/settings.dto';

const now = new Date('2026-09-11T00:00:00.000Z');

function cpu(overrides: Partial<Cpu> = {}): Cpu {
    return {
        id: 1,
        slug: 'test-cpu',
        name: 'Test CPU',
        manufacturer: CpuBrand.AMD,
        cores: 8,
        threads: 16,
        baseClockGhz: 3.5,
        boostClockGhz: 4.5,
        l3CacheMb: 32,
        tdpWatts: 65,
        benchmarks: { passmark: 20_000 },
        releaseYear: 2024,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

function gpuWithVram(vramGb: number, overrides: Partial<Gpu> = {}): Gpu {
    return {
        id: 1,
        slug: 'test-gpu',
        name: 'Test GPU',
        manufacturer: GpuBrand.NVIDIA,
        vramGb,
        shadingUnits: 8_000,
        tensorCores: 200,
        baseClockMhz: 2_000,
        boostClockMhz: 2_500,
        memoryBusWidth: 256,
        tdpWatts: 250,
        benchmarks: { timespy_extreme: 10_000 },
        releaseYear: 2024,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

function gameWithRequirement(overrides: Partial<GameRequirement> = {}): Game {
    const game: Game = {
        id: 1,
        slug: 'test-game',
        name: 'Test Game',
        gameEngine: null,
        requirements: [],
        publisher: null,
        developer: null,
        releaseDate: null,
        genre: null,
        description: null,
        tags: null,
        supportsRayTracing: false,
        supportsDlss: false,
        supportsFsr: false,
        supportsXeSS: false,
        coverImageUrl: null,
        isTrending: false,
        trendingRank: null,
        createdAt: now,
        updatedAt: now,
    };
    const requirement: GameRequirement = {
        id: 1,
        game,
        tier: 'recommended',
        description: null,
        cpu: cpu(),
        gpu: gpuWithVram(8),
        ramGb: 16,
        vramGb: 8,
        storageGb: null,
        requiresSsd: false,
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        targetFps: 60,
        notes: null,
        ...overrides,
    };
    game.requirements = [requirement];
    return game;
}

function measuredRecord(
    overrides: Partial<PerformanceRecord> = {},
): PerformanceRecord {
    return {
        id: 1,
        game: gameWithRequirement(),
        gpu: gpuWithVram(8),
        cpu: cpu(),
        ramGb: 16,
        ramMhz: null,
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        settings: SettingPreset.HIGH,
        upscaler: UpscalerType.OFF,
        upscalerQuality: null,
        fpsAvg: 60,
        fps1PercentLow: null,
        verified: false,
        source: 'measured',
        sourceUrl: 'https://example.com/benchmark',
        createdAt: now,
        ...overrides,
    };
}

function geminiEstimate(
    fpsOverrides: Partial<GeminiEstimate['fps']> = {},
): GeminiEstimate {
    return {
        fps: { low: 120, med: 100, high: 80, ultra: 55, ...fpsOverrides },
        note: null,
    };
}

function hardwareWith(overrides: Partial<HardwareDto> = {}): HardwareDto {
    return {
        cpuId: 1,
        gpuId: 1,
        ramGb: 16,
        isSsd: true,
        ...overrides,
    };
}

const userCpu = cpu();
const hardware = hardwareWith();
const settings: SettingsDto = {
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    tier: 'recommended',
    preset: RequestSettingPreset.HIGH,
    targetFps: 60,
    upscaler: UpscalerType.OFF,
};

describe('check response builders', () => {
    it('uses selected target FPS for measured data', () => {
        const requirement = gameWithRequirement().requirements[0];
        const result = buildResponseFromRecord(
            measuredRecord({ fpsAvg: 75 }),
            hardware,
            requirement,
            90,
        );

        expect(result.verdict).toBe("Can't run");
        expect(result.source).toBe('measured');
        expect(result.targetFps).toBe(90);
    });

    it('uses likely wording for AI and applies VRAM override plus SSD note', () => {
        const result = buildResponseFromGemini(
            geminiEstimate({ high: 80 }),
            gameWithRequirement({ vramGb: 12, requiresSsd: true }),
            userCpu,
            gpuWithVram(8),
            hardwareWith({ isSsd: false }),
            settings,
            60,
        );

        expect(result.verdict).toBe("Likely can't run");
        expect(result.vramPass).toBe(false);
        expect(result.ssdPass).toBe(false);
        expect(result.notes).toEqual(
            expect.arrayContaining([expect.stringMatching(/SSD/i)]),
        );
    });

    it('returns insufficient data without fabricated FPS', () => {
        const result = buildInsufficientResponse(60);

        expect(result.verdict).toBe('Insufficient data');
        expect(result.source).toBeNull();
        expect(result.fps).toBeNull();
        expect(result).toMatchObject({
            state: 'insufficient',
            provider: null,
            confidence: null,
            targetFps: 60,
            gpuPass: null,
            cpuPass: null,
            ramPass: null,
            vramPass: null,
            ssdPass: null,
            notes: [],
        });
    });

    it.each([
        ['measured', 60, 'can', 'Can run', 'measured', null],
        ['measured', 59.9, 'cant', "Can't run", 'measured', null],
        ['gemini', 60, 'can', 'Likely can run', 'ai', 'gemini'],
        ['gemini', 59.9, 'cant', "Likely can't run", 'ai', 'gemini'],
    ])(
        'uses source and unrounded FPS for %s at %s FPS',
        (source, fpsAvg, state, verdict, responseSource, provider) => {
            const result = buildResponseFromRecord(
                measuredRecord({ source, fpsAvg }),
                hardware,
            );

            expect(result).toMatchObject({
                state,
                verdict,
                source: responseSource,
                provider,
                targetFps: 60,
                gpuPass: null,
                cpuPass: null,
                ramPass: null,
                vramPass: null,
                ssdPass: null,
                notes: [],
            });
        },
    );

    it.each([
        ['measured', 8, 'Can run'],
        ['measured', 12, "Can't run"],
        ['gemini', 8, 'Likely can run'],
        ['gemini', 12, "Likely can't run"],
    ])(
        'applies record warnings for %s requiring %s GB VRAM',
        (source, vramGb, verdict) => {
            const result = buildResponseFromRecord(
                measuredRecord({ source, fpsAvg: 90 }),
                hardwareWith({ isSsd: false }),
                gameWithRequirement({ vramGb, requiresSsd: true })
                    .requirements[0],
                90,
            );

            expect(result.verdict).toBe(verdict);
            expect(result.ssdPass).toBe(false);
            expect(result.vramPass).toBe(vramGb === 8);
            expect(result.notes).toEqual([expect.stringMatching(/SSD/i)]);
        },
    );

    it.each([
        [RequestSettingPreset.MEDIUM, 90, 'Likely can run'],
        [RequestSettingPreset.HIGH, 90, "Likely can't run"],
    ] as const)(
        'uses AI %s FPS against target %s with advisory hardware checks',
        (preset, targetFps, verdict) => {
            const result = buildResponseFromGemini(
                {
                    ...geminiEstimate(),
                    note: 'Shader compilation may stutter.',
                },
                gameWithRequirement({
                    cpu: cpu({ benchmarks: { passmark: 60_000 } }),
                    gpu: gpuWithVram(8, {
                        benchmarks: { timespy_extreme: 19_500 },
                    }),
                    ramGb: 32,
                    requiresSsd: true,
                    targetFps: 30,
                }),
                userCpu,
                gpuWithVram(8),
                hardwareWith({ isSsd: false }),
                { ...settings, preset, targetFps },
            );

            expect(result).toMatchObject({
                verdict,
                source: 'ai',
                provider: 'gemini',
                confidence: 'medium',
                targetFps: 90,
                gpuPass: false,
                cpuPass: false,
                ramPass: false,
                vramPass: true,
                ssdPass: false,
            });
            expect(result.notes).toEqual([
                'Shader compilation may stutter.',
                expect.stringMatching(/SSD/i),
            ]);
        },
    );

    it.each<[TargetFps, number, string]>([
        [60, 8, 'Likely can run'],
        [90, 8, "Likely can't run"],
        [60, 12, "Likely can't run"],
    ])(
        'uses benchmark FPS and warnings for fallback at target %s with %s GB VRAM',
        (targetFps, vramGb, verdict) => {
            const result = buildResponseFromFallback(
                gameWithRequirement({
                    vramGb,
                    requiresSsd: true,
                    targetFps: 30,
                    ramGb: 32,
                }),
                cpu({ benchmarks: { passmark: 1_000 } }),
                gpuWithVram(8, { benchmarks: { timespy_extreme: 19_500 } }),
                hardwareWith({ isSsd: false }),
                { ...settings, preset: RequestSettingPreset.MEDIUM, targetFps },
            );

            expect(result).toMatchObject({
                verdict,
                source: 'estimate',
                provider: null,
                confidence: 'low',
                targetFps,
                fps: { low: 107, med: 80, high: 62, ultra: 46 },
                cpuPass: false,
                ramPass: false,
                ssdPass: false,
            });
            expect(result.notes).toEqual([expect.stringMatching(/SSD/i)]);
        },
    );

    it('returns insufficient data from fallback when requirements are absent', () => {
        const game = gameWithRequirement();
        game.requirements = [];

        const result = buildResponseFromFallback(
            game,
            userCpu,
            gpuWithVram(8),
            hardware,
            settings,
            120,
        );

        expect(result).toMatchObject({
            state: 'insufficient',
            verdict: 'Insufficient data',
            source: null,
            provider: null,
            confidence: null,
            fps: null,
            targetFps: 120,
        });
    });
});

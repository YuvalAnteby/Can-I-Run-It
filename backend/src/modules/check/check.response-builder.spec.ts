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
    buildResponseFromGemini,
    buildResponseFromRecord,
} from './check.response-builder';
import { HardwareDto } from './dto/hardware.dto';
import {
    SettingPreset as RequestSettingPreset,
    SettingsDto,
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
    });
});

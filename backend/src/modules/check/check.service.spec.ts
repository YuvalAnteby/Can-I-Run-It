import { Test, TestingModule } from '@nestjs/testing';

import { GeminiService } from '../gemini/gemini.service';
import {
    PerformanceRecord,
    SettingPreset,
    UpscalerQualityMode,
    UpscalerType,
} from '../performance/entities/performance-record.entity';
import { CheckService } from './check.service';

describe('CheckService', () => {
    let service: CheckService;

    const userCpu = {
        id: 2,
        slug: 'user-cpu',
        benchmarks: { passmark: 40_000 },
    };
    const userGpu = {
        id: 2,
        slug: 'user-gpu',
        vramGb: 8,
        benchmarks: { timespy_extreme: 19_500 },
    };
    const requirement = {
        tier: 'minimum',
        cpu: { benchmarks: { passmark: 10_000 } },
        gpu: { benchmarks: { timespy_extreme: 4_000 } },
        ramGb: 8,
        vramGb: 8,
        requiresSsd: false,
    };
    const game = {
        id: 1,
        slug: 'test-game',
        requirements: [requirement],
    };

    const mockGameRepo = { findOne: jest.fn() };
    const mockCpuRepo = { findOneBy: jest.fn() };
    const mockGpuRepo = { findOneBy: jest.fn() };
    const mockPerfRepo = {
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };
    const mockGeminiService = { estimate: jest.fn() };
    const mockDataSource = {
        getRepository: jest.fn((entity: { name: string }) => {
            if (entity.name === 'Game') return mockGameRepo;
            if (entity.name === 'Cpu') return mockCpuRepo;
            if (entity.name === 'Gpu') return mockGpuRepo;
            if (entity.name === 'PerformanceRecord') return mockPerfRepo;
        }),
    };

    const validRequest = (
        settings: Record<string, unknown> = {},
        hardware: Record<string, unknown> = {},
    ) => ({
        gameSlug: 'test-game',
        hardware: {
            cpuId: 2,
            gpuId: 2,
            ramGb: 16,
            isSsd: true,
            ...hardware,
        },
        settings: {
            resolutionWidth: 1920,
            resolutionHeight: 1080,
            tier: 'minimum',
            preset: SettingPreset.HIGH,
            targetFps: 60 as const,
            ...settings,
        },
    });

    const record = (
        overrides: Partial<PerformanceRecord> = {},
    ): PerformanceRecord =>
        ({
            id: 1,
            game,
            cpu: userCpu,
            gpu: userGpu,
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
            sourceUrl: null,
            createdAt: new Date('2026-09-11T00:00:00.000Z'),
            ...overrides,
        }) as PerformanceRecord;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CheckService,
                { provide: 'DATA_SOURCE', useValue: mockDataSource },
                { provide: GeminiService, useValue: mockGeminiService },
            ],
        }).compile();

        service = module.get<CheckService>(CheckService);
        jest.clearAllMocks();
        mockGameRepo.findOne.mockResolvedValue(game);
        mockCpuRepo.findOneBy.mockResolvedValue(userCpu);
        mockGpuRepo.findOneBy.mockResolvedValue(userGpu);
        mockPerfRepo.find.mockResolvedValue([]);
        mockPerfRepo.create.mockReturnValue({});
        mockGeminiService.estimate.mockResolvedValue(null);
    });

    it('uses measured data before provider data and only the six core fields as identity', async () => {
        mockPerfRepo.find.mockResolvedValue([
            record({ source: 'gemini', fpsAvg: 120 }),
            record({ source: 'measured', fpsAvg: 75 }),
        ]);

        const result = await service.checkCompatibility(
            validRequest({ targetFps: 60 }, { isSsd: false }),
        );

        expect(result.source).toBe('measured');
        expect(result.verdict).toBe('Can run');
        expect(mockPerfRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    game: { id: 1 },
                    cpu: { id: 2 },
                    gpu: { id: 2 },
                    ramGb: 16,
                    resolutionWidth: 1920,
                    resolutionHeight: 1080,
                    settings: SettingPreset.HIGH,
                },
            }),
        );
    });

    it('uses quality preference within the preferred upscaler and source group', async () => {
        mockPerfRepo.find.mockResolvedValue([
            record({
                source: 'gemini',
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.QUALITY,
                fpsAvg: 120,
            }),
            record({
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.PERFORMANCE,
                fpsAvg: 60,
                createdAt: new Date('2026-09-12T00:00:00.000Z'),
            }),
            record({
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.QUALITY,
                fpsAvg: 70,
            }),
        ]);

        const result = await service.checkCompatibility(
            validRequest({
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.QUALITY,
            }),
        );

        expect(result.source).toBe('measured');
        expect(result.sub).toContain('70fps');
    });

    it('accepts another upscaler and chooses the newest row when no preference matches', async () => {
        mockPerfRepo.find.mockResolvedValue([
            record({ fpsAvg: 60 }),
            record({
                upscaler: UpscalerType.DLSS,
                fpsAvg: 70,
                createdAt: new Date('2026-09-12T00:00:00.000Z'),
            }),
        ]);

        const result = await service.checkCompatibility(
            validRequest({ upscaler: UpscalerType.FSR }),
        );

        expect(result.sub).toContain('70fps');
    });

    it('reuses a stored Gemini row without calling or saving the provider', async () => {
        mockPerfRepo.find.mockResolvedValue([
            record({ source: 'gemini', fpsAvg: 64 }),
        ]);

        const result = await service.checkCompatibility(validRequest());

        expect(result.source).toBe('ai');
        expect(result.provider).toBe('gemini');
        expect(mockGeminiService.estimate).not.toHaveBeenCalled();
        expect(mockPerfRepo.save).not.toHaveBeenCalled();
    });

    it('persists a new Gemini average with provider provenance and off upscaler assumptions', async () => {
        mockGeminiService.estimate.mockResolvedValue({
            fps: { low: 80, med: 70, high: 60, ultra: 45 },
            note: null,
        });

        await service.checkCompatibility(
            validRequest({
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.BALANCED,
            }),
        );

        expect(mockPerfRepo.create).toHaveBeenCalledWith({
            game,
            cpu: userCpu,
            gpu: userGpu,
            ramGb: 16,
            resolutionWidth: 1920,
            resolutionHeight: 1080,
            settings: SettingPreset.HIGH,
            upscaler: UpscalerType.OFF,
            upscalerQuality: null,
            fpsAvg: 60,
            fps1PercentLow: null,
            verified: false,
            source: 'gemini',
            sourceUrl: null,
        });
        expect(mockPerfRepo.save).toHaveBeenCalledTimes(1);
    });

    it('uses the heuristic without persisting it when a requirement is available', async () => {
        const result = await service.checkCompatibility(validRequest());

        expect(result.source).toBe('estimate');
        expect(mockPerfRepo.save).not.toHaveBeenCalled();
    });

    it('returns insufficient data when requirements and Gemini are unavailable', async () => {
        mockGameRepo.findOne.mockResolvedValue({ ...game, requirements: [] });

        const result = await service.checkCompatibility(
            validRequest({ targetFps: 120 }),
        );

        expect(result).toMatchObject({
            state: 'insufficient',
            verdict: 'Insufficient data',
            source: null,
            fps: null,
            targetFps: 120,
        });
        expect(mockPerfRepo.save).not.toHaveBeenCalled();
    });
});

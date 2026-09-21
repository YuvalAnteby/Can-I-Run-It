import { Test, TestingModule } from '@nestjs/testing';
import { IsNull } from 'typeorm';

import { Game } from '../games/entities/game.entity';
import { GeminiService } from '../gemini/gemini.service';
import {
    PerformanceRecord,
    SettingPreset,
    UpscalerQualityMode,
    UpscalerType,
} from '../performance/entities/performance-record.entity';
import { CheckService } from './check.service';

const containing = <T extends object>(value: T): T =>
    expect.objectContaining(value) as T;

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
        findOne: jest.fn(),
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
        mockPerfRepo.findOne.mockResolvedValue(null);
        mockPerfRepo.create.mockReturnValue({});
        mockGeminiService.estimate.mockResolvedValue(null);
    });

    const checkPending = (gameId: number, request: Record<string, unknown>) =>
        (
            service as unknown as {
                checkPendingCompatibility(
                    id: number,
                    dto: Record<string, unknown>,
                ): Promise<unknown>;
            }
        ).checkPendingCompatibility(gameId, request);

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
                where: containing({
                    game: { id: 1 },
                    cpu: { id: 2 },
                    gpu: { id: 2 },
                    ramGb: 16,
                    resolutionWidth: 1920,
                    resolutionHeight: 1080,
                    settings: SettingPreset.HIGH,
                    upscaler: UpscalerType.OFF,
                    upscalerQuality: IsNull(),
                }),
            }),
        );
    });

    it('does not use a published record from another normalized upscaler or quality', async () => {
        const mismatchedRecord = record({
            upscaler: UpscalerType.DLSS,
            upscalerQuality: UpscalerQualityMode.QUALITY,
            fpsAvg: 144,
        });
        mockPerfRepo.find.mockImplementation(
            (options: { where: Record<string, unknown> }) =>
                Promise.resolve(
                    options.where.upscaler === UpscalerType.OFF
                        ? []
                        : [mismatchedRecord],
                ),
        );

        const result = await service.checkCompatibility(validRequest());

        expect(result.source).toBe('estimate');
        expect(result.sub).toContain('Expect ~');
        expect(mockPerfRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: containing({
                    upscaler: UpscalerType.OFF,
                    upscalerQuality: IsNull(),
                }),
            }),
        );
    });

    it('uses SQL IS NULL for an explicitly null published quality', async () => {
        await service.checkCompatibility(
            validRequest({
                upscaler: UpscalerType.DLSS,
                upscalerQuality: null,
            }),
        );

        expect(mockPerfRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: containing({
                    upscaler: UpscalerType.DLSS,
                    upscalerQuality: IsNull(),
                }),
            }),
        );
    });

    it('selects the newest measured row among exact upscaler and quality matches', async () => {
        mockPerfRepo.find.mockResolvedValue([
            record({
                source: 'gemini',
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.QUALITY,
                fpsAvg: 120,
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

    it('persists a new Gemini average with the normalized request identity', async () => {
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
            upscaler: UpscalerType.DLSS,
            upscalerQuality: UpscalerQualityMode.BALANCED,
            fpsAvg: 60,
            fps1PercentLow: null,
            verified: false,
            source: 'gemini',
            sourceUrl: null,
        });
        expect(mockPerfRepo.save).toHaveBeenCalledTimes(1);
    });

    it('reuses a published Gemini cache for an identical upscaled request', async () => {
        const request = validRequest({
            upscaler: UpscalerType.DLSS,
            upscalerQuality: UpscalerQualityMode.QUALITY,
        });
        let cached: PerformanceRecord | null = null;
        mockPerfRepo.create.mockImplementation(
            (value: Partial<PerformanceRecord>) => ({
                ...record(value),
                ...value,
            }),
        );
        mockPerfRepo.save.mockImplementation((value: PerformanceRecord) => {
            cached = value;
            return value;
        });
        mockPerfRepo.find.mockImplementation(
            (options: { where: Record<string, unknown> }) =>
                cached &&
                options.where.upscaler === UpscalerType.DLSS &&
                options.where.upscalerQuality === UpscalerQualityMode.QUALITY
                    ? Promise.resolve([cached])
                    : Promise.resolve([]),
        );
        mockGeminiService.estimate.mockResolvedValue({
            fps: { low: 80, med: 70, high: 60, ultra: 45 },
            note: null,
        });

        await service.checkCompatibility(request);
        await service.checkCompatibility(request);

        expect(mockGeminiService.estimate).toHaveBeenCalledTimes(1);
        expect(mockPerfRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.QUALITY,
            }),
        );
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

    it('limits the game lookup to published games before checking performance or Gemini', async () => {
        mockGameRepo.findOne.mockResolvedValue(null);

        await expect(
            service.checkCompatibility(validRequest()),
        ).rejects.toThrow('Game with slug "test-game" not found');

        expect(mockGameRepo.findOne).toHaveBeenCalledWith({
            where: { slug: 'test-game', status: 'published' },
            relations: ['requirements', 'requirements.cpu', 'requirements.gpu'],
        });
        expect(mockPerfRepo.find).not.toHaveBeenCalled();
        expect(mockGeminiService.estimate).not.toHaveBeenCalled();
    });

    it('checks a pending game by internal id using only an exact cached Gemini row', async () => {
        const pendingGame = {
            ...game,
            status: 'pending_approval',
            requirements: [],
        } as unknown as Game;
        mockGameRepo.findOne.mockResolvedValue(pendingGame);
        mockPerfRepo.findOne.mockResolvedValue(
            record({
                game: pendingGame,
                source: 'gemini',
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.QUALITY,
                fpsAvg: 58,
            }),
        );

        const result = await checkPending(1, {
            hardware: {
                cpuId: 2,
                gpuId: 2,
                ramGb: 16,
                isSsd: true,
            },
            settings: {
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                tier: 'minimum',
                preset: SettingPreset.HIGH,
                targetFps: 60,
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.QUALITY,
            },
        });

        expect(result).toMatchObject({ source: 'ai', provider: 'gemini' });
        expect(mockGameRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 1, status: 'pending_approval' },
            }),
        );
        expect(mockPerfRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: containing({
                    game: { id: 1 },
                    cpu: { id: 2 },
                    gpu: { id: 2 },
                    ramGb: 16,
                    resolutionWidth: 1920,
                    resolutionHeight: 1080,
                    settings: SettingPreset.HIGH,
                    upscaler: UpscalerType.DLSS,
                    upscalerQuality: UpscalerQualityMode.QUALITY,
                    source: 'gemini',
                }),
                order: { createdAt: 'DESC' },
            }),
        );
        expect(mockPerfRepo.find).not.toHaveBeenCalled();
        expect(mockGeminiService.estimate).not.toHaveBeenCalled();
    });

    it('uses SQL IS NULL for an explicitly null pending quality', async () => {
        const pendingGame = {
            ...game,
            status: 'pending_approval',
            requirements: [],
        } as unknown as Game;
        mockGameRepo.findOne.mockResolvedValue(pendingGame);

        await checkPending(1, {
            hardware: {
                cpuId: 2,
                gpuId: 2,
                ramGb: 16,
                isSsd: true,
            },
            settings: {
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                preset: SettingPreset.HIGH,
                upscaler: UpscalerType.DLSS,
                upscalerQuality: null,
            },
        });

        expect(mockPerfRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: containing({
                    upscaler: UpscalerType.DLSS,
                    upscalerQuality: IsNull(),
                    source: 'gemini',
                }),
            }),
        );
    });

    it('caches a pending Gemini estimate with the request identity and no 1%-low value', async () => {
        const pendingGame = {
            ...game,
            status: 'pending_approval',
            requirements: [],
        } as unknown as Game;
        mockGameRepo.findOne.mockResolvedValue(pendingGame);
        mockGeminiService.estimate.mockResolvedValue({
            fps: { low: 80, med: 70, high: 60, ultra: 45 },
            note: null,
        });

        await checkPending(1, {
            hardware: {
                cpuId: 2,
                gpuId: 2,
                ramGb: 16,
                isSsd: true,
            },
            settings: {
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                preset: SettingPreset.HIGH,
                targetFps: 60,
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.BALANCED,
            },
        });

        expect(mockPerfRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                game: pendingGame,
                cpu: userCpu,
                gpu: userGpu,
                ramGb: 16,
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                settings: SettingPreset.HIGH,
                upscaler: UpscalerType.DLSS,
                upscalerQuality: UpscalerQualityMode.BALANCED,
                fpsAvg: 60,
                fps1PercentLow: null,
                source: 'gemini',
            }),
        );
        expect(mockPerfRepo.save).toHaveBeenCalledTimes(1);
    });

    it('keeps pending fallback insufficient when RAWG has no structured requirements', async () => {
        mockGameRepo.findOne.mockResolvedValue({
            ...game,
            status: 'pending_approval',
            requirements: [],
        });

        const result = await checkPending(1, {
            hardware: {
                cpuId: 2,
                gpuId: 2,
                ramGb: 16,
                isSsd: true,
            },
            settings: {
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                preset: SettingPreset.HIGH,
                targetFps: 120,
            },
        });

        expect(result).toMatchObject({
            state: 'insufficient',
            verdict: 'Insufficient data',
        });
        expect(mockPerfRepo.find).not.toHaveBeenCalled();
        expect(mockGeminiService.estimate).toHaveBeenCalledTimes(1);
        expect(mockPerfRepo.save).not.toHaveBeenCalled();
    });

    it('validates CPU and GPU IDs for pending checks before provider or performance work', async () => {
        mockGameRepo.findOne.mockResolvedValue({
            ...game,
            status: 'pending_approval',
        });
        mockCpuRepo.findOneBy.mockResolvedValue(null);

        await expect(
            checkPending(1, {
                hardware: {
                    cpuId: 0,
                    gpuId: 2,
                    ramGb: 16,
                    isSsd: true,
                },
                settings: {
                    resolutionWidth: 1920,
                    resolutionHeight: 1080,
                    preset: SettingPreset.HIGH,
                },
            }),
        ).rejects.toThrow('CPU with ID');
        expect(mockPerfRepo.find).not.toHaveBeenCalled();
        expect(mockGeminiService.estimate).not.toHaveBeenCalled();
    });
});

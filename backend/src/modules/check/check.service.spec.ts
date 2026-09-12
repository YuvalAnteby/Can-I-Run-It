import { Test, TestingModule } from '@nestjs/testing';

import { GeminiService } from '../gemini/gemini.service';
import { SettingPreset } from '../performance/entities/performance-record.entity';
import { CheckService } from './check.service';

describe('CheckService', () => {
    let service: CheckService;

    const mockGameRepo = {
        findOne: jest.fn(),
    };

    const mockCpuRepo = {
        findOneBy: jest.fn(),
    };

    const mockGpuRepo = {
        findOneBy: jest.fn(),
    };

    const mockPerfRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
    };

    const mockGeminiService = {
        estimate: jest.fn(),
    };

    const mockDataSource = {
        getRepository: jest.fn((entity: { name: string }) => {
            if (entity.name === 'Game') return mockGameRepo;
            if (entity.name === 'Cpu') return mockCpuRepo;
            if (entity.name === 'Gpu') return mockGpuRepo;
            if (entity.name === 'PerformanceRecord') return mockPerfRepo;
        }),
    };

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
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return compatibility results using fallback when no record exists and Gemini fails', async () => {
        const mockGame = {
            slug: 'test-game',
            requirements: [
                {
                    tier: 'minimum',
                    cpu: {
                        id: 1,
                        slug: 'min-cpu',
                        benchmarks: { passmark: 10000 },
                    },
                    gpu: {
                        id: 1,
                        slug: 'min-gpu',
                        benchmarks: { timespy_extreme: 4000 },
                    },
                    ramGb: 8,
                    resolutionHeight: 1080,
                    targetFps: 30,
                },
            ],
        };

        const mockCpu = {
            id: 2,
            slug: 'user-cpu',
            benchmarks: { passmark: 40000 },
        };
        const mockGpu = {
            id: 2,
            slug: 'user-gpu',
            benchmarks: { timespy_extreme: 26000 },
        };

        mockGameRepo.findOne.mockResolvedValue(mockGame);
        mockCpuRepo.findOneBy.mockResolvedValue(mockCpu);
        mockGpuRepo.findOneBy.mockResolvedValue(mockGpu);
        mockPerfRepo.findOne.mockResolvedValue(null);
        mockGeminiService.estimate.mockResolvedValue(null);

        const result = await service.checkCompatibility({
            gameSlug: 'test-game',
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
            },
        });

        expect(result).toBeDefined();
        expect(result.state).toBe('can');
        expect(result.gpuPass).toBe(true);
        expect(result.cpuPass).toBe(true);
        expect(result.ramPass).toBe(true);
        expect(result.fps).toBeDefined();
        expect(result.fps?.high).toBeGreaterThanOrEqual(60);
        expect(mockPerfRepo.findOne).toHaveBeenCalled();
        expect(mockGeminiService.estimate).toHaveBeenCalled();
    });

    it('should return compatibility results from Gemini when no record exists', async () => {
        const mockGame = {
            id: 1,
            slug: 'test-game',
            requirements: [],
        };

        const mockCpu = {
            id: 2,
            slug: 'user-cpu',
        };
        const mockGpu = {
            id: 2,
            slug: 'user-gpu',
        };

        const geminiEstimate = {
            fps: { low: 100, med: 80, high: 60, ultra: 40 },
            note: 'Looks good',
        };

        mockGameRepo.findOne.mockResolvedValue(mockGame);
        mockCpuRepo.findOneBy.mockResolvedValue(mockCpu);
        mockGpuRepo.findOneBy.mockResolvedValue(mockGpu);
        mockPerfRepo.findOne.mockResolvedValue(null);
        mockGeminiService.estimate.mockResolvedValue(geminiEstimate);
        mockPerfRepo.create.mockReturnValue({});

        const result = await service.checkCompatibility({
            gameSlug: 'test-game',
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
            },
        });

        expect(result).toBeDefined();
        expect(result.fps?.high).toBe(60);
        expect(mockGeminiService.estimate).toHaveBeenCalled();
        expect(mockPerfRepo.create).toHaveBeenCalled();
        expect(mockPerfRepo.save).toHaveBeenCalled();
    });

    it('should return compatibility results from DB record when found', async () => {
        const mockGame = {
            id: 1,
            slug: 'test-game',
            requirements: [
                {
                    tier: 'minimum',
                    cpu: {
                        id: 1,
                        slug: 'min-cpu',
                        benchmarks: { passmark: 1000 },
                    },
                    gpu: {
                        id: 1,
                        slug: 'min-gpu',
                        benchmarks: { timespy_extreme: 1000 },
                    },
                    ramGb: 8,
                    resolutionHeight: 1080,
                    targetFps: 30,
                },
            ],
        };

        const mockCpu = {
            id: 2,
            slug: 'user-cpu',
            benchmarks: { passmark: 2000 },
        };
        const mockGpu = {
            id: 2,
            slug: 'user-gpu',
            benchmarks: { timespy_extreme: 2000 },
        };

        const mockRecord = {
            fpsAvg: 75,
            resolutionHeight: 1080,
            settings: SettingPreset.HIGH,
            gpu: mockGpu,
            cpu: mockCpu,
            source: 'measured',
        };

        mockGameRepo.findOne.mockResolvedValue(mockGame);
        mockCpuRepo.findOneBy.mockResolvedValue(mockCpu);
        mockGpuRepo.findOneBy.mockResolvedValue(mockGpu);
        mockPerfRepo.findOne.mockResolvedValue(mockRecord);

        const result = await service.checkCompatibility({
            gameSlug: 'test-game',
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
            },
        });

        expect(result).toBeDefined();
        expect(result.state).toBe('can');
        expect(result.verdict).toBe('Can run');
        expect(result.sub).toContain('75fps');
        expect(result.fps?.high).toBe(75);
        expect(mockPerfRepo.findOne).toHaveBeenCalled();
        expect(mockGeminiService.estimate).not.toHaveBeenCalled();
    });
});

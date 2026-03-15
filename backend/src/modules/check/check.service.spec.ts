import { Test, TestingModule } from '@nestjs/testing';

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
            ],
        }).compile();

        service = module.get<CheckService>(CheckService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return compatibility results using fallback when no record exists', async () => {
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
                        benchmarks: { '3dmark-time-spy': 4000 },
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
            benchmarks: { '3dmark-time-spy': 26000 },
        };

        mockGameRepo.findOne.mockResolvedValue(mockGame);
        mockCpuRepo.findOneBy.mockResolvedValue(mockCpu);
        mockGpuRepo.findOneBy.mockResolvedValue(mockGpu);
        mockPerfRepo.findOne.mockResolvedValue(null);

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
        expect(result.fps.high).toBeGreaterThanOrEqual(60);
        expect(mockPerfRepo.findOne).toHaveBeenCalled();
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
                        benchmarks: { '3dmark-time-spy': 1000 },
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
            benchmarks: { '3dmark-time-spy': 2000 },
        };

        const mockRecord = {
            fpsAvg: 75,
            resolutionHeight: 1080,
            settings: SettingPreset.HIGH,
            gpu: mockGpu,
            cpu: mockCpu,
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
        expect(result.verdict).toBe('Runs well');
        expect(result.sub).toContain('75fps');
        expect(result.fps.high).toBe(75);
        expect(mockPerfRepo.findOne).toHaveBeenCalled();
    });
});

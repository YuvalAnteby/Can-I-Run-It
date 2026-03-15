import { Test, TestingModule } from '@nestjs/testing';

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

    const mockDataSource = {
        getRepository: jest.fn((entity: { name: string }) => {
            if (entity.name === 'Game') return mockGameRepo;
            if (entity.name === 'Cpu') return mockCpuRepo;
            if (entity.name === 'Gpu') return mockGpuRepo;
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
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return compatibility results', async () => {
        const mockGame = {
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

        mockGameRepo.findOne.mockResolvedValue(mockGame);
        mockCpuRepo.findOneBy.mockResolvedValue(mockCpu);
        mockGpuRepo.findOneBy.mockResolvedValue(mockGpu);

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
            },
        });

        expect(result).toBeDefined();
        expect(result.state).toBe('can');
        expect(result.gpuPass).toBe(true);
        expect(result.cpuPass).toBe(true);
        expect(result.ramPass).toBe(true);
        expect(result.fps).toBeDefined();
    });
});

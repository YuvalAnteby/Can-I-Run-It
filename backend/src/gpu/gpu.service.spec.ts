import { Test, TestingModule } from '@nestjs/testing';
import { GpuService } from './gpu.service';

describe('GpuService', () => {
    let service: GpuService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [GpuService],
        }).compile();

        service = module.get<GpuService>(GpuService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});

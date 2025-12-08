import { Test, TestingModule } from '@nestjs/testing';
import { GpuController } from './gpu.controller';
import { GpuService } from './gpu.service';

describe('GpuController', () => {
    let controller: GpuController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [GpuController],
            providers: [GpuService],
        }).compile();

        controller = module.get<GpuController>(GpuController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});

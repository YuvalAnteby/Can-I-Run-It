import { Test, TestingModule } from '@nestjs/testing';

import { CheckController } from './check.controller';
import { CheckService } from './check.service';

describe('CheckController pending route', () => {
    let controller: CheckController;
    const checkService = {
        checkCompatibility: jest.fn(),
        checkPendingCompatibility: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [CheckController],
            providers: [{ provide: CheckService, useValue: checkService }],
        }).compile();

        controller = module.get(CheckController);
        jest.clearAllMocks();
    });

    it('delegates pending checks with the internal game id and hardware/settings body', async () => {
        const request = {
            hardware: { cpuId: 2, gpuId: 3, ramGb: 16, isSsd: true },
            settings: {
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                preset: 'high',
            },
        };
        checkService.checkPendingCompatibility.mockResolvedValue({
            state: 'insufficient',
            verdict: 'Insufficient data',
        });

        await expect(
            (
                controller as unknown as {
                    checkPendingCompatibility(
                        gameId: number,
                        dto: typeof request,
                    ): Promise<unknown>;
                }
            ).checkPendingCompatibility(42, request),
        ).resolves.toEqual({
            state: 'insufficient',
            verdict: 'Insufficient data',
        });
        expect(checkService.checkPendingCompatibility).toHaveBeenCalledWith(
            42,
            request,
        );
        expect(checkService.checkCompatibility).not.toHaveBeenCalled();
    });
});

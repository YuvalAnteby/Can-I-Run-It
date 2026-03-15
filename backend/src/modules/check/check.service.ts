import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { Gpu } from '../gpu/entities/gpu.entity';
import { CheckRequestDto } from './dto/check-request.dto';
import { CheckResponseDto } from './dto/check-response.dto';

// TODO: remove these fallback scores once we have benchmarks and GEMINI API implemented for all hardware. These are just rough estimates to make the feature usable in the meantime.
const FALLBACK_GPU_SCORE: Record<string, number> = {
    'nvidia-geforce-rtx-4090': 100,
    'nvidia-geforce-rtx-4080': 80,
    'nvidia-geforce-rtx-4070': 62,
    'nvidia-geforce-rtx-3080': 58,
    'nvidia-geforce-rtx-3070': 48,
    'nvidia-geforce-rtx-3060': 34,
    'nvidia-geforce-rtx-2080-ti': 52,
    'nvidia-geforce-gtx-1080-ti': 30,
    'nvidia-geforce-gtx-1060': 14,
};

// TODO: remove these fallback scores once we have benchmarks and GEMINI API implemented for all hardware. These are just rough estimates to make the feature usable in the meantime.
const FALLBACK_CPU_SCORE: Record<string, number> = {
    'intel-core-i9-13900k': 100,
    'intel-core-i7-13700k': 85,
    'intel-core-i5-13600k': 72,
    'amd-ryzen-9-7950x3d': 98,
    'amd-ryzen-7-7800x3d': 88,
    'amd-ryzen-5-5600x': 60,
    'intel-core-i5-12400f': 65,
    'intel-core-i5-10400f': 45,
};

@Injectable()
export class CheckService {
    private readonly logger = new Logger(CheckService.name);
    private readonly gameRepo: Repository<Game>;
    private readonly cpuRepo: Repository<Cpu>;
    private readonly gpuRepo: Repository<Gpu>;

    constructor(
        @Inject('DATA_SOURCE')
        private readonly dataSource: DataSource,
    ) {
        this.gameRepo = this.dataSource.getRepository(Game);
        this.cpuRepo = this.dataSource.getRepository(Cpu);
        this.gpuRepo = this.dataSource.getRepository(Gpu);
    }

    async checkCompatibility(dto: CheckRequestDto): Promise<CheckResponseDto> {
        const { hardware, settings, gameSlug } = dto;
        const game = await this.gameRepo.findOne({
            where: { slug: gameSlug },
            relations: ['requirements', 'requirements.cpu', 'requirements.gpu'],
        });

        if (!game) {
            throw new NotFoundException(
                `Game with slug "${gameSlug}" not found`,
            );
        }

        const userCpu = await this.cpuRepo.findOneBy({ id: hardware.cpuId });
        const userGpu = await this.gpuRepo.findOneBy({ id: hardware.gpuId });

        if (!userCpu) {
            throw new NotFoundException(
                `CPU with ID "${hardware.cpuId}" not found`,
            );
        }
        if (!userGpu) {
            throw new NotFoundException(
                `GPU with ID "${hardware.gpuId}" not found`,
            );
        }

        const currentReq =
            game.requirements?.find((r) => r.tier === settings.tier) ||
            game.requirements?.[0];

        if (!currentReq) {
            throw new NotFoundException(
                `Requirements for game "${gameSlug}" and tier "${settings.tier}" not found`,
            );
        }

        const userGpuScore = this.getHardwareScore(userGpu, 'gpu');
        const userCpuScore = this.getHardwareScore(userCpu, 'cpu');
        const reqGpuScore = this.getHardwareScore(currentReq.gpu, 'gpu');
        const reqCpuScore = this.getHardwareScore(currentReq.cpu, 'cpu');

        const gpuPass = userGpuScore >= reqGpuScore * 0.9;
        const cpuPass = userCpuScore >= reqCpuScore * 0.9;
        const ramPass = hardware.ramGb >= currentReq.ramGb;

        const canRunMin = gpuPass && cpuPass && ramPass;

        const canRunRec =
            userGpuScore >= reqGpuScore * 1.5 &&
            userCpuScore >= reqCpuScore * 1.5 &&
            hardware.ramGb >= currentReq.ramGb * 1.5;

        let state: 'can' | 'barely' | 'cant';
        let verdict: string;
        let sub: string;

        if (!canRunMin) {
            state = 'cant';
            verdict = "Won't run smoothly";
            sub = !ramPass
                ? 'Insufficient RAM'
                : !gpuPass
                  ? 'GPU below requirement'
                  : 'CPU below requirement';
        } else if (!canRunRec) {
            state = 'barely';
            verdict = 'Meets requirements';
            sub = `Expect ~${currentReq.targetFps}fps at ${currentReq.resolutionHeight}p`;
        } else if (userGpuScore >= 80) {
            state = 'can';
            verdict = 'Runs great';
            sub = 'Exceeds recommended requirements';
        } else {
            state = 'can';
            verdict = 'Runs well';
            sub = 'Meets recommended requirements';
        }

        const fps = this.estimateFPS(userGpuScore, settings.resolutionHeight);

        return {
            state,
            verdict,
            sub,
            gpuPass,
            cpuPass,
            ramPass,
            fps,
        };
    }

    private getHardwareScore(
        hw: Cpu | Gpu | null | undefined,
        type: 'cpu' | 'gpu',
    ): number {
        if (!hw) return 0;

        if (hw.benchmarks) {
            if (type === 'gpu' && hw.benchmarks['3dmark-time-spy']) {
                return hw.benchmarks['3dmark-time-spy'] / 260;
            }
            if (type === 'cpu' && hw.benchmarks['passmark']) {
                return hw.benchmarks['passmark'] / 600;
            }
        }

        const map = type === 'gpu' ? FALLBACK_GPU_SCORE : FALLBACK_CPU_SCORE;
        return map[hw.slug] || 30;
    }

    private estimateFPS(score: number, resolution: number) {
        let resMultiplier = 1;
        if (resolution === 720) resMultiplier = 1.6;
        else if (resolution === 1440) resMultiplier = 0.65;
        else if (resolution === 2160) resMultiplier = 0.35;

        const scaledScore = score * resMultiplier;

        return {
            low: Math.round(scaledScore * 1.05 + 2),
            med: Math.round(scaledScore * 0.8),
            high: Math.round(scaledScore * 0.62),
            ultra: Math.round(scaledScore * 0.46),
        };
    }
}

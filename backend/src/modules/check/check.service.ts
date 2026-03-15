import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { Gpu } from '../gpu/entities/gpu.entity';
import {
    PerformanceRecord,
    SettingPreset,
    UpscalerType,
} from '../performance/entities/performance-record.entity';
import { CheckRequestDto } from './dto/check-request.dto';
import {
    CheckConfidence,
    CheckDataSource,
    CheckResponseDto,
} from './dto/check-response.dto';
import { HardwareDto } from './dto/hardware.dto';
import { SettingsDto } from './dto/settings.dto';

// Normalization divisors: chosen so that a top-tier card scores ~100
// RTX 4090 scores ~26000 in 3DMark Time Spy → 26000 / 260 = 100
// Core i9-13900K scores ~60000 in Passmark → 60000 / 600 = 100
const GPU_BENCHMARK_DIVISOR = 260;
const CPU_BENCHMARK_DIVISOR = 600;

// Minimum pass ratio: allow up to 10% below the requirement score before failing
const MIN_PASS_RATIO = 0.9;

// Recommended ratio: must exceed requirement by 50% to be considered "runs great"
const RECOMMENDED_RATIO = 1.5;

// TODO: Remove these fallback scores once benchmarks and Gemini API cover all hardware.
// These are rough estimates used only when a hardware entry has no benchmark data.
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

// TODO: Remove these fallback scores once benchmarks and Gemini API cover all hardware.
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
    private readonly perfRepo: Repository<PerformanceRecord>;

    constructor(
        @Inject('DATA_SOURCE')
        private readonly dataSource: DataSource,
    ) {
        this.gameRepo = this.dataSource.getRepository(Game);
        this.cpuRepo = this.dataSource.getRepository(Cpu);
        this.gpuRepo = this.dataSource.getRepository(Gpu);
        this.perfRepo = this.dataSource.getRepository(PerformanceRecord);
    }

    /**
     * Checks the compatibility of the user's hardware with the specified game.
     * Tries flows in order: DB record → (future) ML model → (future) Gemini → fallback heuristic.
     */
    async checkCompatibility(dto: CheckRequestDto): Promise<CheckResponseDto> {
        const { hardware, settings, gameSlug } = dto;

        // Parallel fetch — game, CPU and GPU are independent of each other
        const [game, userCpu, userGpu] = await Promise.all([
            this.gameRepo.findOne({
                where: { slug: gameSlug },
                relations: [
                    'requirements',
                    'requirements.cpu',
                    'requirements.gpu',
                ],
            }),
            this.cpuRepo.findOneBy({ id: hardware.cpuId }),
            this.gpuRepo.findOneBy({ id: hardware.gpuId }),
        ]);

        if (!game) {
            throw new NotFoundException(
                `Game with slug "${gameSlug}" not found`,
            );
        }
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

        // --- Flow 1: DB lookup ---
        // Only query native (upscaler OFF) records for now.
        // When upscaler support is added to SettingsDto, pass it through here instead.
        const record = await this.perfRepo.findOne({
            where: {
                game: { id: game.id },
                gpu: { id: hardware.gpuId },
                cpu: { id: hardware.cpuId },
                resolutionWidth: settings.resolutionWidth,
                resolutionHeight: settings.resolutionHeight,
                settings: settings.preset,
                upscaler: UpscalerType.OFF,
            },
            order: { verified: 'DESC', createdAt: 'DESC' },
        });

        if (record) {
            return this.buildResponseFromRecord(record, hardware);
        }

        // --- Flow 2: ML model (not yet implemented) ---
        // const mlResult = await this.mlService.predict(dto);
        // if (mlResult) return this.buildResponseFromMl(mlResult);

        // --- Flow 3: Gemini API (not yet implemented) ---
        // const geminiResult = await this.geminiService.check(dto);
        // if (geminiResult) {
        //     await this.cacheGeminiResult(geminiResult, game, hardware, settings);
        //     return this.buildResponseFromGemini(geminiResult);
        // }

        // --- Fallback: score-based heuristic ---
        return this.buildResponseFromFallback(
            game,
            userCpu,
            userGpu,
            hardware,
            settings,
        );
    }

    /**
     * Builds a response from a real benchmark record.
     * This is the most accurate path — FPS values are measured, not estimated.
     * gpuPass/cpuPass are derived from the recorded FPS directly rather than from
     * score comparisons, since the record is ground truth for that hardware combo.
     */
    private buildResponseFromRecord(
        record: PerformanceRecord,
        hardware: HardwareDto,
    ): CheckResponseDto {
        // RAM check against the RAM that was used during the benchmark
        const ramPass = hardware.ramGb >= record.ramGb;

        // GPU pass = the recorded FPS is playable (≥30).
        // CPU bottleneck cannot be reliably inferred from a perf record alone.
        const gpuPass = record.fpsAvg >= 30;
        const cpuPass = true;

        const confirmedFps = Math.round(record.fpsAvg);
        // Surface whether the record is community-reported or editorially verified
        const tag = record.verified ? 'Confirmed' : 'Reported';
        const resLabel = `${record.resolutionHeight}p ${record.settings}`;

        let state: 'can' | 'barely' | 'cant';
        let verdict: string;
        let sub: string;

        if (record.fpsAvg >= 60) {
            state = 'can';
            verdict = record.fpsAvg >= 100 ? 'Runs great' : 'Runs well';
            sub = `${tag} ~${confirmedFps}fps at ${resLabel}`;
        } else if (record.fpsAvg >= 30) {
            state = 'barely';
            verdict = 'Playable';
            sub = `${tag} ~${confirmedFps}fps at ${resLabel}`;
        } else {
            state = 'cant';
            verdict = "Won't run smoothly";
            sub = `${tag} ~${confirmedFps}fps is below playable threshold`;
        }

        const source: CheckDataSource = record.verified
            ? 'db_record_verified'
            : 'db_record_unverified';
        const confidence: CheckConfidence = record.verified ? 'high' : 'medium';

        return {
            state,
            verdict,
            sub,
            gpuPass,
            cpuPass,
            ramPass,
            fps: this.estimateFPSFromRecord(record),
            source,
            confidence,
        };
    }

    /**
     * Builds a response using score-based heuristics when no benchmark record exists.
     * Significantly less accurate than a DB record — used only as a last resort until
     * the ML model and Gemini flows are implemented.
     */
    private buildResponseFromFallback(
        game: Game,
        userCpu: Cpu,
        userGpu: Gpu,
        hardware: HardwareDto,
        settings: SettingsDto,
    ): CheckResponseDto {
        const currentReq =
            game.requirements?.find((r) => r.tier === settings.tier) ||
            game.requirements?.[0];

        if (!currentReq) {
            throw new NotFoundException(
                `Requirements for game "${game.slug}" not found`,
            );
        }

        const userGpuScore = this.getHardwareScore(userGpu, 'gpu');
        const userCpuScore = this.getHardwareScore(userCpu, 'cpu');
        const reqGpuScore = this.getHardwareScore(currentReq.gpu, 'gpu');
        const reqCpuScore = this.getHardwareScore(currentReq.cpu, 'cpu');

        const gpuPass = userGpuScore >= reqGpuScore * MIN_PASS_RATIO;
        const cpuPass = userCpuScore >= reqCpuScore * MIN_PASS_RATIO;
        const ramPass = hardware.ramGb >= currentReq.ramGb;

        const canRunMin = gpuPass && cpuPass && ramPass;
        const canRunRec =
            userGpuScore >= reqGpuScore * RECOMMENDED_RATIO &&
            userCpuScore >= reqCpuScore * RECOMMENDED_RATIO &&
            hardware.ramGb >= currentReq.ramGb * RECOMMENDED_RATIO;

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
            verdict = 'Meets minimum requirements';
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

        return {
            state,
            verdict,
            sub,
            gpuPass,
            cpuPass,
            ramPass,
            fps: this.estimateFPS(userGpuScore, settings.resolutionHeight),
            source: 'fallback',
            confidence: 'low',
        };
    }

    /**
     * Estimates FPS for all four presets from a single benchmark record.
     * Normalizes the known preset to LOW and applies fixed multipliers downward.
     * Not a substitute for real records — used to fill in the fps breakdown when
     * we only have data for one preset.
     */
    private estimateFPSFromRecord(
        record: PerformanceRecord,
    ): CheckResponseDto['fps'] {
        const baseFps = record.fpsAvg;
        const preset = record.settings;

        // Multipliers relative to LOW (1.0). Based on typical observed scaling across titles.
        const multipliers: Record<SettingPreset, number> = {
            [SettingPreset.LOW]: 1.0,
            [SettingPreset.MEDIUM]: 0.75,
            [SettingPreset.HIGH]: 0.6,
            [SettingPreset.ULTRA]: 0.45,
        };

        // Normalize to what LOW would be, then scale each preset from there
        const lowBase = baseFps / multipliers[preset];

        return {
            low: Math.round(lowBase * multipliers[SettingPreset.LOW]),
            med: Math.round(lowBase * multipliers[SettingPreset.MEDIUM]),
            high: Math.round(lowBase * multipliers[SettingPreset.HIGH]),
            ultra: Math.round(lowBase * multipliers[SettingPreset.ULTRA]),
        };
    }

    /**
     * Returns a normalized hardware score (0–100) for use in the fallback heuristic.
     * Prefers benchmark data from the entity; falls back to the hardcoded slug maps
     * for hardware that hasn't been benchmarked yet.
     *
     * Normalization reference:
     *   GPU — 3DMark Time Spy: RTX 4090 ~26000 → 26000 / 260 = 100
     *   CPU — Passmark:        i9-13900K ~60000 → 60000 / 600 = 100
     */
    private getHardwareScore(
        hw: Cpu | Gpu | null | undefined,
        type: 'cpu' | 'gpu',
    ): number {
        if (!hw) return 0;

        if (hw.benchmarks) {
            if (type === 'gpu' && hw.benchmarks['3dmark-time-spy']) {
                return hw.benchmarks['3dmark-time-spy'] / GPU_BENCHMARK_DIVISOR;
            }
            if (type === 'cpu' && hw.benchmarks['passmark']) {
                return hw.benchmarks['passmark'] / CPU_BENCHMARK_DIVISOR;
            }
        }

        const map = type === 'gpu' ? FALLBACK_GPU_SCORE : FALLBACK_CPU_SCORE;
        // Default to 30 — roughly a mid-range card from 2–3 generations ago
        return map[hw.slug] ?? 30;
    }

    /**
     * Estimates FPS at all four presets from a raw GPU score and target resolution.
     * GPU-only — does not account for CPU bottlenecks.
     * Used exclusively by the fallback path.
     */
    private estimateFPS(
        score: number,
        resolution: number,
    ): CheckResponseDto['fps'] {
        let resMultiplier = 1;
        if (resolution === 720) resMultiplier = 1.6;
        else if (resolution === 1440) resMultiplier = 0.65;
        else if (resolution === 2160) resMultiplier = 0.35;
        // 1080p → multiplier stays 1.0

        const s = score * resMultiplier;

        return {
            low: Math.round(s * 1.05 + 2),
            med: Math.round(s * 0.8),
            high: Math.round(s * 0.62),
            ultra: Math.round(s * 0.46),
        };
    }
}

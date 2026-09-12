import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { GeminiService } from '../gemini/gemini.service';
import { Gpu } from '../gpu/entities/gpu.entity';
import {
    PerformanceRecord,
    SettingPreset,
    UpscalerType,
} from '../performance/entities/performance-record.entity';
import {
    buildResponseFromFallback,
    buildResponseFromGemini,
    buildResponseFromRecord,
} from './check.response-builder';
import { CheckRequestDto } from './dto/check-request.dto';
import { CheckFps, CheckResponseDto } from './dto/check-response.dto';
import { HardwareDto } from './dto/hardware.dto';
import { SettingsDto } from './dto/settings.dto';

// TODO: Remove debug logs before merging to staging or main
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
        private readonly geminiService: GeminiService,
    ) {
        this.gameRepo = this.dataSource.getRepository(Game);
        this.cpuRepo = this.dataSource.getRepository(Cpu);
        this.gpuRepo = this.dataSource.getRepository(Gpu);
        this.perfRepo = this.dataSource.getRepository(PerformanceRecord);
    }

    /**
     * Checks the compatibility of the user's hardware with the specified game.
     * Tries flows in order: DB record → Gemini API → fallback heuristic.
     */
    async checkCompatibility(dto: CheckRequestDto): Promise<CheckResponseDto> {
        const { hardware, settings, gameSlug } = dto;

        if (!settings.preset) {
            settings.preset = SettingPreset.HIGH;
        }

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

        if (!game)
            throw new NotFoundException(
                `Game with slug "${gameSlug}" not found`,
            );
        if (!userCpu)
            throw new NotFoundException(
                `CPU with ID "${hardware.cpuId}" not found`,
            );
        if (!userGpu)
            throw new NotFoundException(
                `GPU with ID "${hardware.gpuId}" not found`,
            );

        // --- Flow 1: DB lookup ---
        const records = await this.perfRepo.find({
            where: {
                game: { id: game.id },
                cpu: { id: hardware.cpuId },
                gpu: { id: hardware.gpuId },
                ramGb: hardware.ramGb,
                resolutionWidth: settings.resolutionWidth,
                resolutionHeight: settings.resolutionHeight,
                settings: settings.preset,
            },
            relations: ['gpu'],
        });

        const candidates = records.some(({ source }) => source === 'measured')
            ? records.filter(({ source }) => source === 'measured')
            : records;
        const preference = (record: PerformanceRecord) =>
            Number(
                settings.upscaler !== undefined &&
                    record.upscaler === settings.upscaler,
            ) *
                2 +
            Number(
                settings.upscalerQuality !== undefined &&
                    record.upscalerQuality === settings.upscalerQuality,
            );
        const record = candidates.sort(
            (a, b) =>
                preference(b) - preference(a) ||
                b.createdAt.getTime() - a.createdAt.getTime(),
        )[0];

        if (record) {
            const requirement =
                game.requirements?.find(({ tier }) => tier === settings.tier) ??
                game.requirements?.[0] ??
                null;
            return buildResponseFromRecord(
                record,
                hardware,
                requirement,
                settings.targetFps ?? 60,
            );
        }

        // --- Flow 2: ML model ---
        // TODO: Implement ML model flow here and call buildResponseFromML when ready

        // --- Flow 3: Gemini API ---
        const geminiEstimate = await this.geminiService.estimate(
            game,
            userCpu,
            userGpu,
            hardware.ramGb,
            settings,
        );

        if (geminiEstimate) {
            await this.cacheGeminiResult(
                geminiEstimate,
                game,
                userCpu,
                userGpu,
                hardware,
                settings,
            );
            return buildResponseFromGemini(
                geminiEstimate,
                game,
                userCpu,
                userGpu,
                hardware,
                settings,
            );
        }

        // --- Flow 4: Score-based heuristic fallback ---
        return buildResponseFromFallback(
            game,
            userCpu,
            userGpu,
            hardware,
            settings,
        );
    }

    // ---------------------------------------------------------------------------
    // Gemini cache write
    // ---------------------------------------------------------------------------

    /**
     * Persists a Gemini estimate as an unverified performance record so that
     * subsequent identical requests hit Flow 1 (DB) instead of calling Gemini again.
     * Failures are swallowed - a cache miss is not fatal.
     */
    private async cacheGeminiResult(
        estimate: { fps: CheckFps; note: string | null },
        game: Game,
        cpu: Cpu,
        gpu: Gpu,
        hardware: HardwareDto,
        settings: SettingsDto,
    ): Promise<void> {
        try {
            const preset = settings.preset ?? SettingPreset.HIGH;
            const presetToFps: Record<SettingPreset, number> = {
                [SettingPreset.LOW]: estimate.fps.low,
                [SettingPreset.MEDIUM]: estimate.fps.med,
                [SettingPreset.HIGH]: estimate.fps.high,
                [SettingPreset.ULTRA]: estimate.fps.ultra,
            };

            const record = this.perfRepo.create({
                game,
                cpu,
                gpu,
                ramGb: hardware.ramGb,
                resolutionWidth: settings.resolutionWidth,
                resolutionHeight: settings.resolutionHeight,
                settings: preset,
                upscaler: settings.upscaler ?? UpscalerType.OFF,
                upscalerQuality: settings.upscalerQuality ?? null,
                fpsAvg: presetToFps[preset],
                fps1PercentLow: null,
                verified: false,
                source: 'gemini',
                sourceUrl: null,
            });

            await this.perfRepo.save(record);
            this.logger.log(
                `Cached Gemini estimate for game=${game.slug} gpu=${gpu.slug} cpu=${cpu.slug}`,
            );
        } catch (err) {
            this.logger.error('Failed to cache Gemini result', err);
        }
    }
}

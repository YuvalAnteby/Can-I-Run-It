import { NotFoundException } from '@nestjs/common';

import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
import { GameRequirement } from '../games/entities/game-requirement.entity';
import { GeminiEstimate } from '../gemini/gemini.service';
import { Gpu } from '../gpu/entities/gpu.entity';
import {
    PerformanceRecord,
    SettingPreset,
} from '../performance/entities/performance-record.entity';
import {
    estimateFPS,
    estimateFPSFromRecord,
    getHardwareScore,
    MIN_PASS_RATIO,
    PRESET_TO_FPS_KEY,
} from './check.helpers';
import {
    CheckResponseDto,
    CheckState,
    CheckVerdict,
} from './dto/check-response.dto';
import { HardwareDto } from './dto/hardware.dto';
import { SettingsDto, TargetFps } from './dto/settings.dto';

function getDecision(
    fps: number,
    targetFps: TargetFps,
    vramPass: boolean | null,
    likely: boolean,
): { state: CheckState; verdict: CheckVerdict } {
    const canRun = fps >= targetFps && vramPass !== false;

    return {
        state: canRun ? 'can' : 'cant',
        verdict: likely
            ? canRun
                ? 'Likely can run'
                : "Likely can't run"
            : canRun
              ? 'Can run'
              : "Can't run",
    };
}

function getWarnings(
    requirement: GameRequirement | null,
    gpu: Gpu,
    hardware: HardwareDto,
): Pick<CheckResponseDto, 'vramPass' | 'ssdPass' | 'notes'> {
    const vramPass =
        requirement?.vramGb == null ? null : gpu.vramGb >= requirement.vramGb;
    const ssdPass = requirement
        ? !requirement.requiresSsd || hardware.isSsd
        : null;

    return {
        vramPass,
        ssdPass,
        notes: ssdPass === false ? ['An SSD is required for this game.'] : [],
    };
}

function findRequirement(
    game: Game,
    settings: SettingsDto,
): GameRequirement | null {
    return (
        game.requirements?.find((requirement) =>
            settings.tier ? requirement.tier === settings.tier : false,
        ) ??
        game.requirements?.[0] ??
        null
    );
}

export function buildResponseFromRecord(
    record: PerformanceRecord,
    hardware: HardwareDto,
    requirement: GameRequirement | null = null,
    targetFps: TargetFps = 60,
): CheckResponseDto {
    const measured = record.source === 'measured';
    const warnings = getWarnings(requirement, record.gpu, hardware);
    const decision = getDecision(
        record.fpsAvg,
        targetFps,
        warnings.vramPass,
        !measured,
    );
    const fps = Math.round(record.fpsAvg);
    const origin = measured ? 'Measured' : `${record.source} estimate`;

    return {
        ...decision,
        sub: `${origin} ~${fps}fps at ${record.resolutionHeight}p ${record.settings}`,
        source: measured ? 'measured' : 'ai',
        provider: measured ? null : record.source,
        confidence: measured ? 'high' : 'medium',
        targetFps,
        fps: estimateFPSFromRecord(record),
        gpuPass: null,
        cpuPass: null,
        ramPass: null,
        ...warnings,
    };
}

export function buildResponseFromGemini(
    estimate: GeminiEstimate,
    game: Game,
    userCpu: Cpu,
    userGpu: Gpu,
    hardware: HardwareDto,
    settings: SettingsDto,
    targetFps: TargetFps = settings.targetFps ?? 60,
): CheckResponseDto {
    const preset = settings.preset ?? SettingPreset.HIGH;
    const userFps = estimate.fps[PRESET_TO_FPS_KEY[preset]];
    const requirement = findRequirement(game, settings);
    const warnings = getWarnings(requirement, userGpu, hardware);
    const gpuPass = requirement?.gpu
        ? getHardwareScore(userGpu, 'gpu') >=
          getHardwareScore(requirement.gpu, 'gpu') * MIN_PASS_RATIO
        : null;
    const cpuPass = requirement?.cpu
        ? getHardwareScore(userCpu, 'cpu') >=
          getHardwareScore(requirement.cpu, 'cpu') * MIN_PASS_RATIO
        : null;
    const ramPass = requirement ? hardware.ramGb >= requirement.ramGb : null;

    return {
        ...getDecision(userFps, targetFps, warnings.vramPass, true),
        sub: `Estimated ~${userFps}fps at ${settings.resolutionHeight}p ${preset}`,
        source: 'ai',
        provider: 'gemini',
        confidence: 'medium',
        targetFps,
        fps: estimate.fps,
        gpuPass,
        cpuPass,
        ramPass,
        ...warnings,
        notes: estimate.note
            ? [estimate.note, ...warnings.notes]
            : warnings.notes,
    };
}

export function buildResponseFromFallback(
    game: Game,
    userCpu: Cpu,
    userGpu: Gpu,
    hardware: HardwareDto,
    settings: SettingsDto,
    targetFps: TargetFps = settings.targetFps ?? 60,
): CheckResponseDto {
    const requirement = findRequirement(game, settings);

    if (!requirement) {
        throw new NotFoundException(
            `Requirements for game "${game.slug}" not found`,
        );
    }

    const gpuPass = requirement.gpu
        ? getHardwareScore(userGpu, 'gpu') >=
          getHardwareScore(requirement.gpu, 'gpu') * MIN_PASS_RATIO
        : null;
    const cpuPass = requirement.cpu
        ? getHardwareScore(userCpu, 'cpu') >=
          getHardwareScore(requirement.cpu, 'cpu') * MIN_PASS_RATIO
        : null;
    const ramPass = hardware.ramGb >= requirement.ramGb;
    const fps = estimateFPS(
        getHardwareScore(userGpu, 'gpu'),
        settings.resolutionHeight,
    );
    const preset = settings.preset ?? SettingPreset.HIGH;
    const userFps = fps[PRESET_TO_FPS_KEY[preset]];
    const warnings = getWarnings(requirement, userGpu, hardware);

    return {
        ...getDecision(userFps, targetFps, warnings.vramPass, true),
        sub: `Expect ~${userFps}fps at ${settings.resolutionHeight}p ${preset}`,
        source: 'estimate',
        provider: null,
        confidence: 'low',
        targetFps,
        fps,
        gpuPass,
        cpuPass,
        ramPass,
        ...warnings,
    };
}

export function buildInsufficientResponse(
    targetFps: TargetFps,
): CheckResponseDto {
    return {
        state: 'insufficient',
        verdict: 'Insufficient data',
        sub: 'No performance data is available for this configuration.',
        source: null,
        provider: null,
        confidence: null,
        targetFps,
        fps: null,
        gpuPass: null,
        cpuPass: null,
        ramPass: null,
        vramPass: null,
        ssdPass: null,
        notes: [],
    };
}

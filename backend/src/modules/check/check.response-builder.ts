import { NotFoundException } from '@nestjs/common';

import { Cpu } from '../cpu/entities/cpu.entity';
import { Game } from '../games/entities/game.entity';
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
    CheckConfidence,
    CheckDataSource,
    CheckResponseDto,
} from './dto/check-response.dto';
import { HardwareDto } from './dto/hardware.dto';
import { SettingsDto } from './dto/settings.dto';

// ---------------------------------------------------------------------------
// Record builder
// ---------------------------------------------------------------------------

/**
 * Builds a response from a real benchmark record.
 * Most accurate path — FPS values are measured, not estimated.
 * gpuPass/cpuPass are derived from the recorded FPS directly rather than from
 * score comparisons, since the record is ground truth for that hardware combo.
 */
export function buildResponseFromRecord(
    record: PerformanceRecord,
    hardware: HardwareDto,
): CheckResponseDto {
    const ramPass = hardware.ramGb >= record.ramGb;
    // GPU pass = the recorded FPS is playable (≥30).
    // CPU bottleneck cannot be reliably inferred from a perf record alone.
    const gpuPass = record.fpsAvg >= 30;
    const cpuPass = true;

    const confirmedFps = Math.round(record.fpsAvg);
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
        fps: estimateFPSFromRecord(record),
        source,
        confidence,
    };
}

// ---------------------------------------------------------------------------
// Gemini builder
// ---------------------------------------------------------------------------

/**
 * Builds a response from a Gemini estimate.
 * Pass/fail flags are derived from requirement scores (same as fallback) since
 * there is no measured record to anchor against.
 */
export function buildResponseFromGemini(
    estimate: GeminiEstimate,
    game: Game,
    userCpu: Cpu,
    userGpu: Gpu,
    hardware: HardwareDto,
    settings: SettingsDto,
): CheckResponseDto {
    const preset = settings.preset ?? SettingPreset.HIGH;
    const userFps = estimate.fps[PRESET_TO_FPS_KEY[preset]];

    const currentReq =
        game.requirements?.find((r) => r.tier === settings.tier) ||
        game.requirements?.[0];

    const gpuPass = currentReq
        ? getHardwareScore(userGpu, 'gpu') >=
          getHardwareScore(currentReq.gpu, 'gpu') * MIN_PASS_RATIO
        : true;
    const cpuPass = currentReq
        ? getHardwareScore(userCpu, 'cpu') >=
          getHardwareScore(currentReq.cpu, 'cpu') * MIN_PASS_RATIO
        : true;
    const ramPass = currentReq ? hardware.ramGb >= currentReq.ramGb : true;

    const resLabel = `${settings.resolutionHeight}p ${preset}`;

    let state: 'can' | 'barely' | 'cant';
    let verdict: string;
    let sub: string;

    if (userFps >= 60) {
        state = 'can';
        verdict = userFps >= 100 ? 'Runs great' : 'Runs well';
        sub = `Estimated ~${userFps}fps at ${resLabel}`;
    } else if (userFps >= 30) {
        state = 'barely';
        verdict = 'Playable';
        sub = `Estimated ~${userFps}fps at ${resLabel}`;
    } else {
        state = 'cant';
        verdict = "Won't run smoothly";
        sub = `Estimated ~${userFps}fps at ${resLabel} (below playable threshold)`;
    }

    // Append Gemini's note on a second line if present
    if (estimate.note) {
        sub = `${sub}\n${estimate.note}`;
    }

    return {
        state,
        verdict,
        sub,
        gpuPass,
        cpuPass,
        ramPass,
        fps: estimate.fps,
        source: 'gemini',
        confidence: 'medium',
    };
}

// ---------------------------------------------------------------------------
// Fallback builder
// ---------------------------------------------------------------------------

/**
 * Builds a response using score-based heuristics when no better data exists.
 * Significantly less accurate — used only as a last resort until the ML model
 * and Gemini flows are implemented or available.
 */
export function buildResponseFromFallback(
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

    const userGpuScore = getHardwareScore(userGpu, 'gpu');
    const userCpuScore = getHardwareScore(userCpu, 'cpu');
    const reqGpuScore = getHardwareScore(currentReq.gpu, 'gpu');
    const reqCpuScore = getHardwareScore(currentReq.cpu, 'cpu');

    const gpuPass = userGpuScore >= reqGpuScore * MIN_PASS_RATIO;
    const cpuPass = userCpuScore >= reqCpuScore * MIN_PASS_RATIO;
    const ramPass = hardware.ramGb >= currentReq.ramGb;

    // Find the absolute minimum requirement to determine if the game can run AT ALL
    const minReq =
        game.requirements?.find((r) => r.tier === 'minimum') ||
        game.requirements?.[0];
    const minGpuScore = minReq ? getHardwareScore(minReq.gpu, 'gpu') : 0;
    const minCpuScore = minReq ? getHardwareScore(minReq.cpu, 'cpu') : 0;
    const minRam = minReq?.ramGb || 0;

    const failsMinimumHard =
        userGpuScore < minGpuScore * MIN_PASS_RATIO ||
        userCpuScore < minCpuScore * MIN_PASS_RATIO ||
        hardware.ramGb < minRam;

    const estimatedFpsObj = estimateFPS(
        userGpuScore,
        settings.resolutionHeight,
    );
    const userFps = estimatedFpsObj[PRESET_TO_FPS_KEY[settings.preset]];

    const resLabel = `${settings.resolutionHeight}p ${settings.preset}`;

    let state: 'can' | 'barely' | 'cant';
    let verdict: string;
    let sub: string;

    if (failsMinimumHard) {
        state = 'cant';
        verdict = "Won't run smoothly";
        if (hardware.ramGb < minRam) {
            sub = `Insufficient RAM (Minimum: ${minRam}GB)`;
        } else if (userGpuScore < minGpuScore * MIN_PASS_RATIO) {
            sub = 'GPU below minimum requirements';
        } else {
            sub = 'CPU below minimum requirements';
        }
    } else if (userFps >= 60) {
        state = 'can';
        verdict = userFps >= 100 ? 'Runs great' : 'Runs well';
        sub = `Expect ~${userFps}fps at ${resLabel}`;
    } else if (userFps >= 30) {
        state = 'barely';
        verdict = 'Playable';
        sub = `Expect ~${userFps}fps at ${resLabel}`;
    } else {
        state = 'cant';
        verdict = "Won't run smoothly";
        sub = `Expect ~${userFps}fps at ${resLabel} (below playable threshold)`;
    }

    return {
        state,
        verdict,
        sub,
        gpuPass,
        cpuPass,
        ramPass,
        fps: estimatedFpsObj,
        source: 'fallback',
        confidence: 'low',
    };
}

import { Cpu } from '../cpu/entities/cpu.entity';
import { Gpu } from '../gpu/entities/gpu.entity';
import {
    PerformanceRecord,
    SettingPreset,
} from '../performance/entities/performance-record.entity';
import { CheckFps } from './dto/check-response.dto';

// ---------------------------------------------------------------------------
// Normalization constants
// ---------------------------------------------------------------------------

// Divisors chosen so that a top-tier card scores ~100:
// RTX 4090 scores ~19500 in 3DMark Time Spy Extreme → 19500 / 195 = 100
// Core i9-13900K scores ~60000 in Passmark   → 60000 / 600 = 100
export const GPU_BENCHMARK_DIVISOR = 195;
export const CPU_BENCHMARK_DIVISOR = 600;

// Allow up to 10% below the requirement score before marking as failing
export const MIN_PASS_RATIO = 0.9;

// TODO: Remove once benchmarks and Gemini API cover all hardware.
// Rough estimates used only when a hardware entry has no benchmark data.
export const FALLBACK_GPU_SCORE: Record<string, number> = {
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

// TODO: Remove once benchmarks and Gemini API cover all hardware.
export const FALLBACK_CPU_SCORE: Record<string, number> = {
    'intel-core-i9-13900k': 100,
    'intel-core-i7-13700k': 85,
    'intel-core-i5-13600k': 72,
    'amd-ryzen-9-7950x3d': 98,
    'amd-ryzen-7-7800x3d': 88,
    'amd-ryzen-5-5600x': 60,
    'intel-core-i5-12400f': 65,
    'intel-core-i5-10400f': 45,
};

// ---------------------------------------------------------------------------
// Hardware scoring
// ---------------------------------------------------------------------------

/**
 * Returns a normalized hardware score (0–100) for use in the fallback heuristic.
 * Prefers benchmark data from the entity; falls back to the hardcoded slug maps
 * for hardware that hasn't been benchmarked yet.
 */
export function getHardwareScore(
    hw: Cpu | Gpu | null | undefined,
    type: 'cpu' | 'gpu',
): number {
    if (!hw) return 0;

    if (hw.benchmarks) {
        if (type === 'gpu' && hw.benchmarks.timespy_extreme) {
            return hw.benchmarks.timespy_extreme / GPU_BENCHMARK_DIVISOR;
        }
        if (type === 'cpu' && hw.benchmarks['passmark']) {
            return hw.benchmarks['passmark'] / CPU_BENCHMARK_DIVISOR;
        }
    }

    const map = type === 'gpu' ? FALLBACK_GPU_SCORE : FALLBACK_CPU_SCORE;
    // Default to 30 — roughly a mid-range card from 2–3 generations ago
    return map[hw.slug] ?? 30;
}

// ---------------------------------------------------------------------------
// FPS estimation
// ---------------------------------------------------------------------------

/**
 * Estimates FPS at all four presets from a raw GPU score and target resolution.
 * GPU-only — does not account for CPU bottlenecks.
 * Used exclusively by the fallback path.
 */
export function estimateFPS(score: number, resolution: number): CheckFps {
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

/**
 * Estimates FPS for all four presets from a single benchmark record.
 * Normalizes the known preset to LOW and applies fixed multipliers downward.
 * Not a substitute for real records — used to fill in the fps breakdown when
 * we only have data for one preset.
 */
export function estimateFPSFromRecord(record: PerformanceRecord): CheckFps {
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

// ---------------------------------------------------------------------------
// Shared preset → fps-key map
// ---------------------------------------------------------------------------

/**
 * Maps a SettingPreset enum value to the corresponding key in CheckResponseDto['fps'].
 * Defined once here to avoid duplication across builders.
 */
export const PRESET_TO_FPS_KEY: Record<SettingPreset, keyof CheckFps> = {
    [SettingPreset.LOW]: 'low',
    [SettingPreset.MEDIUM]: 'med',
    [SettingPreset.HIGH]: 'high',
    [SettingPreset.ULTRA]: 'ultra',
};

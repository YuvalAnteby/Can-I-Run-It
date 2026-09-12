export enum SettingPreset {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  ULTRA = 'ultra',
}

export interface Hardware {
  cpuId: number;
  gpuId: number;
  ramGb: number;
  isSsd: boolean;
}

export interface Settings {
  resolutionWidth: number;
  resolutionHeight: number;
  tier?: string;
  preset?: SettingPreset;
  targetFps: TargetFps;
}

export interface CheckRequest {
  gameSlug: string;
  hardware: Hardware;
  settings: Settings;
}

export const TARGET_FPS_VALUES = [30, 60, 90, 120, 144] as const;
export type TargetFps = (typeof TARGET_FPS_VALUES)[number];
export type CheckState = 'can' | 'cant' | 'insufficient';
export type CheckVerdict =
  | 'Can run'
  | "Can't run"
  | 'Likely can run'
  | "Likely can't run"
  | 'Insufficient data';
export type CheckSource = 'measured' | 'ai' | 'estimate';
export type CheckConfidence = 'high' | 'medium' | 'low';

export interface CheckFps {
  low: number;
  med: number;
  high: number;
  ultra: number;
}

export interface CheckResponse {
  state: CheckState;
  verdict: CheckVerdict;
  sub: string;
  source: CheckSource | null;
  provider: string | null;
  confidence: CheckConfidence | null;
  targetFps: TargetFps;
  fps: CheckFps | null;
  gpuPass: boolean | null;
  cpuPass: boolean | null;
  ramPass: boolean | null;
  vramPass: boolean | null;
  ssdPass: boolean | null;
  notes: string[];
}

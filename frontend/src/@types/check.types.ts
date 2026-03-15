export interface Hardware {
  cpuId: number;
  gpuId: number;
  ramGb: number;
  isSsd: boolean;
}

export interface Settings {
  resolutionWidth: number;
  resolutionHeight: number;
  tier: string;
  preset?: string;
}

export interface CheckRequest {
  gameSlug: string;
  hardware: Hardware;
  settings: Settings;
}

export interface CheckResponse {
  state: 'can' | 'barely' | 'cant';
  verdict: string;
  sub: string;
  gpuPass: boolean;
  cpuPass: boolean;
  ramPass: boolean;
  fps: {
    low: number;
    med: number;
    high: number;
    ultra: number;
  };
}

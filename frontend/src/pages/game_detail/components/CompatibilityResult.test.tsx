import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SettingPreset, type CheckResponse } from '../../../@types/check.types';
import { CompatibilityResult } from './CompatibilityResult';
import { HardwareCheckCard } from './HardwareCheckCard';

const measuredResult: CheckResponse = {
  state: 'can',
  verdict: 'Can run',
  sub: 'Recorded performance meets your selected target.',
  source: 'measured',
  provider: null,
  confidence: 'high',
  targetFps: 60,
  fps: { low: 110, med: 96, high: 78, ultra: 62 },
  gpuPass: true,
  cpuPass: true,
  ramPass: true,
  vramPass: true,
  ssdPass: true,
  notes: [],
};

const aiResult: CheckResponse = {
  state: 'can',
  verdict: 'Likely can run',
  sub: 'AI-predicted performance meets your selected target.',
  source: 'ai',
  provider: 'gemini',
  confidence: 'medium',
  targetFps: 90,
  fps: { low: 124, med: 108, high: 94, ultra: 71 },
  gpuPass: true,
  cpuPass: true,
  ramPass: true,
  vramPass: true,
  ssdPass: true,
  notes: [],
};

const estimateResult: CheckResponse = {
  state: 'cant',
  verdict: "Likely can't run",
  sub: 'Estimated performance misses your selected target.',
  source: 'estimate',
  provider: null,
  confidence: 'low',
  targetFps: 120,
  fps: { low: 88, med: 72, high: 58, ultra: 41 },
  gpuPass: false,
  cpuPass: true,
  ramPass: true,
  vramPass: false,
  ssdPass: false,
  notes: [
    'Your GPU has less VRAM than this preset requires.',
    'An SSD is recommended for smoother asset streaming.',
  ],
};

const insufficientResult: CheckResponse = {
  state: 'insufficient',
  verdict: 'Insufficient data',
  sub: 'No performance data is available for this configuration.',
  source: null,
  provider: null,
  confidence: null,
  targetFps: 60,
  fps: null,
  gpuPass: null,
  cpuPass: null,
  ramPass: null,
  vramPass: null,
  ssdPass: null,
  notes: [],
};

const cardProps: ComponentProps<typeof HardwareCheckCard> = {
  gpuResults: [],
  isLoadingGpus: false,
  onGpuSearch: vi.fn(),
  onGpuSelect: vi.fn(),
  cpuResults: [],
  isLoadingCpus: false,
  onCpuSearch: vi.fn(),
  onCpuSelect: vi.fn(),
  selectedGpu: '1',
  selectedGpuName: 'GeForce RTX 4090',
  selectedCpu: '1',
  selectedCpuName: 'Intel Core i9-14900K',
  selectedRam: 16,
  onRamChange: vi.fn(),
  selectedStorage: 'ssd',
  onStorageChange: vi.fn(),
  selectedPreset: SettingPreset.HIGH,
  onPresetChange: vi.fn(),
  selectedTargetFps: 60,
  onTargetFpsChange: vi.fn(),
  selectedResolutionKey: '1920x1080',
  onResolutionKeyChange: vi.fn(),
  customWidth: 1920,
  onCustomWidthChange: vi.fn(),
  customHeight: 1080,
  onCustomHeightChange: vi.fn(),
  hasAttemptedSubmit: true,
  isChecking: false,
  checkResult: undefined,
  checkError: undefined,
  isFormValid: true,
  onCheck: vi.fn(),
};

describe('CompatibilityResult', () => {
  it.each([
    [measuredResult, 'Verified', 'Can run'],
    [
      { ...measuredResult, state: 'cant', verdict: "Can't run" },
      'Verified',
      "Can't run",
    ],
    [aiResult, 'AI', 'Likely can run'],
    [estimateResult, 'Estimate', "Likely can't run"],
  ] as const)(
    'shows the API provenance and verdict',
    (result, badge, verdict) => {
      render(
        <CompatibilityResult
          checkResult={result}
          resolutionLabel="1920x1080"
        />,
      );

      expect(screen.getByText(badge)).toBeInTheDocument();
      expect(screen.getByText(verdict)).toBeInTheDocument();
    },
  );

  it('shows the AI provider and selected target inside the FPS panel', () => {
    render(
      <CompatibilityResult
        checkResult={aiResult}
        resolutionLabel="1920x1080"
      />,
    );

    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText(/target: 90 fps/i)).toBeInTheDocument();
  });

  it('renders insufficient data without an FPS panel', () => {
    render(
      <CompatibilityResult
        checkResult={insufficientResult}
        resolutionLabel="1920x1080"
      />,
    );

    expect(screen.getByText('Insufficient data')).toBeInTheDocument();
    expect(screen.queryByText(/fps/i)).not.toBeInTheDocument();
  });

  it('renders VRAM failure and SSD advisory as separate notes', () => {
    render(
      <CompatibilityResult
        checkResult={estimateResult}
        resolutionLabel="1920x1080"
      />,
    );

    const notes = screen.getAllByRole('listitem');
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveTextContent(/VRAM/i);
    expect(notes[1]).toHaveTextContent(/SSD/i);
  });

  it('renders unknown hardware evidence without reporting a failure', () => {
    render(
      <CompatibilityResult
        checkResult={insufficientResult}
        resolutionLabel="1920x1080"
      />,
    );

    expect(screen.getAllByText('Not available')).toHaveLength(3);
    expect(screen.queryByText(/below req/i)).not.toBeInTheDocument();
  });
});

describe('HardwareCheckCard errors', () => {
  it.each([
    'Too many compatibility checks. Please wait a minute and try again.',
    'The compatibility check timed out. Please try again.',
    "We couldn't check compatibility. Please try again.",
  ])('announces a safe recovery message', (message) => {
    render(<HardwareCheckCard {...cardProps} checkError={message} />);

    expect(within(screen.getByRole('alert')).getByText(message)).toBeVisible();
  });
});

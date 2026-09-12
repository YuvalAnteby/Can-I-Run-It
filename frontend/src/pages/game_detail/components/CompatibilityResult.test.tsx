import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CheckResponse } from '../../../@types/check.types';
import { CompatibilityResult } from './CompatibilityResult';

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

describe('CompatibilityResult', () => {
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

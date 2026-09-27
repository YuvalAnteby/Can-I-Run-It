import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckRequest } from '../../@types/check.types';
import { useGameDetailForm } from './useGameDetailForm';

const { runCheck, resetCheck } = vi.hoisted(() => ({
  runCheck: vi.fn<(request: CheckRequest) => void>(),
  resetCheck: vi.fn(),
}));

vi.mock('./useHardwareCheck', () => ({
  useHardwareCheck: () => ({
    mutate: runCheck,
    data: undefined,
    isPending: false,
    error: null,
    reset: resetCheck,
  }),
}));

vi.mock('./useHardwareSearch', () => ({
  useCpuSearch: () => ({
    results: [
      {
        id: 1,
        slug: 'amd-ryzen-5-5600x',
        name: 'AMD Ryzen 5 5600X',
        manufacturer: 'AMD',
        tdpWatts: 65,
        releaseYear: 2020,
      },
    ],
    isLoading: false,
  }),
  useGpuSearch: () => ({
    results: [
      {
        id: 2,
        slug: 'nvidia-rtx-3080',
        name: 'NVIDIA GeForce RTX 3080',
        manufacturer: 'Nvidia',
        vramGb: 10,
        shadingUnits: 8704,
        tdpWatts: 320,
        releaseYear: 2020,
      },
    ],
    isLoading: false,
  }),
}));

describe('useGameDetailForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves hardware and clears the result when the requirements tier changes', () => {
    const { result, rerender } = renderHook(
      ({ tier }) => useGameDetailForm(undefined, 'cyberpunk-2077', tier),
      { initialProps: { tier: 'minimum' } },
    );
    act(() => {
      result.current.handleCpuSelect('1');
      result.current.handleGpuSelect('2');
    });
    resetCheck.mockClear();

    rerender({ tier: 'recommended' });

    expect(resetCheck).toHaveBeenCalledOnce();
    expect(result.current.selectedCpu).toBe('1');
    expect(result.current.selectedGpu).toBe('2');
    act(() => result.current.handleCheck());
    expect(runCheck.mock.calls[0][0].settings.tier).toBe('recommended');
  });

  it('checks compatibility with native rendering by default', () => {
    const { result } = renderHook(() =>
      useGameDetailForm(undefined, 'cyberpunk-2077'),
    );

    act(() => {
      result.current.handleCpuSelect('1');
      result.current.handleGpuSelect('2');
    });
    act(() => result.current.handleCheck());

    expect(runCheck).toHaveBeenCalledOnce();
    expect(runCheck.mock.calls[0][0].settings.upscaler).toBe('off');
  });
});

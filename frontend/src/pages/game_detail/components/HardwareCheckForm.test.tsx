import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SettingPreset } from '../../../@types/check.types';
import { HardwareCheckForm } from './HardwareCheckForm';

const completeFormProps: ComponentProps<typeof HardwareCheckForm> = {
  gpuResults: [],
  isLoadingGpus: false,
  onGpuSearch: vi.fn(),
  onGpuSelect: vi.fn(),
  selectedGpu: '',
  cpuResults: [],
  isLoadingCpus: false,
  onCpuSearch: vi.fn(),
  onCpuSelect: vi.fn(),
  selectedCpu: '',
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
  hasAttemptedSubmit: false,
  resolutions: [{ label: '1080p (Full HD)', width: 1920, height: 1080 }],
};

describe('HardwareCheckForm', () => {
  it('renders the five target FPS choices with 60 selected', () => {
    render(<HardwareCheckForm {...completeFormProps} />);

    const select = screen.getByRole('combobox', { name: /target fps/i });
    expect(select).toHaveValue('60');
    expect(within(select).getAllByRole('option')).toHaveLength(5);
  });

  it('reports a selected 90 FPS target', () => {
    const onTargetFpsChange = vi.fn();
    render(
      <HardwareCheckForm
        {...completeFormProps}
        onTargetFpsChange={onTargetFpsChange}
      />,
    );

    userEvent.selectOptions(
      screen.getByRole('combobox', { name: /target fps/i }),
      '90',
    );

    expect(onTargetFpsChange).toHaveBeenCalledWith(90);
  });
});

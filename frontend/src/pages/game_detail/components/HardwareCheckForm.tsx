import React from 'react';
import { SearchableSelect } from '../../../components/SearchableSelect/SearchableSelect';
import {
  SettingPreset,
  TARGET_FPS_VALUES,
  TargetFps,
} from '../../../@types/check.types';
import { ClientCpuDto } from '../../../@types/cpu.types';
import { ClientGpuDto } from '../../../@types/gpu.types';

interface HardwareCheckFormProps {
  gpuResults: ClientGpuDto[];
  isLoadingGpus: boolean;
  onGpuSearch: (query: string) => void;
  onGpuSelect: (id: string) => void;
  selectedGpu: string;
  selectedGpuName?: string;

  cpuResults: ClientCpuDto[];
  isLoadingCpus: boolean;
  onCpuSearch: (query: string) => void;
  onCpuSelect: (id: string) => void;
  selectedCpu: string;
  selectedCpuName?: string;

  selectedRam: number;
  onRamChange: (ram: number) => void;
  isRamValid: boolean;

  selectedStorage: string;
  onStorageChange: (storage: string) => void;

  selectedPreset: SettingPreset;
  onPresetChange: (preset: SettingPreset) => void;

  selectedTargetFps: TargetFps;
  onTargetFpsChange: (targetFps: TargetFps) => void;

  selectedResolutionKey: string;
  onResolutionKeyChange: (key: string) => void;

  customWidth: number;
  onCustomWidthChange: (width: number) => void;
  customHeight: number;
  onCustomHeightChange: (height: number) => void;

  hasAttemptedSubmit: boolean;
  resolutions: { label: string; width: number; height: number }[];
}

export const HardwareCheckForm: React.FC<HardwareCheckFormProps> = ({
  gpuResults,
  isLoadingGpus,
  onGpuSearch,
  onGpuSelect,
  selectedGpu,
  selectedGpuName,

  cpuResults,
  isLoadingCpus,
  onCpuSearch,
  onCpuSelect,
  selectedCpu,
  selectedCpuName,

  selectedRam,
  onRamChange,
  isRamValid,

  selectedStorage,
  onStorageChange,

  selectedPreset,
  onPresetChange,

  selectedTargetFps,
  onTargetFpsChange,

  selectedResolutionKey,
  onResolutionKeyChange,

  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,

  hasAttemptedSubmit,
  resolutions,
}) => {
  return (
    <>
      <SearchableSelect
        label="GPU"
        value={selectedGpu}
        selectedName={selectedGpuName}
        placeholder="Select your GPU..."
        options={gpuResults}
        isLoading={isLoadingGpus}
        onSearch={onGpuSearch}
        onSelect={onGpuSelect}
        error={hasAttemptedSubmit && !selectedGpu}
      />

      <SearchableSelect
        label="CPU"
        value={selectedCpu}
        selectedName={selectedCpuName}
        placeholder="Select your CPU..."
        options={cpuResults}
        isLoading={isLoadingCpus}
        onSearch={onCpuSearch}
        onSelect={onCpuSelect}
        error={hasAttemptedSubmit && !selectedCpu}
      />

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <label
            htmlFor="hw-ram"
            className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold"
          >
            RAM (GB)
          </label>
          <input
            id="hw-ram"
            type="number"
            className={`w-full bg-page border rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 font-medium ${
              isRamValid ? 'border-line' : 'border-red-500'
            }`}
            value={selectedRam || ''}
            onChange={(e) =>
              onRamChange(
                e.target.value === '' ? 0 : parseInt(e.target.value, 10),
              )
            }
            min="1"
            max="512"
            aria-invalid={!isRamValid}
            aria-describedby={isRamValid ? undefined : 'hw-ram-error'}
          />
          {!isRamValid && (
            <p id="hw-ram-error" className="mt-1 text-red-400 text-xs">
              Enter 1–512 GB
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="hw-storage"
            className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold"
          >
            Storage
          </label>
          <select
            id="hw-storage"
            className="w-full bg-page border border-line rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
            value={selectedStorage}
            onChange={(e) => onStorageChange(e.target.value)}
          >
            <option value="hdd">HDD</option>
            <option value="ssd">SSD</option>
          </select>
        </div>

        <div className="col-span-2">
          <label
            htmlFor="hw-preset"
            className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold"
          >
            Settings Preset
          </label>
          <select
            id="hw-preset"
            className="w-full bg-page border border-line rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
            value={selectedPreset}
            onChange={(e) => onPresetChange(e.target.value as SettingPreset)}
          >
            <option value={SettingPreset.LOW}>Low</option>
            <option value={SettingPreset.MEDIUM}>Medium</option>
            <option value={SettingPreset.HIGH}>High</option>
            <option value={SettingPreset.ULTRA}>Ultra</option>
          </select>
        </div>

        <div className="col-span-2">
          <label
            htmlFor="target-fps"
            className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold"
          >
            Target FPS
          </label>
          <select
            id="target-fps"
            className="w-full bg-page border border-line rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 appearance-none cursor-pointer font-medium"
            value={selectedTargetFps}
            onChange={(e) =>
              onTargetFpsChange(Number(e.target.value) as TargetFps)
            }
          >
            {TARGET_FPS_VALUES.map((targetFps) => (
              <option key={targetFps} value={targetFps}>
                {targetFps} FPS
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label
            htmlFor="hw-resolution"
            className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold"
          >
            Target Resolution
          </label>
          <select
            id="hw-resolution"
            className="w-full bg-page border border-line rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
            value={selectedResolutionKey}
            onChange={(e) => onResolutionKeyChange(e.target.value)}
          >
            {resolutions.map((res) => (
              <option
                key={`${res.width}x${res.height}`}
                value={`${res.width}x${res.height}`}
              >
                {res.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </div>

        {selectedResolutionKey === 'custom' && (
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="hw-width"
                className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold"
              >
                Width
              </label>
              <input
                id="hw-width"
                type="number"
                className="w-full bg-page border border-line rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 font-medium"
                value={customWidth}
                onChange={(e) =>
                  onCustomWidthChange(parseInt(e.target.value, 10) || 0)
                }
                min="1"
                max="7680"
              />
            </div>
            <div>
              <label
                htmlFor="hw-height"
                className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold"
              >
                Height
              </label>
              <input
                id="hw-height"
                type="number"
                className="w-full bg-page border border-line rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 font-medium"
                value={customHeight}
                onChange={(e) =>
                  onCustomHeightChange(parseInt(e.target.value, 10) || 0)
                }
                min="1"
                max="4320"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

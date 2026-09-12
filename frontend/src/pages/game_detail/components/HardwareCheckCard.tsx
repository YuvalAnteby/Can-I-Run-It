import React from 'react';
import { HardwareCheckForm } from './HardwareCheckForm';
import { CompatibilityResult } from './CompatibilityResult';
import {
  SettingPreset,
  CheckResponse,
  TargetFps,
} from '../../../@types/check.types';
import { ClientCpuDto } from '../../../@types/cpu.types';
import { ClientGpuDto } from '../../../@types/gpu.types';

const DEFAULT_RESOLUTIONS = [
  { label: '720p (HD)', width: 1280, height: 720 },
  { label: '1080p (Full HD)', width: 1920, height: 1080 },
  { label: '1440p (QHD)', width: 2560, height: 1440 },
  { label: '2160p (4K)', width: 3840, height: 2160 },
];

interface HardwareCheckCardProps {
  // Search
  gpuResults: ClientGpuDto[];
  isLoadingGpus: boolean;
  onGpuSearch: (query: string) => void;
  onGpuSelect: (id: string) => void;

  cpuResults: ClientCpuDto[];
  isLoadingCpus: boolean;
  onCpuSearch: (query: string) => void;
  onCpuSelect: (id: string) => void;

  // Selection
  selectedGpu: string;
  selectedGpuName?: string;
  selectedCpu: string;
  selectedCpuName?: string;
  selectedRam: number;
  onRamChange: (ram: number) => void;
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

  // Status
  hasAttemptedSubmit: boolean;
  isChecking: boolean;
  checkResult: CheckResponse | undefined;
  checkError: string | undefined;
  isFormValid: boolean;

  // Handlers
  onCheck: () => void;
}

export const HardwareCheckCard: React.FC<HardwareCheckCardProps> = ({
  gpuResults,
  isLoadingGpus,
  onGpuSearch,
  onGpuSelect,
  cpuResults,
  isLoadingCpus,
  onCpuSearch,
  onCpuSelect,
  selectedGpu,
  selectedGpuName,
  selectedCpu,
  selectedCpuName,
  selectedRam,
  onRamChange,
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
  isChecking,
  checkResult,
  checkError,
  isFormValid,
  onCheck,
}) => {
  const resolutionLabel =
    selectedResolutionKey === 'custom'
      ? `${customWidth}x${customHeight}`
      : selectedResolutionKey;

  return (
    <div className="bg-[#13131a] border border-[#1e1e2a] rounded-xl p-6 sticky top-[72px]">
      <div className="text-base font-bold mb-1 text-white">
        Can Your PC Run It?
      </div>
      <div className="text-xs text-gray-400 mb-6 font-medium">
        Pick your hardware and find out instantly.
      </div>

      <HardwareCheckForm
        gpuResults={gpuResults}
        isLoadingGpus={isLoadingGpus}
        onGpuSearch={onGpuSearch}
        onGpuSelect={onGpuSelect}
        selectedGpu={selectedGpu}
        selectedGpuName={selectedGpuName}
        cpuResults={cpuResults}
        isLoadingCpus={isLoadingCpus}
        onCpuSearch={onCpuSearch}
        onCpuSelect={onCpuSelect}
        selectedCpu={selectedCpu}
        selectedCpuName={selectedCpuName}
        selectedRam={selectedRam}
        onRamChange={onRamChange}
        selectedStorage={selectedStorage}
        onStorageChange={onStorageChange}
        selectedPreset={selectedPreset}
        onPresetChange={onPresetChange}
        selectedTargetFps={selectedTargetFps}
        onTargetFpsChange={onTargetFpsChange}
        selectedResolutionKey={selectedResolutionKey}
        onResolutionKeyChange={onResolutionKeyChange}
        customWidth={customWidth}
        onCustomWidthChange={onCustomWidthChange}
        customHeight={customHeight}
        onCustomHeightChange={onCustomHeightChange}
        hasAttemptedSubmit={hasAttemptedSubmit}
        resolutions={DEFAULT_RESOLUTIONS}
      />

      <button
        onClick={onCheck}
        disabled={isChecking}
        className={`w-full py-3 text-white border-none rounded-md text-sm font-bold cursor-pointer transition-all mt-2 active:scale-[0.98] ${
          isChecking
            ? 'bg-blue-800 cursor-not-allowed opacity-70'
            : isFormValid
              ? 'bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20'
              : 'bg-[#2a2a3a] text-gray-500 cursor-not-allowed'
        }`}
      >
        {isChecking ? 'Checking...' : 'Check Compatibility'}
      </button>

      {checkError && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {checkError}
        </p>
      )}

      {checkResult && (
        <CompatibilityResult
          checkResult={checkResult}
          resolutionLabel={resolutionLabel}
        />
      )}
    </div>
  );
};

import React from 'react';
import { HardwareCheckForm } from './HardwareCheckForm';
import { CompatibilityResult } from './CompatibilityResult';
import type { ClientGameDto } from '../../../@types/game.types';
import { useGameDetailForm } from '../useGameDetailForm';

const DEFAULT_RESOLUTIONS = [
  { label: '720p (HD)', width: 1280, height: 720 },
  { label: '1080p (Full HD)', width: 1920, height: 1080 },
  { label: '1440p (QHD)', width: 2560, height: 1440 },
  { label: '2160p (4K)', width: 3840, height: 2160 },
];

interface HardwareCheckCardProps {
  game: ClientGameDto;
  slug: string | undefined;
  activeTier?: string;
}

export const HardwareCheckCard: React.FC<HardwareCheckCardProps> = ({
  game,
  slug,
  activeTier,
}) => {
  const form = useGameDetailForm(game, slug, activeTier);
  const resolutionLabel =
    form.selectedResolutionKey === 'custom'
      ? `${form.customWidth}x${form.customHeight}`
      : form.selectedResolutionKey;

  return (
    <div className="bg-[#13131a] border border-[#1e1e2a] rounded-xl p-6 sticky top-[72px]">
      <div className="text-base font-bold mb-1 text-white">
        Can Your PC Run It?
      </div>
      <div className="text-xs text-gray-400 mb-6 font-medium">
        Pick your hardware and find out instantly.
      </div>

      <HardwareCheckForm
        gpuResults={form.gpuResults}
        isLoadingGpus={form.isLoadingGpus}
        onGpuSearch={form.setGpuQuery}
        onGpuSelect={form.handleGpuSelect}
        selectedGpu={form.selectedGpu}
        selectedGpuName={form.selectedGpuObj?.name}
        cpuResults={form.cpuResults}
        isLoadingCpus={form.isLoadingCpus}
        onCpuSearch={form.setCpuQuery}
        onCpuSelect={form.handleCpuSelect}
        selectedCpu={form.selectedCpu}
        selectedCpuName={form.selectedCpuObj?.name}
        selectedRam={form.selectedRam}
        onRamChange={form.setSelectedRam}
        selectedStorage={form.selectedStorage}
        onStorageChange={form.setSelectedStorage}
        selectedPreset={form.selectedPreset}
        onPresetChange={form.setSelectedPreset}
        selectedTargetFps={form.selectedTargetFps}
        onTargetFpsChange={form.setSelectedTargetFps}
        selectedResolutionKey={form.selectedResolutionKey}
        onResolutionKeyChange={form.setSelectedResolutionKey}
        customWidth={form.customWidth}
        onCustomWidthChange={form.setCustomWidth}
        customHeight={form.customHeight}
        onCustomHeightChange={form.setCustomHeight}
        hasAttemptedSubmit={form.hasAttemptedSubmit}
        resolutions={DEFAULT_RESOLUTIONS}
      />

      <button
        onClick={form.handleCheck}
        disabled={form.isChecking}
        className={`w-full py-3 text-white border-none rounded-md text-sm font-bold cursor-pointer transition-all mt-2 active:scale-[0.98] ${
          form.isChecking
            ? 'bg-blue-800 cursor-not-allowed opacity-70'
            : form.isFormValid
              ? 'bg-blue-500 hover:bg-blue-600 shadow-lg shadow-blue-500/20'
              : 'bg-[#2a2a3a] text-gray-500 cursor-not-allowed'
        }`}
      >
        {form.isChecking ? 'Checking...' : 'Check Compatibility'}
      </button>

      {form.checkError && (
        <p
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-md bg-red-500/10 p-3 text-sm text-red-300"
        >
          {form.checkError}
        </p>
      )}

      {form.checkResult && (
        <CompatibilityResult
          checkResult={form.checkResult}
          resolutionLabel={resolutionLabel}
        />
      )}
    </div>
  );
};

import { useState, useEffect } from 'react';
import { useCpuSearch, useGpuSearch } from './useHardwareSearch';
import { useHardwareCheck } from './useHardwareCheck';
import { ClientCpuDto } from '../../@types/cpu.types';
import { ClientGpuDto } from '../../@types/gpu.types';
import { SettingPreset, TargetFps } from '../../@types/check.types';
import { ClientGameDto } from '../../@types/game.types';

// Mirror the backend check DTO bounds (hardware.dto.ts / settings.dto.ts).
export const RAM_MIN_GB = 4;
export const RAM_MAX_GB = 128;
export const RESOLUTION_MAX = 16384;

const isValidDimension = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= RESOLUTION_MAX;

export function useGameDetailForm(
  game: ClientGameDto | undefined,
  slug: string | undefined,
  activeTier?: string,
) {
  // Search state for hardware dropdowns
  const [gpuQuery, setGpuQuery] = useState('');
  const [cpuQuery, setCpuQuery] = useState('');

  const { results: gpuResults, isLoading: isLoadingGpus } =
    useGpuSearch(gpuQuery);
  const { results: cpuResults, isLoading: isLoadingCpus } =
    useCpuSearch(cpuQuery);

  // User hardware selections
  const [selectedGpu, setSelectedGpu] = useState<string>('');
  const [selectedCpu, setSelectedCpu] = useState<string>('');
  const [selectedGpuObj, setSelectedGpuObj] = useState<ClientGpuDto | null>(
    null,
  );
  const [selectedCpuObj, setSelectedCpuObj] = useState<ClientCpuDto | null>(
    null,
  );

  // TODO: Remember the last picked GPU/CPU/RAM in localStorage so returning users skip re-entering their rig (no accounts needed).
  const [selectedRam, setSelectedRam] = useState<number>(16);
  const [selectedStorage, setSelectedStorage] = useState<string>('ssd');
  const [selectedResolutionKey, setSelectedResolutionKey] =
    useState<string>('1920x1080');
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [selectedPreset, setSelectedPreset] = useState<SettingPreset>(
    SettingPreset.HIGH,
  );
  const [selectedTargetFps, setSelectedTargetFps] = useState<TargetFps>(60);

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const {
    mutate: runCheck,
    data: checkResult,
    isPending: isChecking,
    error: checkError,
    reset: resetCheck,
  } = useHardwareCheck(
    game
      ? {
          gameId: game.id,
          status: game.status,
          slug,
        }
      : undefined,
  );

  // A different requirements tier invalidates the previous compatibility result.
  useEffect(() => {
    resetCheck();
  }, [activeTier, resetCheck]);

  const isRamValid =
    Number.isInteger(selectedRam) &&
    selectedRam >= RAM_MIN_GB &&
    selectedRam <= RAM_MAX_GB;
  const isResolutionValid =
    selectedResolutionKey !== 'custom' ||
    (isValidDimension(customWidth) && isValidDimension(customHeight));
  const isFormValid =
    !!selectedGpu && !!selectedCpu && isRamValid && isResolutionValid;

  const handleCheck = () => {
    setHasAttemptedSubmit(true);

    const isPending = game?.status === 'pending_approval';
    if (!isFormValid || (!slug && !isPending)) {
      return;
    }

    let width: number;
    let height: number;

    if (selectedResolutionKey === 'custom') {
      width = customWidth;
      height = customHeight;
    } else {
      const [w, h] = selectedResolutionKey.split('x').map(Number);
      width = w;
      height = h;
    }

    runCheck({
      ...(isPending ? {} : { gameSlug: slug }),
      hardware: {
        gpuId: parseInt(selectedGpu, 10),
        cpuId: parseInt(selectedCpu, 10),
        ramGb: selectedRam,
        isSsd: selectedStorage === 'ssd',
      },
      settings: {
        resolutionWidth: width,
        resolutionHeight: height,
        tier: activeTier ?? undefined,
        preset: selectedPreset,
        targetFps: selectedTargetFps,
        upscaler: 'off',
      },
    });
  };

  const handleGpuSelect = (id: string) => {
    setSelectedGpu(id);
    const obj = gpuResults.find((g) => g.id.toString() === id);
    if (obj) setSelectedGpuObj(obj);
    resetCheck();
  };

  const handleCpuSelect = (id: string) => {
    setSelectedCpu(id);
    const obj = cpuResults.find((c) => c.id.toString() === id);
    if (obj) setSelectedCpuObj(obj);
    resetCheck();
  };

  const handleRamChange = (ram: number) => {
    setSelectedRam(ram);
    resetCheck();
  };

  const handleStorageChange = (storage: string) => {
    setSelectedStorage(storage);
    resetCheck();
  };

  const handleResolutionKeyChange = (key: string) => {
    setSelectedResolutionKey(key);
    resetCheck();
  };

  const handleCustomWidthChange = (width: number) => {
    setCustomWidth(width);
    resetCheck();
  };

  const handleCustomHeightChange = (height: number) => {
    setCustomHeight(height);
    resetCheck();
  };

  const handlePresetChange = (preset: SettingPreset) => {
    setSelectedPreset(preset);
    resetCheck();
  };

  const handleTargetFpsChange = (targetFps: TargetFps) => {
    setSelectedTargetFps(targetFps);
    resetCheck();
  };

  return {
    // Search
    setGpuQuery,
    setCpuQuery,
    gpuResults,
    isLoadingGpus,
    cpuResults,
    isLoadingCpus,

    // Selection
    selectedGpu,
    selectedCpu,
    selectedGpuObj,
    selectedCpuObj,
    selectedRam,
    setSelectedRam: handleRamChange,
    selectedStorage,
    setSelectedStorage: handleStorageChange,
    selectedResolutionKey,
    setSelectedResolutionKey: handleResolutionKeyChange,
    customWidth,
    setCustomWidth: handleCustomWidthChange,
    customHeight,
    setCustomHeight: handleCustomHeightChange,
    selectedPreset,
    setSelectedPreset: handlePresetChange,
    selectedTargetFps,
    setSelectedTargetFps: handleTargetFpsChange,

    // Status
    hasAttemptedSubmit,
    isChecking,
    checkResult,
    checkError: checkError?.message,
    isRamValid,
    isFormValid,

    // Handlers
    handleCheck,
    handleGpuSelect,
    handleCpuSelect,
  };
}

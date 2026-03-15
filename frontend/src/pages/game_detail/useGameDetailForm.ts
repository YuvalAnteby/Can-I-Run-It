import { useState, useMemo, useEffect } from 'react';
import { useCpuSearch, useGpuSearch } from './useHardwareSearch';
import { useHardwareCheck } from './useHardwareCheck';
import { ClientCpuDto } from '../../@types/cpu.types';
import { ClientGpuDto } from '../../@types/gpu.types';
import { SettingPreset } from '../../@types/check.types';
import { ClientGameDto } from '../../@types/game.types';

export function useGameDetailForm(
  game: ClientGameDto | undefined,
  slug: string | undefined,
) {
  // Search state for hardware dropdowns
  const [gpuQuery, setGpuQuery] = useState('');
  const [cpuQuery, setCpuQuery] = useState('');

  const { results: gpuResults, isLoading: isLoadingGpus } =
    useGpuSearch(gpuQuery);
  const { results: cpuResults, isLoading: isLoadingCpus } =
    useCpuSearch(cpuQuery);

  const [activeTier, setActiveTier] = useState<string | null>(null);

  // User hardware selections
  const [selectedGpu, setSelectedGpu] = useState<string>('');
  const [selectedCpu, setSelectedCpu] = useState<string>('');
  const [selectedGpuObj, setSelectedGpuObj] = useState<ClientGpuDto | null>(
    null,
  );
  const [selectedCpuObj, setSelectedCpuObj] = useState<ClientCpuDto | null>(
    null,
  );

  const [selectedRam, setSelectedRam] = useState<number>(16);
  const [selectedStorage, setSelectedStorage] = useState<string>('ssd');
  const [selectedResolutionKey, setSelectedResolutionKey] =
    useState<string>('1920x1080');
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [selectedPreset, setSelectedPreset] = useState<SettingPreset>(
    SettingPreset.HIGH,
  );

  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const {
    mutate: runCheck,
    data: checkResult,
    isPending: isChecking,
    reset: resetCheck,
  } = useHardwareCheck();

  // Initialize active tier (e.g., "minimum") when game data first arrives
  useEffect(() => {
    if (game?.requirements?.length && !activeTier) {
      setActiveTier(game.requirements[0].tier);
    }
  }, [game, activeTier]);

  // Derived state for the currently viewed requirement tier (tabs)
  const currentReq = useMemo(() => {
    return (
      game?.requirements?.find((r) => r.tier === activeTier) ||
      game?.requirements?.[0]
    );
  }, [game, activeTier]);

  const handleCheck = () => {
    setHasAttemptedSubmit(true);

    if (!selectedGpu || !selectedCpu || !slug || !activeTier) {
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
      gameSlug: slug,
      hardware: {
        gpuId: parseInt(selectedGpu, 10),
        cpuId: parseInt(selectedCpu, 10),
        ramGb: selectedRam,
        isSsd: selectedStorage === 'ssd',
      },
      settings: {
        resolutionWidth: width,
        resolutionHeight: height,
        tier: activeTier,
        preset: selectedPreset,
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

  const handleActiveTierChange = (tier: string) => {
    setActiveTier(tier);
    resetCheck();
  };

  const isFormValid = !!selectedGpu && !!selectedCpu;

  return {
    // Search
    gpuQuery,
    setGpuQuery,
    cpuQuery,
    setCpuQuery,
    gpuResults,
    isLoadingGpus,
    cpuResults,
    isLoadingCpus,

    // Tier
    activeTier,
    setActiveTier: handleActiveTierChange,
    currentReq,

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

    // Status
    hasAttemptedSubmit,
    isChecking,
    checkResult,
    isFormValid,

    // Handlers
    handleCheck,
    handleGpuSelect,
    handleCpuSelect,
    resetCheck,
  };
}

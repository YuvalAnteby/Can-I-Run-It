import React from 'react';
import { useParams } from 'react-router-dom';
import { useGameDetail } from './useGameDetail';
import { useGameDetailForm } from './useGameDetailForm';
import GameHero from './components/GameHero';
import { RequirementsGrid } from './components/RequirementsGrid';
import { TechFeatures } from './components/TechFeatures';
import { HardwareCheckCard } from './components/HardwareCheckCard';

export default function GameDetailPage(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();
  const { data: game, isLoading, isError } = useGameDetail(slug);

  const {
    // Search
    gpuResults,
    isLoadingGpus,
    setGpuQuery,
    cpuResults,
    isLoadingCpus,
    setCpuQuery,

    // Tier
    activeTier,
    setActiveTier,
    currentReq,

    // Selection
    selectedGpu,
    selectedCpu,
    selectedGpuObj,
    selectedCpuObj,
    selectedRam,
    setSelectedRam,
    selectedStorage,
    setSelectedStorage,
    selectedResolutionKey,
    setSelectedResolutionKey,
    customWidth,
    setCustomWidth,
    customHeight,
    setCustomHeight,
    selectedPreset,
    setSelectedPreset,
    selectedTargetFps,
    setSelectedTargetFps,

    // Status
    hasAttemptedSubmit,
    isChecking,
    checkResult,
    checkError,
    isFormValid,

    // Handlers
    handleCheck,
    handleGpuSelect,
    handleCpuSelect,
  } = useGameDetailForm(game, slug);
  if (isLoading)
    return (
      <div className="text-center py-20 text-gray-300">
        Loading game details...
      </div>
    );
  if (isError || !game)
    return (
      <div className="text-center py-20 text-red-400 font-medium">
        Failed to load game.
      </div>
    );

  return (
    <div className="bg-[#0f0f13] text-[#e8e8e8] min-h-screen font-sans pb-20">
      {/* 1. HERO SECTION: Banner image, Cover art, and primary game metadata */}
      <GameHero game={game} />

      {/* 2. MAIN CONTENT: Layout grid for requirements and check card */}
      <div className="max-w-[1100px] mx-auto px-8 pt-8 grid grid-cols-1 md:grid-cols-[1fr_340px] gap-8 items-start">
        {/* LEFT COLUMN: Requirements tabs and detailed tech specs */}
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-gray-400 mb-4 pb-2 border-b border-[#1e1e2a] font-semibold">
            System Requirements
          </p>

          {game.requirements && game.requirements.length > 0 ? (
            <>
              {/* Tab navigation for different requirement tiers (min, rec, ultra) */}
              <div className="flex gap-1 mb-5 overflow-x-auto">
                {game.requirements.map((req) => (
                  <button
                    key={req.tier}
                    onClick={() => setActiveTier(req.tier)}
                    className={`cursor-pointer px-4 py-1.5 rounded-md text-sm border transition-colors whitespace-nowrap ${
                      activeTier === req.tier
                        ? 'bg-[#1e1e2a] text-white border-[#3a3a4a] font-medium'
                        : 'bg-transparent text-gray-400 border-[#2a2a3a] hover:text-gray-200'
                    }`}
                  >
                    {req.tier.charAt(0).toUpperCase() + req.tier.slice(1)}
                  </button>
                ))}
              </div>

              {/* Grid showing specific hardware needs for the selected tier */}
              <RequirementsGrid currentReq={currentReq} />
            </>
          ) : (
            <p className="text-sm text-gray-400 font-medium">
              No system requirements available for this game.
            </p>
          )}

          {/* TECH FEATURES: ray tracing, dlss, fsr support flags */}
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-gray-400 mt-8 mb-4 pb-2 border-b border-[#1e1e2a] font-semibold">
            Tech Features
          </p>
          <TechFeatures game={game} />
        </div>

        {/* RIGHT COLUMN: Interactive Hardware Check Card */}
        <HardwareCheckCard
          gpuResults={gpuResults}
          isLoadingGpus={isLoadingGpus}
          onGpuSearch={setGpuQuery}
          onGpuSelect={handleGpuSelect}
          cpuResults={cpuResults}
          isLoadingCpus={isLoadingCpus}
          onCpuSearch={setCpuQuery}
          onCpuSelect={handleCpuSelect}
          selectedGpu={selectedGpu}
          selectedGpuName={selectedGpuObj?.name}
          selectedCpu={selectedCpu}
          selectedCpuName={selectedCpuObj?.name}
          selectedRam={selectedRam}
          onRamChange={setSelectedRam}
          selectedStorage={selectedStorage}
          onStorageChange={setSelectedStorage}
          selectedPreset={selectedPreset}
          onPresetChange={setSelectedPreset}
          selectedTargetFps={selectedTargetFps}
          onTargetFpsChange={setSelectedTargetFps}
          selectedResolutionKey={selectedResolutionKey}
          onResolutionKeyChange={setSelectedResolutionKey}
          customWidth={customWidth}
          onCustomWidthChange={setCustomWidth}
          customHeight={customHeight}
          onCustomHeightChange={setCustomHeight}
          hasAttemptedSubmit={hasAttemptedSubmit}
          isChecking={isChecking}
          checkResult={checkResult}
          checkError={checkError}
          isFormValid={isFormValid}
          onCheck={handleCheck}
        />
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGameDetail } from './useGameDetail';
import { useCpuSearch, useGpuSearch } from './useHardwareSearch';
import { ClientCpuDto } from '../../@types/cpu.types';
import { ClientGpuDto } from '../../@types/gpu.types';
import { SearchableSelect } from '../../components/SearchableSelect/SearchableSelect';

// Fallback scoring for when benchmarks are missing from the DB.
// These scores are normalized relative to a high-end reference (e.g., RTX 4090 = 100).
const fallbackGpuScore: Record<string, number> = {
  'nvidia-geforce-rtx-4090': 100,
  'nvidia-geforce-rtx-4080': 80,
  'nvidia-geforce-rtx-4070': 62,
  'nvidia-geforce-rtx-3080': 58,
  'nvidia-geforce-rtx-3070': 48,
  'nvidia-geforce-rtx-3060': 34,
  'nvidia-geforce-rtx-2080-ti': 52,
  'nvidia-geforce-gtx-1080-ti': 30,
  'nvidia-geforce-gtx-1060': 14,
};

const fallbackCpuScore: Record<string, number> = {
  'intel-core-i9-13900k': 100,
  'intel-core-i7-13700k': 85,
  'intel-core-i5-13600k': 72,
  'amd-ryzen-9-7950x3d': 98,
  'amd-ryzen-7-7800x3d': 88,
  'amd-ryzen-5-5600x': 60,
  'intel-core-i5-12400f': 65,
  'intel-core-i5-10400f': 45,
};

export default function GameDetailPage(): React.ReactElement {
  const { slug } = useParams<{ slug: string }>();
  const { data: game, isLoading, isError } = useGameDetail(slug);

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
  const [hasChecked, setHasChecked] = useState(false);

  // Initialize active tier (e.g., "minimum") when game data first arrives
  React.useEffect(() => {
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
    if (!selectedGpu || !selectedCpu) {
      alert('Please select both a GPU and CPU.');
      return;
    }
    setHasChecked(true);
  };

  /**
   * Normalizes hardware performance into a 0-100 scale.
   * Prioritizes dynamic database benchmarks over static fallbacks.
   */
  const getHardwareScore = (
    hw: ClientCpuDto | ClientGpuDto | null | undefined,
    type: 'cpu' | 'gpu',
  ): number => {
    if (!hw) return 0;

    // Attempt to use db benchmarks if available
    if (hw.benchmarks) {
      if (type === 'gpu' && hw.benchmarks['3dmark-time-spy']) {
        // Normalize 3DMark Time Spy scores against a 4090 reference (~26,000)
        return hw.benchmarks['3dmark-time-spy'] / 260;
      }
      if (type === 'cpu' && hw.benchmarks['passmark']) {
        // Normalize Passmark scores against a 13900k reference (~60,000)
        return hw.benchmarks['passmark'] / 600;
      }
    }

    // Fallback to static dictionary if benchmarks are missing
    const map = type === 'gpu' ? fallbackGpuScore : fallbackCpuScore;
    return map[hw.slug] || 30; // Default average score if unknown
  };

  /**
   * Core logic for calculating compatibility and performance estimates.
   * Compares user selection vs current active requirements tier.
   */
  const checkResult = useMemo(() => {
    if (!hasChecked || !currentReq) return null;

    const userGpu = selectedGpuObj;
    const userCpu = selectedCpuObj;

    const userGpuScore = getHardwareScore(userGpu, 'gpu');
    const userCpuScore = getHardwareScore(userCpu, 'cpu');
    const reqGpuScore = getHardwareScore(currentReq.gpu, 'gpu');
    const reqCpuScore = getHardwareScore(currentReq.cpu, 'cpu');

    // Basic pass/fail check with a 10% margin of error for optimization variations
    const gpuPass = userGpuScore >= reqGpuScore * 0.9;
    const cpuPass = userCpuScore >= reqCpuScore * 0.9;
    const ramPass = selectedRam >= currentReq.ramGb;

    const canRunMin = gpuPass && cpuPass && ramPass;

    // "Recommended" status requires significant overhead (50%+) beyond the tier baseline
    const canRunRec =
      userGpuScore >= reqGpuScore * 1.5 &&
      userCpuScore >= reqCpuScore * 1.5 &&
      selectedRam >= currentReq.ramGb * 1.5;

    let state: 'cant' | 'barely' | 'can';
    let verdict;
    let sub;

    if (!canRunMin) {
      state = 'cant';
      verdict = "Won't run smoothly";
      sub = !ramPass
        ? 'Insufficient RAM'
        : !gpuPass
          ? 'GPU below requirement'
          : 'CPU below requirement';
    } else if (!canRunRec) {
      state = 'barely';
      verdict = 'Meets requirements';
      sub = `Expect ~${currentReq.targetFps}fps at ${currentReq.resolutionHeight}p`;
    } else if (userGpuScore >= 80) {
      state = 'can';
      verdict = 'Runs great';
      sub = 'Exceeds recommended requirements';
    } else {
      state = 'can';
      verdict = 'Runs well';
      sub = 'Meets recommended requirements';
    }

    /**
     * Heuristic-based FPS estimation based on normalized GPU performance tiers.
     */
    const estimateFPS = (score: number) => ({
      low: Math.round(score * 1.05 + 2),
      med: Math.round(score * 0.8),
      high: Math.round(score * 0.62),
      ultra: Math.round(score * 0.46),
    });

    return {
      state,
      verdict,
      sub,
      gpuPass,
      cpuPass,
      ramPass,
      fps: estimateFPS(userGpuScore),
    };
  }, [hasChecked, currentReq, selectedGpuObj, selectedCpuObj, selectedRam]);

  const handleGpuSelect = (id: string) => {
    setSelectedGpu(id);
    const obj = gpuResults.find((g) => g.id.toString() === id);
    if (obj) setSelectedGpuObj(obj);
    setHasChecked(false);
  };

  const handleCpuSelect = (id: string) => {
    setSelectedCpu(id);
    const obj = cpuResults.find((c) => c.id.toString() === id);
    if (obj) setSelectedCpuObj(obj);
    setHasChecked(false);
  };

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
      <div className="relative h-[420px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${game.coverImageUrl || 'https://via.placeholder.com/1200x600?text=No+Cover'})`,
            filter: 'brightness(0.35)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, rgba(15,15,19,0.95) 35%, rgba(15,15,19,0.2) 100%), linear-gradient(to top, #0f0f13 0%, transparent 40%)',
          }}
        />
        <div className="relative h-full flex items-end p-8 pb-10 gap-8 max-w-[1100px] mx-auto">
          <img
            className="w-[130px] h-[175px] rounded-lg object-cover border-2 border-[#2a2a3a] shrink-0"
            src={game.coverImageUrl || 'https://via.placeholder.com/130x175'}
            alt={game.name}
          />
          <div className="flex-1">
            <div className="flex gap-2 mb-3 flex-wrap">
              {game.genre && (
                <span className="text-[0.7rem] px-2.5 py-1 rounded-full bg-[#1e1e2a] text-gray-300 border border-[#2a2a3a] uppercase tracking-wider font-medium">
                  {game.genre}
                </span>
              )}
            </div>
            <h1 className="text-4xl font-extrabold leading-tight mb-2 tracking-tight">
              {game.name}
            </h1>
            <p className="text-gray-400 text-sm mb-4">
              <strong className="text-gray-300">
                {game.publisher || game.developer}
              </strong>{' '}
              &nbsp;&middot;&nbsp; {game.releaseDate}
            </p>
            <p className="text-gray-300 text-sm leading-relaxed max-w-lg line-clamp-3">
              {game.description}
            </p>
          </div>
        </div>
      </div>

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
              {currentReq && (
                <div className="grid grid-cols-2 gap-[1px] bg-[#1e1e2a] rounded-lg overflow-hidden border border-[#1e1e2a]">
                  <div className="bg-[#0f0f13] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      Target
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      {currentReq.targetFps}fps @ {currentReq.resolutionWidth}x
                      {currentReq.resolutionHeight}
                    </div>
                  </div>
                  <div className="bg-[#0f0f13] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      OS
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      Windows 10/11
                    </div>
                  </div>
                  <div className="bg-[#13131a] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      CPU
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      {currentReq.cpu?.name || 'N/A'}
                    </div>
                  </div>
                  <div className="bg-[#13131a] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      GPU
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      {currentReq.gpu?.name || 'N/A'}
                    </div>
                  </div>
                  <div className="bg-[#13131a] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      RAM
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      {currentReq.ramGb} GB
                    </div>
                  </div>
                  <div className="bg-[#13131a] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      VRAM
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      {currentReq.vramGb || 'N/A'} GB
                    </div>
                  </div>
                  <div className="bg-[#13131a] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      Storage
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      {currentReq.storageGb || 'N/A'} GB
                    </div>
                  </div>
                  <div className="bg-[#13131a] p-3.5">
                    <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                      SSD Required
                    </div>
                    <div className="text-sm text-gray-200 font-medium">
                      {currentReq.requiresSsd ? 'Yes' : 'No'}
                    </div>
                  </div>
                  {currentReq.notes && (
                    <div className="bg-[#13131a] p-3.5 col-span-2">
                      <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
                        Notes
                      </div>
                      <div className="text-[0.82rem] text-gray-300 font-normal">
                        {currentReq.notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
          <div className="grid grid-cols-2 gap-2 mb-8">
            <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${game.supportsRayTracing ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
              />
              <span className="text-xs text-gray-300 font-medium">
                Ray Tracing
              </span>
            </div>
            <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${game.supportsDlss ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
              />
              <span className="text-xs text-gray-300 font-medium">
                DLSS (Nvidia)
              </span>
            </div>
            <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${game.supportsFsr ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
              />
              <span className="text-xs text-gray-300 font-medium">
                FSR (AMD)
              </span>
            </div>
            <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${game.supportsXeSS ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
              />
              <span className="text-xs text-gray-300 font-medium">
                XeSS (Intel)
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Hardware Check Card */}
        <div>
          <div className="bg-[#13131a] border border-[#1e1e2a] rounded-xl p-6 sticky top-[72px]">
            <div className="text-base font-bold mb-1 text-white">
              Can Your PC Run It?
            </div>
            <div className="text-xs text-gray-400 mb-6 font-medium">
              Pick your hardware and find out instantly.
            </div>

            {/* HARDWARE SELECTORS (GPU/CPU) */}
            <SearchableSelect
              label="GPU"
              value={selectedGpu}
              selectedName={selectedGpuObj?.name}
              placeholder="Select your GPU..."
              options={gpuResults}
              isLoading={isLoadingGpus}
              onSearch={setGpuQuery}
              onSelect={handleGpuSelect}
            />

            <SearchableSelect
              label="CPU"
              value={selectedCpu}
              selectedName={selectedCpuObj?.name}
              placeholder="Select your CPU..."
              options={cpuResults}
              isLoading={isLoadingCpus}
              onSearch={setCpuQuery}
              onSelect={handleCpuSelect}
            />

            {/* RAM & STORAGE DROPDOWNS */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                  RAM (GB)
                </label>
                <select
                  className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
                  value={selectedRam}
                  onChange={(e) => {
                    setSelectedRam(parseInt(e.target.value, 10));
                    setHasChecked(false);
                  }}
                >
                  <option value="8">8 GB</option>
                  <option value="16">16 GB</option>
                  <option value="32">32 GB</option>
                  <option value="64">64 GB</option>
                </select>
              </div>
              <div>
                <label className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                  Storage
                </label>
                <select
                  className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
                  value={selectedStorage}
                  onChange={(e) => {
                    setSelectedStorage(e.target.value);
                    setHasChecked(false);
                  }}
                >
                  <option value="hdd">HDD</option>
                  <option value="ssd">SSD</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleCheck}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white border-none rounded-md text-sm font-bold cursor-pointer transition-colors mt-2 active:scale-[0.98]"
            >
              Check Compatibility
            </button>

            {/* RESULTS PANEL: Pass/Fail verdict and FPS progress bars */}
            {checkResult && (
              <div className="mt-5 rounded-lg overflow-hidden border border-[#1e1e2a] block">
                <div
                  className={`p-3.5 flex items-center gap-2.5 border-b ${
                    checkResult.state === 'cant'
                      ? 'bg-red-500/10 border-red-500/20'
                      : checkResult.state === 'barely'
                        ? 'bg-orange-500/10 border-orange-500/20'
                        : 'bg-green-500/10 border-green-500/20'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${
                      checkResult.state === 'cant'
                        ? 'bg-red-500/20 text-red-500'
                        : checkResult.state === 'barely'
                          ? 'bg-orange-500/20 text-orange-500'
                          : 'bg-green-500/20 text-green-500'
                    }`}
                  >
                    {checkResult.state === 'cant'
                      ? '✕'
                      : checkResult.state === 'barely'
                        ? '!'
                        : '✓'}
                  </div>
                  <div>
                    <div
                      className={`text-sm font-bold ${
                        checkResult.state === 'cant'
                          ? 'text-red-500'
                          : checkResult.state === 'barely'
                            ? 'text-orange-500'
                            : 'text-green-500'
                      }`}
                    >
                      {checkResult.verdict}
                    </div>
                    <div className="text-[0.7rem] text-gray-300 mt-0.5 font-medium">
                      {checkResult.sub}
                    </div>
                  </div>
                </div>
                <div className="p-3 bg-[#0d0d12]">
                  {/* Performance Indicators */}
                  <div className="flex justify-between items-center py-1 text-xs">
                    <span className="text-gray-300 font-medium">GPU</span>
                    {checkResult.gpuPass ? (
                      <span className="text-green-500 font-medium">
                        ✓ Passes
                      </span>
                    ) : (
                      <span className="text-red-500 font-medium">
                        ✕ Below req
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-1 text-xs">
                    <span className="text-gray-300 font-medium">CPU</span>
                    {checkResult.cpuPass ? (
                      <span className="text-green-500 font-medium">
                        ✓ Passes
                      </span>
                    ) : (
                      <span className="text-red-500 font-medium">
                        ✕ Below req
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-1 text-xs">
                    <span className="text-gray-300 font-medium">RAM</span>
                    {checkResult.ramPass ? (
                      <span className="text-green-500 font-medium">
                        ✓ Passes
                      </span>
                    ) : (
                      <span className="text-red-500 font-medium">
                        ✕ Below req
                      </span>
                    )}
                  </div>

                  {/* Estimated Frame Rates */}
                  {checkResult.state !== 'cant' && (
                    <div className="mt-3 pt-3 border-t border-[#1e1e2a]">
                      <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-2 font-bold">
                        Estimated FPS @ 1080p
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {[
                          {
                            label: 'Low',
                            val: checkResult.fps.low,
                            color: '#22c55e',
                          },
                          {
                            label: 'Med',
                            val: checkResult.fps.med,
                            color: '#3b82f6',
                          },
                          {
                            label: 'High',
                            val: checkResult.fps.high,
                            color: '#f97316',
                          },
                          {
                            label: 'Ultra',
                            val: checkResult.fps.ultra,
                            color: '#ef4444',
                          },
                        ].map((tier) => (
                          <div
                            key={tier.label}
                            className="flex items-center gap-2 text-[0.7rem]"
                          >
                            <div className="w-8 text-gray-400 text-right shrink-0 font-bold">
                              {tier.label}
                            </div>
                            <div className="flex-1 h-1.5 bg-[#1e1e2a] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, (tier.val / 200) * 100)}%`,
                                  backgroundColor: tier.color,
                                }}
                              />
                            </div>
                            <div className="w-10 text-white font-bold text-right">
                              {tier.val} fps
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGameDetail } from './useGameDetail';
import { useCpuSearch, useGpuSearch } from './useHardwareSearch';
import { useHardwareCheck } from './useHardwareCheck';
import { ClientCpuDto } from '../../@types/cpu.types';
import { ClientGpuDto } from '../../@types/gpu.types';
import { SettingPreset } from '../../@types/check.types';
import { SearchableSelect } from '../../components/SearchableSelect/SearchableSelect';

const DEFAULT_RESOLUTIONS = [
  { label: '720p (HD)', width: 1280, height: 720 },
  { label: '1080p (Full HD)', width: 1920, height: 1080 },
  { label: '1440p (QHD)', width: 2560, height: 1440 },
  { label: '2160p (4K)', width: 3840, height: 2160 },
];

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
  const [selectedResolutionKey, setSelectedResolutionKey] =
    useState<string>('1920x1080');
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [selectedPreset, setSelectedPreset] = useState<SettingPreset>(
    SettingPreset.HIGH,
  );

  const {
    mutate: runCheck,
    data: checkResult,
    isPending: isChecking,
    reset: resetCheck,
  } = useHardwareCheck();

  // Initialize active tier (e.g., "minimum") when game data first arrives
  React.useEffect(() => {
    if (game?.requirements?.length && !activeTier) {
      setActiveTier(game.requirements[0].tier);
    }
  }, [game, activeTier]);

  // Derived state for the currently viewed requirement tier (tabs)
  const currentReq = React.useMemo(() => {
    return (
      game?.requirements?.find((r) => r.tier === activeTier) ||
      game?.requirements?.[0]
    );
  }, [game, activeTier]);

  const handleCheck = () => {
    if (!selectedGpu || !selectedCpu || !slug || !activeTier) {
      alert('Please select hardware and wait for game data.');
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
                    onClick={() => {
                      setActiveTier(req.tier);
                      resetCheck();
                    }}
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

            {/* RAM, STORAGE, SETTINGS & RESOLUTION DROPDOWNS */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                  RAM (GB)
                </label>
                <input
                  type="number"
                  className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 font-medium"
                  value={selectedRam}
                  onChange={(e) => {
                    setSelectedRam(parseInt(e.target.value, 10) || 0);
                    resetCheck();
                  }}
                  min="1"
                  max="512"
                />
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
                    resetCheck();
                  }}
                >
                  <option value="hdd">HDD</option>
                  <option value="ssd">SSD</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                  Settings Preset
                </label>
                <select
                  className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
                  value={selectedPreset}
                  onChange={(e) => {
                    setSelectedPreset(e.target.value as SettingPreset);
                    resetCheck();
                  }}
                >
                  <option value={SettingPreset.LOW}>Low</option>
                  <option value={SettingPreset.MEDIUM}>Medium</option>
                  <option value={SettingPreset.HIGH}>High</option>
                  <option value={SettingPreset.ULTRA}>Ultra</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                  Target Resolution
                </label>
                <select
                  className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer font-medium"
                  value={selectedResolutionKey}
                  onChange={(e) => {
                    setSelectedResolutionKey(e.target.value);
                    resetCheck();
                  }}
                >
                  {DEFAULT_RESOLUTIONS.map((res) => (
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
                    <label className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                      Width
                    </label>
                    <input
                      type="number"
                      className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 font-medium"
                      value={customWidth}
                      onChange={(e) => {
                        setCustomWidth(parseInt(e.target.value, 10) || 0);
                        resetCheck();
                      }}
                      min="1"
                      max="7680"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.75rem] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">
                      Height
                    </label>
                    <input
                      type="number"
                      className="w-full bg-[#0f0f13] border border-[#2a2a3a] rounded-md text-white p-2.5 text-sm focus:outline-none focus:border-blue-500 font-medium"
                      value={customHeight}
                      onChange={(e) => {
                        setCustomHeight(parseInt(e.target.value, 10) || 0);
                        resetCheck();
                      }}
                      min="1"
                      max="4320"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleCheck}
              disabled={isChecking}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-800 text-white border-none rounded-md text-sm font-bold cursor-pointer transition-colors mt-2 active:scale-[0.98]"
            >
              {isChecking ? 'Checking...' : 'Check Compatibility'}
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
                        Estimated FPS @{' '}
                        {selectedResolutionKey === 'custom'
                          ? `${customWidth}x${customHeight}`
                          : selectedResolutionKey}
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

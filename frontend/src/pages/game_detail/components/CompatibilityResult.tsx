import React from 'react';
import { CheckResponse } from '../../../@types/check.types';

interface CompatibilityResultProps {
  checkResult: CheckResponse;
  resolutionLabel: string;
}

const sourceLabels = {
  measured: 'Verified',
  ai: 'AI',
  estimate: 'Estimate',
} as const;
const VRAM_FAILURE = 'Your GPU has less VRAM than this preset requires.';
const SSD_ADVISORY = 'An SSD is recommended for smoother asset streaming.';

function renderPassStatus(pass: boolean | null): React.ReactNode {
  if (pass === null) {
    return <span className="text-gray-400 font-medium">Not available</span>;
  }

  return pass ? (
    <span className="text-green-500 font-medium">✓ Passes</span>
  ) : (
    <span className="text-red-500 font-medium">✕ Below req</span>
  );
}

export const CompatibilityResult: React.FC<CompatibilityResultProps> = ({
  checkResult,
  resolutionLabel,
}) => {
  const provider =
    checkResult.source === 'ai'
      ? checkResult.provider === 'gemini'
        ? 'Gemini'
        : 'AI provider'
      : null;
  const notes = [
    ...(checkResult.vramPass === false ? [VRAM_FAILURE] : []),
    ...(checkResult.ssdPass === false ? [SSD_ADVISORY] : []),
  ];

  return (
    <div
      role="status"
      className="mt-5 rounded-lg overflow-hidden border border-[#1e1e2a] block animate-in fade-in zoom-in-95 duration-300"
    >
      <div
        className={`p-3.5 flex items-center gap-2.5 border-b ${
          checkResult.state === 'cant'
            ? 'bg-red-500/10 border-red-500/20'
            : checkResult.state === 'insufficient'
              ? 'bg-white/5 border-[#2a2a3a]'
              : 'bg-green-500/10 border-green-500/20'
        }`}
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${
            checkResult.state === 'cant'
              ? 'bg-red-500/20 text-red-500'
              : checkResult.state === 'insufficient'
                ? 'bg-white/10 text-gray-300'
                : 'bg-green-500/20 text-green-500'
          }`}
          aria-hidden="true"
        >
          {checkResult.state === 'cant'
            ? '✕'
            : checkResult.state === 'insufficient'
              ? '!'
              : '✓'}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`text-sm font-bold ${
                checkResult.state === 'cant'
                  ? 'text-red-500'
                  : checkResult.state === 'insufficient'
                    ? 'text-gray-200'
                    : 'text-green-500'
              }`}
            >
              {checkResult.verdict}
            </div>
            {checkResult.source && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold text-gray-200">
                {sourceLabels[checkResult.source]}
              </span>
            )}
            {provider && (
              <span className="text-xs font-medium text-gray-300">
                {provider}
              </span>
            )}
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
          {renderPassStatus(checkResult.gpuPass)}
        </div>
        <div className="flex justify-between items-center py-1 text-xs">
          <span className="text-gray-300 font-medium">CPU</span>
          {renderPassStatus(checkResult.cpuPass)}
        </div>
        <div className="flex justify-between items-center py-1 text-xs">
          <span className="text-gray-300 font-medium">RAM</span>
          {renderPassStatus(checkResult.ramPass)}
        </div>

        {notes.length > 0 && (
          <ul
            aria-label="Compatibility notes"
            className="mt-3 space-y-1.5 border-t border-[#1e1e2a] pt-3 text-xs text-amber-300"
          >
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        {checkResult.fps !== null && (
          <div className="mt-3 pt-3 border-t border-[#1e1e2a]">
            <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-2 font-bold">
              FPS @ {resolutionLabel} · Target: {checkResult.targetFps} FPS
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
  );
};

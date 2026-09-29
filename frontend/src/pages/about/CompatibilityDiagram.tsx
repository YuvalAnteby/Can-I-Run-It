import type { ReactElement } from 'react';

import { FlowArrow } from './FlowArrow';

type NodeTone = 'blue' | 'green' | 'slate' | 'violet';

const NODE_TONES: Record<NodeTone, string> = {
  blue: 'border-sky-400/40 bg-sky-400/[0.08]',
  green: 'border-emerald-400/35 bg-emerald-400/[0.07]',
  slate: 'border-slate-600/80 bg-slate-900/70',
  violet: 'border-violet-400/35 bg-violet-400/[0.07]',
};

interface BehaviorCardProps {
  description: string;
  pills?: string[];
  title: string;
  tone: NodeTone;
  className?: string;
}

function BehaviorCard({
  className = '',
  description,
  pills,
  title,
  tone,
}: BehaviorCardProps): ReactElement {
  const pillTones: Record<NodeTone, string> = {
    blue: 'border-sky-300/20 bg-black/20 text-sky-100',
    green: 'border-emerald-300/20 bg-black/20 text-emerald-100',
    slate: 'border-white/10 bg-black/20 text-gray-200',
    violet: 'border-violet-300/20 bg-black/20 text-violet-100',
  };

  return (
    <div
      data-testid="behavior-card"
      className={`flex min-h-[200px] min-w-0 flex-1 flex-col rounded-[14px] border p-4 ${NODE_TONES[tone]} ${className}`}
    >
      <h3
        data-testid="behavior-card-title"
        className="m-0 min-h-6 text-[1.05rem] font-semibold tracking-[-0.02em] text-white"
      >
        {title}
      </h3>
      <p
        data-testid="behavior-card-description"
        className="m-0 mt-2 min-h-10 text-xs leading-5 text-gray-400"
      >
        {description}
      </p>
      <div
        data-testid="behavior-card-pills"
        className="mt-4 flex flex-wrap gap-1.5"
      >
        {pills &&
          pills.map((pill) => (
            <span
              key={pill}
              className={`rounded-md border px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] ${pillTones[tone]}`}
            >
              {pill}
            </span>
          ))}
      </div>
    </div>
  );
}

interface EvidenceRowProps {
  detail: string;
  label: string;
  rank: string;
  tone: 'green' | 'blue' | 'violet';
}

function EvidenceRow({
  detail,
  label,
  rank,
  tone,
}: EvidenceRowProps): ReactElement {
  const toneClasses = {
    green: 'border-emerald-400/40 bg-emerald-400/[0.07] text-emerald-200',
    slate: 'border-slate-600/70 bg-slate-900/60 text-gray-300',
    violet: 'border-violet-400/35 bg-violet-400/[0.07] text-violet-200',
    blue: 'border-sky-400/40 bg-sky-400/[0.08]',
  };

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${toneClasses[tone]}`}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/20 text-[0.65rem] font-bold">
        {rank}
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-semibold text-white">
          {label}
        </strong>
        <span className="block text-[0.68rem] leading-4 text-gray-400">
          {detail}
        </span>
      </span>
    </li>
  );
}

export function CompatibilityDiagram(): ReactElement {
  return (
    <figure className="mt-8 overflow-hidden rounded-2xl border border-[#263244] bg-[#111820] p-4 shadow-[0_18px_45px_-28px_rgba(56,189,248,0.65)] md:p-6">
      <div
        role="img"
        aria-label="Compatibility evidence flow diagram"
        className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0"
      >
        <BehaviorCard
          description="Game, hardware, resolution, preset, and target FPS."
          title="Configuration"
          tone="blue"
          className="md:max-w-[190px]"
        />
        <FlowArrow label="match" />
        <BehaviorCard
          description="The record fields used for an exact match. Upscaler matching is preferred, not required."
          title="Six-field lookup"
          tone="blue"
          className="md:max-w-[230px]"
        />
        <FlowArrow label="rank" />
        <div
          className={`flex min-h-[200px] min-w-0 flex-1 flex-col rounded-[14px] border p-4 ${NODE_TONES.blue} md:min-w-[250px]`}
        >
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-gray-500">
              Evidence priority
            </span>
          </div>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            <EvidenceRow
              detail=""
              label="Measured record"
              rank="1"
              tone="blue"
            />
            <EvidenceRow
              detail="Optional stored result or Gemini"
              label="Provider / AI"
              rank="2"
              tone="violet"
            />
            <EvidenceRow
              detail=""
              label="Heuristic Estimate"
              rank="3"
              tone="blue"
            />
            <EvidenceRow
              detail="no usable evidence"
              label="Insufficient"
              rank="4"
              tone="blue"
            />
          </ol>
        </div>
        <FlowArrow label="decide" />
        <BehaviorCard
          description="Compare available FPS with the selected target."
          pills={[
            'Can run',
            "Can't run",
            'Likely can',
            "Likely can't",
            'Insufficient',
          ]}
          title="Verdict"
          tone="green"
          className="md:max-w-[190px]"
        />
      </div>
    </figure>
  );
}

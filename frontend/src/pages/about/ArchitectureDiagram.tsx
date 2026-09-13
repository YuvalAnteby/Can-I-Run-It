import { Database, Monitor, Server, Sparkles } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { FlowArrow } from './FlowArrow';

type NodeTone = 'blue' | 'violet';

const NODE_TONES: Record<NodeTone, string> = {
  blue: 'border-sky-400/40 bg-sky-400/[0.08]',
  violet: 'border-violet-400/35 bg-violet-400/[0.07]',
};

interface DiagramNodeProps {
  detail: string;
  eyebrow?: string;
  icon: ReactNode;
  title: string;
  tone: NodeTone;
  className?: string;
}

function DiagramNode({
  detail,
  eyebrow = '',
  icon,
  title,
  tone,
  className = '',
}: DiagramNodeProps): ReactElement {
  return (
    <div
      className={`flex min-h-[122px] min-w-0 flex-1 flex-col justify-center rounded-[14px] border p-4 ${NODE_TONES[tone]} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-sky-300">
          {icon}
        </span>
        <span className="text-right text-[0.62rem] font-bold uppercase tracking-[0.16em] text-gray-500">
          {eyebrow}
        </span>
      </div>
      <div className="mt-5">
        <h3 className="m-0 text-[1.05rem] font-semibold tracking-[-0.02em] text-white">
          {title}
        </h3>
        <p className="m-0 mt-1 text-xs leading-5 text-gray-400">{detail}</p>
      </div>
    </div>
  );
}

export function ArchitectureDiagram(): ReactElement {
  return (
    <figure className="mt-8 overflow-hidden rounded-2xl border border-[#263244] bg-[#111820] p-4 shadow-[0_18px_45px_-28px_rgba(56,189,248,0.65)] md:p-6">
      <div
        role="img"
        aria-label="Service architecture diagram"
        className="flex flex-col gap-3 md:flex-row md:items-center md:gap-0"
      >
        <DiagramNode
          detail="Vite-built interface for selecting a game and PC"
          icon={<Monitor className="h-5 w-5" aria-hidden="true" />}
          title="React SPA"
          tone="blue"
          className="md:max-w-[190px]"
        />
        <FlowArrow label="HTTPS" />
        <DiagramNode
          detail="Compatibility orchestration and the only secret boundary"
          icon={<Server className="h-5 w-5" aria-hidden="true" />}
          title="NestJS API"
          tone="blue"
          className="md:max-w-[230px]"
        />
        <FlowArrow label="routes" />
        <div className="relative flex flex-1 flex-col gap-3 rounded-xl border border-dashed border-[#2a394d] p-3 pt-8 md:min-w-[260px]">
          <div className="flex items-center gap-3">
            <span
              className="hidden h-px w-4 bg-blue-300/70 md:block"
              aria-hidden="true"
            />
            <DiagramNode
              detail="Catalog, requirements, and measured records"
              icon={<Database className="h-5 w-5" aria-hidden="true" />}
              title="PostgreSQL"
              tone="blue"
              className="min-h-[104px]"
            />
          </div>
          <div className="flex items-center gap-3">
            <span
              className="hidden h-px w-4 bg-violet-300/70 md:block"
              aria-hidden="true"
            />
            <DiagramNode
              detail="Optional provider fallback when stored evidence is missing"
              eyebrow="Optional"
              icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
              title="Gemini"
              tone="violet"
              className="min-h-[104px]"
            />
          </div>
        </div>
      </div>
    </figure>
  );
}

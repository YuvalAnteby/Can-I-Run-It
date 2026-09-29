import { ArrowDown, ArrowRight } from 'lucide-react';
import type { ReactElement } from 'react';

export function FlowArrow({ label }: { label: string }): ReactElement {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-sky-300/75">
      <ArrowRight className="hidden h-5 w-5 md:block" aria-hidden="true" />
      <ArrowDown className="h-5 w-5 md:hidden" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

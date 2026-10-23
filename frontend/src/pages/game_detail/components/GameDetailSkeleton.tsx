import type { ReactElement } from 'react';

export function GameDetailSkeleton(): ReactElement {
  return (
    <div className="bg-page text-ink min-h-screen font-sans pb-20">
      <div
        className="animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      >
        {/* Hero placeholder: cover, title and meta bars */}
        <div className="relative min-h-[320px] md:min-h-[420px] overflow-hidden">
          <div className="relative min-h-[320px] md:min-h-[420px] flex items-end p-4 pb-8 md:p-8 md:pb-10 gap-4 md:gap-8 max-w-[1100px] mx-auto">
            <div className="hidden sm:block w-[130px] h-[175px] rounded-lg bg-gray-700/50 shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <div className="h-8 md:h-10 w-2/3 rounded bg-gray-700/50" />
              <div className="h-4 w-1/3 rounded bg-gray-700/30" />
            </div>
          </div>
        </div>

        {/* Main grid placeholder: requirements on the left, check card on the right */}
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 pt-8 grid grid-cols-1 md:grid-cols-[1fr_340px] gap-8 items-start">
          <div>
            <div className="h-3 w-40 rounded bg-gray-700/50 mb-4 pb-2" />
            <div className="grid grid-cols-2 gap-[1px] bg-surface-raised rounded-lg overflow-hidden border border-line-subtle">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="bg-surface p-3.5 flex flex-col gap-2"
                >
                  <div className="h-2.5 w-1/2 rounded bg-gray-700/50" />
                  <div className="h-4 w-3/4 rounded bg-gray-700/30" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-surface border border-line-subtle rounded-xl p-6 h-[360px]">
            <div className="h-4 w-1/2 rounded bg-gray-700/50 mb-2" />
            <div className="h-3 w-3/4 rounded bg-gray-700/30 mb-6" />
            <div className="h-11 w-full rounded-md bg-gray-700/50" />
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        Loading game details…
      </p>
    </div>
  );
}

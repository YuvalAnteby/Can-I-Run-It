import type { ReactElement } from 'react';

export const GameCardSkeleton = (): ReactElement => {
  return (
    <div
      className="bg-[#161b22] rounded-xl overflow-hidden border border-gray-800 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] animate-pulse"
      aria-hidden="true"
    >
      {/* Cover image placeholder */}
      <div className="aspect-[3/4] bg-gray-700/50" />

      {/* Card body placeholder */}
      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Title placeholder */}
        <div className="h-4 bg-gray-700/50 rounded w-3/4" />
        {/* Link placeholder */}
        <div className="h-3 bg-gray-700/30 rounded w-1/2" />
      </div>
    </div>
  );
};

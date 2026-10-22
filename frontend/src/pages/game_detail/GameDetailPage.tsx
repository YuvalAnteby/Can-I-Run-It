import React, { useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useGameDetail } from './useGameDetail';
import GameHero from './components/GameHero';
import { GameDetailSkeleton } from './components/GameDetailSkeleton';
import { RequirementsGrid } from './components/RequirementsGrid';
import { TechFeatures } from './components/TechFeatures';
import { HardwareCheckCard } from './components/HardwareCheckCard';

export default function GameDetailPage(): React.ReactElement {
  const { slug, id } = useParams<{ slug?: string; id?: string }>();
  const location = useLocation();
  const pendingId = id
    ? Number(id)
    : Number(location.pathname.match(/^\/pending-games\/(\d+)$/)?.[1]);
  const resolvedPendingId = Number.isFinite(pendingId) ? pendingId : undefined;
  const {
    data: game,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useGameDetail(
    resolvedPendingId !== undefined ? { pendingId: resolvedPendingId } : slug,
  );

  const [selectedTier, setActiveTier] = useState<string | null>(null);
  const currentReq =
    game?.requirements.find(
      (requirement) => requirement.tier === selectedTier,
    ) ?? game?.requirements[0];
  const activeTier = currentReq?.tier;

  if (isLoading)
    return (
      <>
        <title>Loading… - Can I Run It?</title>
        <GameDetailSkeleton />
      </>
    );
  if (isError || !game)
    return (
      <div className="bg-page text-ink min-h-screen font-sans">
        <title>Game not found - Can I Run It?</title>
        <div
          role="alert"
          className="flex flex-col items-center text-center gap-3 max-w-md mx-auto px-4 py-20"
        >
          <h1 className="m-0 text-xl font-bold text-white">
            Couldn't load this game
          </h1>
          <p className="m-0 text-sm text-gray-400">
            Something went wrong while fetching this game. Check your connection
            and try again.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex items-center justify-center min-h-11 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white rounded-md px-4 py-2 text-sm font-bold focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none disabled:opacity-70 disabled:cursor-wait"
            >
              {isFetching ? 'Retrying…' : 'Try again'}
            </button>
            <Link
              to="/"
              className="inline-flex items-center min-h-11 px-2 rounded-sm text-blue-300 underline focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              Back to search
            </Link>
          </div>
        </div>
      </div>
    );
  if (resolvedPendingId && game.status === 'published') {
    return <Navigate to={`/games/${game.slug}`} replace />;
  }

  return (
    <div className="bg-page text-ink min-h-screen font-sans pb-20">
      <title>{`${game.name} system requirements - Can I Run It?`}</title>
      {/* 1. HERO SECTION: Banner image, Cover art, and primary game metadata */}
      <GameHero game={game} />

      {/* 2. MAIN CONTENT: Layout grid for requirements and check card */}
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 pt-8 grid grid-cols-1 md:grid-cols-[1fr_340px] gap-8 items-start">
        {/* LEFT COLUMN: Requirements tabs and detailed tech specs */}
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-gray-400 mb-4 pb-2 border-b border-line-subtle font-semibold">
            System Requirements
          </p>

          {game.requirements.length > 0 ? (
            <>
              {/* Tab navigation for different requirement tiers (min, rec, ultra) */}
              <div className="flex gap-1 mb-5 overflow-x-auto">
                {game.requirements.map((req) => (
                  <button
                    type="button"
                    key={req.tier}
                    aria-pressed={activeTier === req.tier}
                    onClick={() => setActiveTier(req.tier)}
                    className={`cursor-pointer px-4 py-1.5 rounded-md text-sm border transition-colors whitespace-nowrap ${
                      activeTier === req.tier
                        ? 'bg-surface-raised text-white border-line-strong font-medium'
                        : 'bg-transparent text-gray-400 border-line hover:text-gray-200'
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
              Requirements not available yet.
            </p>
          )}

          {/* TECH FEATURES: ray tracing, dlss, fsr support flags */}
          <p className="text-[0.7rem] uppercase tracking-[0.12em] text-gray-400 mt-8 mb-4 pb-2 border-b border-line-subtle font-semibold">
            Tech Features
          </p>
          <TechFeatures game={game} />
        </div>

        {/* RIGHT COLUMN: Interactive Hardware Check Card */}
        <HardwareCheckCard game={game} slug={slug} activeTier={activeTier} />
      </div>
    </div>
  );
}

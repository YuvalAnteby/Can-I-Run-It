import type { ReactElement } from 'react';

import { GamesCarousel } from '../../components/GamesCarousel/GamesCarousel';
import { HowItWorks } from '../../components/HowItWorks/HowItWorks';
import { HeroSearch } from './HeroSearch';
import { useGames } from './useGames';

export default function MainPage(): ReactElement {
  const { games, isLoading, isError } = useGames(20);

  // Split games into two display groups:
  //   - "Trending" — first 6
  //   - "Recently Added" — remaining entries
  const trendingGames = games.slice(0, 6);
  const recentlyAddedGames = games.slice(6);

  return (
    <main>
      {/* 1 — Hero + game search */}
      <HeroSearch />

      {/* Error state handling */}
      {isError && (
        <div className="py-12 text-center text-red-400">
          Failed to load games.
        </div>
      )}

      {/* Carousels and content */}
      <div className={isError ? 'opacity-50 pointer-events-none' : ''}>
        {/* 2 — Trending games carousel */}
        <GamesCarousel
          id="trending-games"
          title="Trending Games"
          games={trendingGames}
          isLoading={isLoading}
        />

        {/* 3 — How the app works (purely presentational) */}
        <HowItWorks />

        {/* 4 — Recently added carousel */}
        <GamesCarousel
          id="recently-added"
          title="Recently Added"
          games={recentlyAddedGames}
          isLoading={isLoading}
        />
      </div>
    </main>
  );
}

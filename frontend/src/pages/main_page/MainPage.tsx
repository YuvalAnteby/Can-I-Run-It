import type { ReactElement } from 'react';

import { GamesCarousel } from '../../components/GamesCarousel/GamesCarousel';
import { HowItWorks } from '../../components/HowItWorks/HowItWorks';
import { PLACEHOLDER_GAMES } from '../../data/placeholderGames';
import { HeroSearch } from './HeroSearch';

/**
 * Splits placeholder games into two display groups:
 *   - "Trending" — first 6 (highest-requirement titles near the top)
 *   - "Recently Added" — remaining entries
 *
 * TODO: Replace both slices with real paginated API calls once the NestJS
 * games module is available. Wiring point: replace PLACEHOLDER_GAMES usage
 * with the values returned by dedicated React Query hooks.
 */
const TRENDING_GAMES = PLACEHOLDER_GAMES.slice(0, 6);
const RECENTLY_ADDED_GAMES = PLACEHOLDER_GAMES.slice(6);

export default function MainPage(): ReactElement {
  return (
    <main>
      {/* 1 — Hero + game search */}
      <HeroSearch />

      {/* 2 — Trending games carousel */}
      <GamesCarousel
        id="trending-games"
        title="Trending Games"
        games={TRENDING_GAMES}
      />

      {/* 3 — How the app works (purely presentational) */}
      <HowItWorks />

      {/* 4 — Recently added carousel */}
      <GamesCarousel
        id="recently-added"
        title="Recently Added"
        games={RECENTLY_ADDED_GAMES}
      />
    </main>
  );
}

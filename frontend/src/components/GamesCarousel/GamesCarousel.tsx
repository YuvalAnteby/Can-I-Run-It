import { Gamepad2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ClientGameDto } from '../../@types/game.types';
import { GameCard } from '../GameCard/GameCard';
import { GameCardSkeleton } from '../GameCard/GameCardSkeleton';

export interface GamesCarouselProps {
  title: string;
  games: ClientGameDto[];
  /** Stable identifier for aria-labelledby */
  id?: string;
  /** Whether the carousel is currently fetching data */
  isLoading?: boolean;
}

export const GamesCarousel = ({
  title,
  games,
  id,
  isLoading = false,
}: GamesCarouselProps): ReactElement => {
  const navigate = useNavigate();
  const headingId =
    id ?? `carousel-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <section className="py-12" aria-labelledby={headingId}>
      <div className="flex items-center justify-between mb-5 px-1">
        <h2
          className="text-2xl font-bold text-white flex items-center gap-2 m-0"
          id={headingId}
        >
          <Gamepad2 className="text-blue-500 shrink-0" aria-hidden="true" />
          {title}
        </h2>
        {/* TODO: link to a /games browse page once it exists */}
        {!isLoading && games.length > 0 && (
          <span
            className="text-sm text-blue-500 cursor-default"
            aria-hidden="true"
          >
            View All
          </span>
        )}
      </div>

      <div
        className="carousel-track flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]"
        role="list"
      >
        {isLoading
          ? // Render 6 skeletons while loading
            Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                className="snap-start shrink-0 w-[200px]"
                role="listitem"
              >
                <GameCardSkeleton />
              </div>
            ))
          : games.map((game) => (
              <div
                key={game.id}
                className="snap-start shrink-0 w-[200px]"
                role="listitem"
              >
                <GameCard
                  game={game}
                  onClick={() => {
                    void navigate(`/games/${game.slug}`);
                  }}
                />
              </div>
            ))}

        {!isLoading && games.length === 0 && (
          <div className="snap-start shrink-0 py-4" role="listitem">
            <p className="text-gray-500 text-sm">No games to show right now.</p>
          </div>
        )}
      </div>
    </section>
  );
};

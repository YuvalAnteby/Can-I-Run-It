import { Gamepad2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ClientGameDto } from '../../@types/game.types';
import { GameCard } from '../GameCard/GameCard';

interface GamesGridProps {
  title: string;
  games: ClientGameDto[];
}

export const GamesGrid = ({ title, games }: GamesGridProps): ReactElement => {
  const navigate = useNavigate();

  return (
    <section className="py-12">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2 m-0">
          <Gamepad2 className="text-blue-500 shrink-0" aria-hidden="true" />
          {title}
        </h2>
        {/* TODO: link to a /games browse page once it exists */}
        <a
          href="#"
          className="text-sm text-blue-500 no-underline hover:underline"
        >
          View All
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {games.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            onClick={() => {
              void navigate(`/games/${game.slug}`);
            }}
          />
        ))}
      </div>
    </section>
  );
};

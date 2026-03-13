import { Gamepad2 } from 'lucide-react';
import type { ReactElement } from 'react';

import type { ClientGameDto } from '../../@types/game.types';
import { GameCard } from '../GameCard/GameCard';
import './GamesGrid.css';

interface GamesGridProps {
  title: string;
  games: ClientGameDto[];
}

export const GamesGrid = ({ title, games }: GamesGridProps): ReactElement => {
  return (
    <section className="py-12">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2 m-0">
          <Gamepad2 className="text-blue-500" aria-hidden="true" />
          {title}
        </h2>
        {/* TODO: replace href="#" with a real /games route once browse page exists */}
        <a
          href="#"
          className="text-sm text-blue-500 no-underline hover:underline"
        >
          View All
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
};

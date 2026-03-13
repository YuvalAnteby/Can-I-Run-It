import type { ReactElement } from 'react';

import type { ClientGameDto } from '../../@types/game.types';

export interface GameCardProps {
  game: ClientGameDto;
  /** Called when the user clicks the card. No-op until the game detail page exists. */
  onClick?: (game: ClientGameDto) => void;
}

export const GameCard = ({ game, onClick }: GameCardProps): ReactElement => {
  const { name, coverImageUrl } = game;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      onClick?.(game);
    }
  };

  return (
    <div
      className="group bg-[#161b22] rounded-xl overflow-hidden border border-gray-800 transition-[border-color,transform] duration-200 cursor-pointer shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)] outline-none hover:border-blue-500/50 hover:-translate-y-1 focus-visible:border-blue-500/50 focus-visible:-translate-y-1"
      onClick={() => onClick?.(game)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Check if you can run ${name}`}
    >
      {/* Cover image or gradient placeholder */}
      <div className="aspect-[3/4] bg-gray-800 relative overflow-hidden">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs font-bold text-center p-2 bg-gradient-to-br from-gray-800 to-gray-900 transition-transform duration-500 group-hover:scale-105"
            aria-hidden="true"
          >
            {name}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="px-4 py-3 flex flex-col gap-[0.35rem]">
        <h3 className="text-sm font-semibold text-white m-0 whitespace-nowrap overflow-hidden text-ellipsis">
          {name}
        </h3>
        {/* TODO: Link to /games/:slug once game detail page is implemented */}
        <span className="text-[0.7rem] text-blue-500 font-medium">
          Can I Run It?
        </span>
      </div>
    </div>
  );
};

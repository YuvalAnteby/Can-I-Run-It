import type { ReactElement } from 'react';

import type { ClientGameDto } from '../../../@types/game.types';

interface GameHeroProps {
  game: ClientGameDto;
}

export default function GameHero({ game }: GameHeroProps): ReactElement {
  const coverImageUrl = game.coverImageUrl ?? '/logo192.png';
  const metadata = [game.publisher || game.developer, game.releaseDate].filter(
    (value): value is string => Boolean(value),
  );

  return (
    <div className="relative min-h-[320px] md:min-h-[420px] overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${coverImageUrl})`,
          filter: 'brightness(0.35)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, color-mix(in srgb, var(--color-page) 95%, transparent) 35%, color-mix(in srgb, var(--color-page) 20%, transparent) 100%), linear-gradient(to top, var(--color-page) 0%, transparent 40%)',
        }}
      />
      <div className="relative min-h-[320px] md:min-h-[420px] flex items-end p-4 pb-8 md:p-8 md:pb-10 gap-4 md:gap-8 max-w-[1100px] mx-auto">
        <img
          className="hidden sm:block w-[130px] h-[175px] rounded-lg object-cover border-2 border-line shrink-0"
          src={coverImageUrl}
          alt={game.name}
        />
        <div className="flex-1 min-w-0">
          <div className="flex gap-2 mb-3 flex-wrap">
            {game.status === 'pending_approval' && (
              <span className="text-[0.7rem] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/30 uppercase tracking-wider font-medium">
                Pending review
              </span>
            )}
            {game.genre && (
              <span className="text-[0.7rem] px-2.5 py-1 rounded-full bg-surface-raised text-gray-300 border border-line uppercase tracking-wider font-medium">
                {game.genre}
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-2 tracking-tight break-words">
            {game.name}
          </h1>
          {metadata.length > 0 && (
            <p className="text-gray-400 text-sm mb-4">
              {metadata.map((value, index) => (
                <span key={value}>
                  {index > 0 && ' · '}
                  {index === 0 ? (
                    <strong className="text-gray-300">{value}</strong>
                  ) : (
                    value
                  )}
                </span>
              ))}
            </p>
          )}
          {game.description && (
            <p className="text-gray-300 text-sm leading-relaxed max-w-lg line-clamp-3">
              {game.description}
            </p>
          )}
          {game.attributions && game.attributions.length > 0 && (
            <div className="flex gap-3 mt-4" aria-label="Attributions">
              {game.attributions.map((attribution) => (
                <a
                  key={attribution.source}
                  href={attribution.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={attribution.label}
                  className="text-xs text-blue-300 underline"
                >
                  Source: {attribution.label}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { ClientGameDto } from '../../../@types/game.types';

export default function GameHero({ game }: { game: ClientGameDto }) {
  return (
    <div className="relative h-[420px] overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${game.coverImageUrl || 'https://via.placeholder.com/1200x600?text=No+Cover'})`,
          filter: 'brightness(0.35)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgba(15,15,19,0.95) 35%, rgba(15,15,19,0.2) 100%), linear-gradient(to top, #0f0f13 0%, transparent 40%)',
        }}
      />
      <div className="relative h-full flex items-end p-8 pb-10 gap-8 max-w-[1100px] mx-auto">
        <img
          className="w-[130px] h-[175px] rounded-lg object-cover border-2 border-[#2a2a3a] shrink-0"
          src={game.coverImageUrl || 'https://via.placeholder.com/130x175'}
          alt={game.name}
        />
        <div className="flex-1">
          <div className="flex gap-2 mb-3 flex-wrap">
            {game.genre && (
              <span className="text-[0.7rem] px-2.5 py-1 rounded-full bg-[#1e1e2a] text-gray-300 border border-[#2a2a3a] uppercase tracking-wider font-medium">
                {game.genre}
              </span>
            )}
          </div>
          <h1 className="text-4xl font-extrabold leading-tight mb-2 tracking-tight">
            {game.name}
          </h1>
          <p className="text-gray-400 text-sm mb-4">
            <strong className="text-gray-300">
              {game.publisher || game.developer}
            </strong>{' '}
            &nbsp;&middot;&nbsp; {game.releaseDate}
          </p>
          <p className="text-gray-300 text-sm leading-relaxed max-w-lg line-clamp-3">
            {game.description}
          </p>
        </div>
      </div>
    </div>
  );
}

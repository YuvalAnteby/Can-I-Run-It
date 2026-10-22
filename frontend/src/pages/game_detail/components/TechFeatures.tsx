import React from 'react';
import { ClientGameDto } from '../../../@types/game.types';

interface TechFeaturesProps {
  game: ClientGameDto;
}

export const TechFeatures: React.FC<TechFeaturesProps> = ({ game }) => {
  return (
    <div className="grid grid-cols-2 gap-2 mb-8">
      <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsRayTracing ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span
          className={`text-xs font-medium ${game.supportsRayTracing ? 'text-gray-200' : 'text-gray-400 line-through'}`}
        >
          Ray Tracing
          <span className="sr-only">
            {game.supportsRayTracing ? ' supported' : ' not supported'}
          </span>
        </span>
      </div>
      <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsDlss ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span
          className={`text-xs font-medium ${game.supportsDlss ? 'text-gray-200' : 'text-gray-400 line-through'}`}
        >
          DLSS (Nvidia)
          <span className="sr-only">
            {game.supportsDlss ? ' supported' : ' not supported'}
          </span>
        </span>
      </div>
      <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsFsr ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span
          className={`text-xs font-medium ${game.supportsFsr ? 'text-gray-200' : 'text-gray-400 line-through'}`}
        >
          FSR (AMD)
          <span className="sr-only">
            {game.supportsFsr ? ' supported' : ' not supported'}
          </span>
        </span>
      </div>
      <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
        <div
          aria-hidden="true"
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsXeSS ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span
          className={`text-xs font-medium ${game.supportsXeSS ? 'text-gray-200' : 'text-gray-400 line-through'}`}
        >
          XeSS (Intel)
          <span className="sr-only">
            {game.supportsXeSS ? ' supported' : ' not supported'}
          </span>
        </span>
      </div>
    </div>
  );
};

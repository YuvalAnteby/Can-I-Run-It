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
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsRayTracing ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span className="text-xs text-gray-300 font-medium">Ray Tracing</span>
      </div>
      <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsDlss ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span className="text-xs text-gray-300 font-medium">DLSS (Nvidia)</span>
      </div>
      <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsFsr ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span className="text-xs text-gray-300 font-medium">FSR (AMD)</span>
      </div>
      <div className="bg-[#13131a] border border-[#1e1e2a] rounded-lg p-3 flex items-center gap-2.5">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${game.supportsXeSS ? 'bg-green-500' : 'bg-[#2a2a3a]'}`}
        />
        <span className="text-xs text-gray-300 font-medium">XeSS (Intel)</span>
      </div>
    </div>
  );
};

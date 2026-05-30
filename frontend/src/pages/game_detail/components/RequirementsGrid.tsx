import React from 'react';
import { ClientGameRequirementDto } from '../../../@types/game.types';

interface RequirementsGridProps {
  currentReq: ClientGameRequirementDto | undefined;
}

export const RequirementsGrid: React.FC<RequirementsGridProps> = ({
  currentReq,
}) => {
  if (!currentReq) return null;

  return (
    <div className="grid grid-cols-2 gap-[1px] bg-[#1e1e2a] rounded-lg overflow-hidden border border-[#1e1e2a]">
      <div className="bg-[#0f0f13] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          Target
        </div>
        <div className="text-sm text-gray-200 font-medium">
          {currentReq.targetFps}fps @ {currentReq.resolutionWidth}x
          {currentReq.resolutionHeight}
        </div>
      </div>
      <div className="bg-[#0f0f13] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          OS
        </div>
        <div className="text-sm text-gray-200 font-medium">Windows 10/11</div>
      </div>
      <div className="bg-[#13131a] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          CPU
        </div>
        <div className="text-sm text-gray-200 font-medium">
          {currentReq.cpu?.name || 'N/A'}
        </div>
      </div>
      <div className="bg-[#13131a] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          GPU
        </div>
        <div className="text-sm text-gray-200 font-medium">
          {currentReq.gpu?.name || 'N/A'}
        </div>
      </div>
      <div className="bg-[#13131a] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          RAM
        </div>
        <div className="text-sm text-gray-200 font-medium">
          {currentReq.ramGb} GB
        </div>
      </div>
      <div className="bg-[#13131a] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          VRAM
        </div>
        <div className="text-sm text-gray-200 font-medium">
          {currentReq.vramGb || 'N/A'} GB
        </div>
      </div>
      <div className="bg-[#13131a] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          Storage
        </div>
        <div className="text-sm text-gray-200 font-medium">
          {currentReq.storageGb || 'N/A'} GB
        </div>
      </div>
      <div className="bg-[#13131a] p-3.5">
        <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
          SSD Required
        </div>
        <div className="text-sm text-gray-200 font-medium">
          {currentReq.requiresSsd ? 'Yes' : 'No'}
        </div>
      </div>
      {currentReq.notes && (
        <div className="bg-[#13131a] p-3.5 col-span-2">
          <div className="text-[0.7rem] text-gray-400 uppercase tracking-wider mb-1 font-medium">
            Notes
          </div>
          <div className="text-[0.82rem] text-gray-300 font-normal">
            {currentReq.notes}
          </div>
        </div>
      )}
    </div>
  );
};

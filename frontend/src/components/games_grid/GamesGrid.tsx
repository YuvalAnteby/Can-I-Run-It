import React from 'react';
import type { ReactElement } from 'react';
import { Gamepad2 } from 'lucide-react';
import './GamesGrid.css';
import type { ClientGameDto } from '../../@types/game.types';

interface GamesGridProps {
  title: string;
  games: ClientGameDto[];
}

export const GamesGrid = ({ title, games }: GamesGridProps): ReactElement => {
  return (
    <section className="games-grid-section">
      <div className="games-grid-header">
        <h2 className="games-grid-title">
          <Gamepad2 className="icon-highlight" />
          {title}
        </h2>
        <a href="#" className="view-all-link">
          View All
        </a>
      </div>

      <div className="games-grid-list">
        {games.map((game) => (
          <div key={game.id} className="game-card">
            {/* Image Placeholder - future: use game.coverImageUrl or slug-based asset */}
            <div className="game-image-wrapper">
              <div className="game-placeholder-art">{game.name} Art</div>
              <div className="game-req-badge">
                {game.requirementTier ?? 'Unknown'} Reqs
              </div>
            </div>

            <div className="game-card-content">
              <h3 className="game-title">{game.name}</h3>
              <div className="game-meta">
                <span className="release-date">Released: 2025</span>
                <span className="run-it-badge">Can I Run It?</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

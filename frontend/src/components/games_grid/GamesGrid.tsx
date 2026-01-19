import { Gamepad2 } from 'lucide-react';
import './GamesGrid.css';

interface Game {
  id: number;
  title: string;
  req: string;
  image: string;
}

export const GamesGrid = ({
  title,
  games,
}: {
  title: string;
  games: Game[];
}) => {
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
            {/* Image Placeholder */}
            <div className="game-image-wrapper">
              <div className="game-placeholder-art">{game.title} Art</div>
              <div className="game-req-badge">{game.req} Reqs</div>
            </div>

            <div className="game-card-content">
              <h3 className="game-title">{game.title}</h3>
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

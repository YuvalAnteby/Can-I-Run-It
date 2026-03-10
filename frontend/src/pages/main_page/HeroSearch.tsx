import type { ReactElement } from 'react';
import { Search, Monitor, Gauge } from 'lucide-react';
import './HeroSearch.css'; // Importing the CSS file

/* Types (Same as before) */
type UserState = 'guest' | 'loggedIn';

interface UserProfile {
  username: string;
  specs: {
    gpu: string;
    cpu: string;
    ram: string;
  } | null;
}

interface HeroProps {
  userState: UserState;
  user: UserProfile;
}

export const HeroSearch = ({ userState, user }: HeroProps): ReactElement => {
  return (
    <div className="hero-section">
      <div className="hero-background"></div>

      <div className="hero-content">
        {/* Status Badge */}
        <div className="status-badge">
          {userState === 'loggedIn' ? (
            <>
              <span className="status-dot-wrapper">
                <span className="status-dot-ping"></span>
                <span className="status-dot-solid"></span>
              </span>
              <span>Specs Loaded: {user.specs?.cpu}</span>
            </>
          ) : (
            <span>Database Updated: Jan 2026</span>
          )}
        </div>

        {/* Main Heading */}
        <h1 className="hero-title">
          {userState === 'loggedIn' ? (
            <>
              Ready to drop in,{' '}
              <span className="text-gradient-blue">{user.username}?</span>
            </>
          ) : (
            <>
              Will your PC <span className="text-gradient-red">survive</span> or{' '}
              <span className="text-gradient-blue">thrive?</span>
            </>
          )}
        </h1>

        {/* Subtitle */}
        <p className="hero-subtitle">
          {userState === 'loggedIn'
            ? "We've got your specs saved. Search any game to see instant performance predictions."
            : 'Stop guessing. Compare your PC hardware against 15,000+ games instantly. No account required to check.'}
        </p>

        {/* Search Bar */}
        <div className="search-wrapper">
          <Search className="search-icon" size={20} />

          <input
            type="text"
            className="search-input"
            placeholder="Search game title (e.g., Cyberpunk 2077)..."
          />

          <button className="search-btn">Check</button>
        </div>

        {/* Guest Features Footer */}
        {userState === 'guest' && (
          <div className="guest-features">
            <div className="feature-item">
              <Gauge size={16} />
              <span>Accurate FPS Estimates</span>
            </div>
            <span className="separator">|</span>
            <div className="feature-item">
              <Monitor size={16} />
              <span>Auto-Detect Hardware</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import { Menu } from 'lucide-react';
import './MainHeader.css';

export const MainHeader = () => {
  return (
    <header className="main-header">
      <div className="header-content">
        {/* Logo */}
        <div className="header-logo">
          <div className="logo-icon-box">
            <img src="./favicon.ico" alt="Logo" width={24} height={24} />
          </div>
          <span className="logo-text">
            Can I <span className="text-highlight">Run It?</span>
          </span>
        </div>

        {/* Desktop Links */}
        <nav className="header-nav-desktop">
          <a href="#" className="nav-link">
            Games
          </a>
          <a href="#" className="nav-link">
            Hardware Rank
          </a>
          <a href="#" className="nav-link">
            About
          </a>
        </nav>

        {/* Right Side / Auth */}
        <div className="header-actions">
          {/* Mobile Menu Toggle */}
          <button className="mobile-menu-btn">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </header>
  );
};

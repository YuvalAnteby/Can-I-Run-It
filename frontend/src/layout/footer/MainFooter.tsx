import './MainFooter.css';

export const MainFooter = () => {
  return (
    <footer className="main-footer">
      <div className="main-footer-content">
        <p className="main-footer-copyright">
          &copy; 2026 Can I Run It? Project
        </p>

        <div className="main-footer-nav">
          <a href="#" className="main-footer-link">
            Privacy
          </a>
          <a href="#" className="main-footer-link">
            Terms
          </a>
          <a href="#" className="main-footer-link">
            API
          </a>
        </div>
      </div>
    </footer>
  );
};

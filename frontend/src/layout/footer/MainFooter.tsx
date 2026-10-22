import { NavLink } from 'react-router-dom';

const linkClass =
  'inline-block py-2 rounded-sm no-underline text-gray-300 transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-page';

export const MainFooter = (): React.ReactElement => {
  return (
    <footer className="border-t border-gray-800 bg-page">
      <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col-reverse items-center gap-x-6 gap-y-1 text-sm text-gray-400 text-center md:flex-row md:justify-between md:text-left">
        <p className="m-0">
          &copy; {new Date().getFullYear()} Can I Run It? · Built by{' '}
          <a
            href="https://yuvalanteby.github.io/portfolio/"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Yuval Anteby
          </a>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-6">
          <nav aria-label="Footer">
            <ul className="list-none m-0 p-0 flex items-center gap-x-6">
              <li>
                <NavLink to="/about" className={linkClass}>
                  About
                </NavLink>
              </li>
              {/* TODO: Add a Privacy link once the /privacy page exists (no accounts/cookies, Gemini processing, log retention) */}
              <li>
                <a
                  href="https://github.com/YuvalAnteby/Can-I-Run-It"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  GitHub
                </a>
              </li>
            </ul>
          </nav>
          {/* RAWG API terms require a visible link back to RAWG wherever its data is shown */}
          <p className="m-0">
            Game data by{' '}
            <a
              href="https://rawg.io"
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} underline`}
            >
              RAWG
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Nav items for the main header.
 *
 * `to` is '#' for routes that don't exist yet — clicks are intentionally
 * blocked. Update `to` and remove the `comingSoon` flag once the page is
 * created and wired up in router.tsx.
 */
interface NavItem {
  label: string;
  to: string;
  comingSoon: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', to: '/', comingSoon: false },
  // TODO: Change to '/games' and remove comingSoon once the Games page is created
  { label: 'Games', to: '#', comingSoon: true },
  // TODO: Change to '/hardware-rank' and remove comingSoon once Hardware Rank page is created
  { label: 'Hardware Rank', to: '#', comingSoon: true },
  { label: 'About', to: '/about', comingSoon: false },
];

export const MainHeader = (): React.ReactElement => {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  const getDesktopLinkClass = ({ isActive }: { isActive: boolean }): string =>
    isActive
      ? 'rounded-sm text-sm font-medium text-blue-500 bg-transparent border-0 p-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#161b22]'
      : 'rounded-sm text-sm font-medium text-gray-300 bg-transparent border-0 p-0 cursor-pointer transition-colors duration-150 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#161b22]';

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#161b22] border-b border-gray-800">
        <div className="max-w-6xl h-16 mx-auto px-4 flex items-center justify-between">
          {/* Logo — navigates home */}
          <NavLink
            to="/"
            className="flex items-center gap-2 no-underline text-inherit transition-colors duration-300 active:scale-[0.98]"
            aria-label="Go to home"
          >
            <div className="rounded flex items-center justify-center">
              <img src="/favicon.ico" alt="Logo" width={32} height={32} />
            </div>
            <span className="text-xl font-bold text-white -tracking-tight">
              <span className="text-sky-400">an I</span> Run It?
            </span>
          </NavLink>

          {/* Desktop Links */}
          <nav
            className="hidden md:flex items-center gap-8"
            aria-label="Main navigation"
          >
            {NAV_ITEMS.map((item) =>
              item.comingSoon ? (
                <button
                  type="button"
                  key={item.label}
                  className="text-sm font-medium text-gray-500 cursor-not-allowed select-none bg-transparent border-0 p-0"
                  title="Coming soon"
                  aria-disabled="true"
                  // TODO: Change to <NavLink> once the route exists in router.tsx
                  onClick={(event) => event.preventDefault()}
                >
                  {item.label}
                </button>
              ) : (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={getDesktopLinkClass}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {/* TODO: Add Login / Define Rig buttons once auth module is implemented */}

            {/* Mobile Menu Toggle */}
            <button
              className="block md:hidden bg-transparent border-0 text-gray-300 cursor-pointer p-1"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer — rendered below the sticky header */}
      {mobileOpen && (
        <>
          {/* Click-outside overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          <nav
            className="fixed top-16 left-0 right-0 z-[49] bg-[#161b22] border-b border-gray-800 px-6 py-4 flex flex-col gap-1 animate-drawer-slide-down md:hidden"
            aria-label="Mobile navigation"
          >
            {NAV_ITEMS.map((item) =>
              item.comingSoon ? (
                <button
                  type="button"
                  key={item.label}
                  className="flex items-center gap-2 py-3 px-2 text-base font-medium text-gray-600 bg-transparent border-0 w-full rounded-md cursor-not-allowed select-none"
                  aria-disabled="true"
                  // TODO: Change to <NavLink> once the route exists in router.tsx
                  onClick={(event) => event.preventDefault()}
                >
                  {item.label}
                  <span className="ml-auto text-[0.65rem] font-bold px-[0.4rem] py-[0.1rem] rounded bg-blue-500/15 text-blue-400 tracking-[0.05em] uppercase">
                    Soon
                  </span>
                </button>
              ) : (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive
                      ? 'flex items-center gap-2 py-3 px-2 text-base font-medium text-blue-500 bg-blue-500/10 no-underline w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
                      : 'flex items-center gap-2 py-3 px-2 text-base font-medium text-gray-300 bg-transparent no-underline w-full rounded-md transition-colors duration-150 hover:bg-blue-500/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
        </>
      )}
    </>
  );
};

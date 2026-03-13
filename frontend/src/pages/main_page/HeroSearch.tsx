import { Gauge, Monitor, Search } from 'lucide-react';
import { useEffect, useReducer, useRef } from 'react';
import type { ReactElement } from 'react';

import type { ClientGameDto } from '../../@types/game.types';
import { useGameSearch } from './useGameSearch';

// TODO: Re-add HeroSearchProps with userState / user props once the auth module
// is implemented and the logged-in variant of the hero section is needed.

interface SearchState {
  query: string;
  dropdownOpen: boolean;
}

type SearchAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'CLOSE_DROPDOWN' }
  | { type: 'SELECT_GAME'; payload: string };

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'SET_QUERY':
      return {
        query: action.payload,
        dropdownOpen: action.payload.trim().length > 0,
      };
    case 'CLOSE_DROPDOWN':
      return { ...state, dropdownOpen: false };
    case 'SELECT_GAME':
      return { query: action.payload, dropdownOpen: false };
  }
}

export const HeroSearch = (): ReactElement => {
  const [{ query, dropdownOpen }, dispatch] = useReducer(searchReducer, {
    query: '',
    dropdownOpen: false,
  });

  const { results, isLoading, isError } = useGameSearch(query);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        dispatch({ type: 'CLOSE_DROPDOWN' });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (game: ClientGameDto): void => {
    // TODO: Navigate to /games/:slug once the Game detail page is created
    dispatch({ type: 'SELECT_GAME', payload: game.name });
  };

  const dropdownTierClasses: Record<string, string> = {
    low: 'bg-green-500/15 text-green-400',
    medium: 'bg-yellow-500/15 text-yellow-400',
    high: 'bg-orange-500/15 text-orange-400',
    extreme: 'bg-red-500/15 text-red-400',
  };

  return (
    <div className="relative bg-[#0f1115] overflow-hidden pt-[80px] pb-[100px] px-5 text-center">
      <div className="absolute inset-0 [background:radial-gradient(circle_at_top,#1c232b_0%,#0f1115_70%)] z-0"></div>

      <div className="relative z-10 max-w-[900px] mx-auto">
        {/* Main Heading */}
        <h1 className="text-[2.5rem] md:text-[3.5rem] font-extrabold text-white/[0.87] m-0 mb-5 leading-[1.1] tracking-[-1px]">
          Will your PC{' '}
          <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            survive
          </span>{' '}
          or{' '}
          <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            thrive?
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-white/60 m-0 mx-auto mb-10 max-w-[650px] leading-relaxed">
          Stop guessing. Compare your PC hardware against 15,000+ games
          instantly. No account required to check.
        </p>

        {/* Search Bar */}
        <div className="relative max-w-[600px] mx-auto" ref={wrapperRef}>
          <div className="relative group/searchbar">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none transition-colors duration-200 group-focus-within/searchbar:text-blue-500"
              size={20}
            />
            <input
              type="text"
              className="w-full py-4 pl-[45px] pr-4 md:py-5 md:pl-[50px] md:pr-[120px] bg-[#161b22] border-2 border-[#30363d] rounded-xl text-white/[0.87] text-base md:text-[1.1rem] outline-none transition-all duration-200 focus:border-blue-500 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.15)] box-border"
              placeholder="Search game title (e.g., Cyberpunk 2077)..."
              value={query}
              onChange={(e) =>
                dispatch({ type: 'SET_QUERY', payload: e.target.value })
              }
              onFocus={() => {
                if (query.trim().length > 0) {
                  dispatch({ type: 'SET_QUERY', payload: query });
                }
              }}
              aria-label="Search for a game"
              aria-expanded={dropdownOpen}
              aria-autocomplete="list"
              autoComplete="off"
            />
            <button
              className="absolute right-[10px] top-[10px] bottom-[10px] px-6 bg-blue-600 text-white border-0 rounded-lg font-bold cursor-pointer transition-colors duration-200 hover:bg-blue-500 max-md:hidden"
              type="button"
              // TODO: Navigate to the check page once the Game detail page is created
              onClick={() => dispatch({ type: 'CLOSE_DROPDOWN' })}
            >
              Check
            </button>
          </div>

          {/* Search Dropdown */}
          {dropdownOpen && (
            <ul
              className="absolute top-[calc(100%+6px)] left-0 right-0 z-[100] m-0 py-1.5 list-none bg-[#1c2330] border border-[#30363d] rounded-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden animate-dropdown-fade"
              role="listbox"
              aria-label="Search results"
            >
              {isLoading && (
                <div className="flex flex-col gap-1 px-1.5 py-1">
                  {[1, 2, 3].map((i) => (
                    <li
                      key={i}
                      className="h-[40px] w-full bg-white/5 rounded-md animate-pulse flex items-center px-3 gap-3"
                    >
                      <div className="h-3 w-2/3 bg-white/10 rounded" />
                      <div className="h-3 w-12 bg-white/10 rounded ml-auto" />
                    </li>
                  ))}
                </div>
              )}

              {isError && (
                <li className="px-4 py-3 text-sm text-red-400 text-left">
                  Something went wrong. Please try again.
                </li>
              )}

              {!isLoading && !isError && results.length === 0 && (
                <li className="px-4 py-3 text-sm text-gray-400 text-left">
                  No games found for &ldquo;{query}&rdquo;
                </li>
              )}

              {!isLoading &&
                !isError &&
                results.map((game) => (
                  <li key={game.id}>
                    <button
                      type="button"
                      className="flex items-center justify-between w-full px-4 py-2.5 bg-transparent border-0 text-left cursor-pointer transition-colors duration-[0.12s] gap-3 hover:bg-blue-500/10"
                      onClick={() => handleSelect(game)}
                      role="option"
                      aria-selected={false}
                    >
                      <span className="text-[0.9375rem] text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">
                        {game.name}
                      </span>
                      {game.requirementTier && (
                        <span
                          className={`shrink-0 text-[0.7rem] font-bold px-[0.45rem] py-[0.1rem] rounded uppercase tracking-[0.04em] ${dropdownTierClasses[game.requirementTier.toLowerCase()]}`}
                        >
                          {game.requirementTier}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Guest Features */}
        <div className="mt-8 flex justify-center gap-5 text-white/60 text-[0.9rem]">
          <div className="flex items-center gap-1.5">
            <Gauge size={16} />
            <span>Accurate FPS Estimates</span>
          </div>
          <span>|</span>
          <div className="flex items-center gap-1.5">
            <Monitor size={16} />
            <span>Auto-Detect Hardware</span>
          </div>
        </div>
      </div>
    </div>
  );
};

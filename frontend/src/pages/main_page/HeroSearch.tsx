import { Search } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useReducer, useRef } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';

import type {
  GameSearchResult,
  RawgSelectionResponse,
} from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';
import { useGameSearch } from './useGameSearch';

// TODO: Re-add HeroSearchProps with userState / user props once the auth module
// is implemented and the logged-in variant of the hero section is needed.

interface SearchState {
  query: string;
  dropdownOpen: boolean;
  /** Keyboard-highlighted result, -1 when none */
  activeIndex: number;
}

type SearchAction =
  | { type: 'SET_QUERY'; payload: string }
  | { type: 'CLOSE_DROPDOWN' }
  | { type: 'SELECT_GAME'; payload: string }
  | { type: 'SET_ACTIVE'; payload: number };

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'SET_QUERY':
      return {
        query: action.payload,
        dropdownOpen: action.payload.trim().length > 0,
        activeIndex: -1,
      };
    case 'CLOSE_DROPDOWN':
      return { ...state, dropdownOpen: false, activeIndex: -1 };
    case 'SELECT_GAME':
      return { query: action.payload, dropdownOpen: false, activeIndex: -1 };
    case 'SET_ACTIVE':
      return { ...state, activeIndex: action.payload };
    default:
      return state;
  }
}

export const HeroSearch = (): ReactElement => {
  const navigate = useNavigate();
  const [{ query, dropdownOpen, activeIndex }, dispatch] = useReducer(
    searchReducer,
    { query: '', dropdownOpen: false, activeIndex: -1 },
  );
  const listboxId = useId();
  const optionId = (index: number): string => `${listboxId}-option-${index}`;
  const { results, rawgAvailable, isLoading, isError } = useGameSearch(query);
  const navigableResults = !isLoading && !isError ? results : [];
  // Results can change under a stale index after the debounce settles
  const active =
    dropdownOpen && activeIndex < navigableResults.length ? activeIndex : -1;
  const selection = useMutation<RawgSelectionResponse, Error, number>({
    mutationFn: async (rawgId: number): Promise<RawgSelectionResponse> => {
      try {
        const response = await nestClient.post<RawgSelectionResponse>(
          `/v2/games/rawg/${rawgId}/select`,
        );
        return response.data;
      } catch {
        throw new Error('Could not select this RAWG game. Please try again.');
      }
    },
  });
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

  const handleSelect = (game: GameSearchResult): void => {
    if (game.source === 'local') {
      dispatch({ type: 'SELECT_GAME', payload: game.name });
      void navigate(`/games/${game.slug}`);
      return;
    }

    selection.mutate(game.rawgId, {
      onSuccess: (selected) => {
        dispatch({ type: 'SELECT_GAME', payload: game.name });
        void navigate(
          selected.status === 'published'
            ? `/games/${selected.slug}`
            : `/pending-games/${selected.id}`,
        );
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      dispatch({ type: 'CLOSE_DROPDOWN' });
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    // ArrowDown opens a closed list (non-empty query only); ArrowUp only moves within an open one
    if (!dropdownOpen && (e.key === 'ArrowUp' || query.trim().length === 0))
      return;
    e.preventDefault();
    const count = navigableResults.length;
    if (count === 0) return;
    if (!dropdownOpen) dispatch({ type: 'SET_QUERY', payload: query });
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next =
      active === -1
        ? step === 1
          ? 0
          : count - 1
        : (active + step + count) % count;
    dispatch({ type: 'SET_ACTIVE', payload: next });
    document
      .getElementById(optionId(next))
      ?.scrollIntoView?.({ block: 'nearest' });
  };

  return (
    <div className="relative bg-page pt-[80px] pb-[100px] px-5 text-center">
      <div className="absolute inset-0 [background:radial-gradient(circle_at_top,var(--color-surface-raised)_0%,var(--color-page)_70%)] z-0"></div>

      <div className="relative z-10 max-w-[900px] mx-auto">
        {/* Main Heading */}
        <h1 className="text-[2.5rem] md:text-[3.5rem] font-extrabold text-white/[0.87] m-0 mb-5 leading-[1.1] tracking-[-1px]">
          Can I run it?
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-white/60 m-0 mx-auto mb-10 max-w-[650px] leading-relaxed">
          Stop guessing!
          <br />
          Compare your PC hardware against 15,000+ games instantly.
          <br />
          No account required to check.
        </p>

        {/* Search Bar */}
        <div className="relative max-w-[600px] mx-auto" ref={wrapperRef}>
          <form
            className="relative group/searchbar"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              // Enter / Check picks the highlighted (or top) result; nothing to pick just closes the list
              const picked = navigableResults[Math.max(active, 0)];
              if (picked) handleSelect(picked);
              else dispatch({ type: 'CLOSE_DROPDOWN' });
            }}
          >
            <Search
              aria-hidden="true"
              className="absolute left-5 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none transition-colors duration-200 group-focus-within/searchbar:text-blue-500"
              size={20}
            />
            <input
              type="text"
              className="w-full py-4 pl-[45px] pr-4 md:py-5 md:pl-[50px] bg-surface border-2 border-line rounded-xl text-white/[0.87] text-base md:text-[1.1rem] outline-none transition-all duration-200 focus:border-blue-500 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.15)] box-border"
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
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-label="Search for a game"
              aria-expanded={dropdownOpen}
              aria-controls={dropdownOpen ? listboxId : undefined}
              aria-activedescendant={active >= 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              autoComplete="off"
            />
          </form>

          {/* Search Dropdown */}
          {dropdownOpen && (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute top-[calc(100%+6px)] left-0 right-0 z-[100] m-0 max-h-[60vh] overflow-y-auto py-1.5 list-none bg-surface-raised border border-line rounded-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-dropdown-fade"
              aria-label="Search results"
            >
              {isLoading &&
                [1, 2, 3].map((i) => (
                  <li
                    key={i}
                    className="h-[40px] w-full bg-white/5 rounded-md animate-pulse flex items-center px-4 gap-3 mx-0 my-1"
                    role="presentation"
                  >
                    <div className="h-3 w-2/3 bg-white/10 rounded" />
                    <div className="h-3 w-12 bg-white/10 rounded ml-auto" />
                  </li>
                ))}

              {isError && (
                <li
                  role="presentation"
                  className="px-4 py-3 text-sm text-red-400 text-left"
                >
                  Something went wrong. Please try again.
                </li>
              )}

              {!isLoading && !isError && !rawgAvailable && (
                <li
                  role="presentation"
                  className="px-4 py-2 text-xs text-amber-300 text-left"
                >
                  RAWG unavailable. Local results are still available.
                </li>
              )}

              {!isLoading && !isError && results.length === 0 && (
                <li
                  role="presentation"
                  className="px-4 py-3 text-sm text-gray-400 text-left"
                >
                  No games found for &ldquo;{query}&rdquo;
                </li>
              )}

              {!isLoading &&
                !isError &&
                results.map((game, index) => (
                  <li
                    key={
                      game.source === 'local'
                        ? `local-${game.id}`
                        : `rawg-${game.rawgId}`
                    }
                    role="presentation"
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <button
                      type="button"
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      className="flex items-center min-w-0 flex-1 bg-transparent border-0 text-left cursor-pointer transition-colors duration-[0.12s] gap-3 hover:bg-blue-500/10 aria-selected:bg-blue-500/10"
                      aria-label={`Select ${game.name}`}
                      onClick={() => handleSelect(game)}
                      disabled={selection.isPending}
                    >
                      <span className="text-[0.9375rem] text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">
                        {game.name}
                      </span>
                      {game.source === 'local' && (
                        <span className="text-xs text-gray-400 shrink-0">
                          Local
                        </span>
                      )}
                    </button>
                    {game.source === 'rawg' && (
                      <a
                        href={game.rawgUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="RAWG"
                        className="text-xs text-blue-300 underline shrink-0"
                      >
                        RAWG
                      </a>
                    )}
                    {game.source === 'local' &&
                      game.attributions?.map((attribution) => (
                        <a
                          key={attribution.source}
                          href={attribution.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${attribution.label} source`}
                          className="text-xs text-blue-300 underline shrink-0"
                        >
                          Source: {attribution.label}
                        </a>
                      ))}
                  </li>
                ))}
            </ul>
          )}
          {selection.isError && (
            <p role="alert" className="mt-2 text-sm text-red-400 text-left">
              {selection.error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

import { Search } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useReducer, useRef } from 'react';
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
    default:
      return state;
  }
}

export const HeroSearch = (): ReactElement => {
  const navigate = useNavigate();
  const [{ query, dropdownOpen }, dispatch] = useReducer(searchReducer, {
    query: '',
    dropdownOpen: false,
  });
  const { results, rawgAvailable, isLoading, isError } = useGameSearch(query);
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

  return (
    <div className="relative bg-[#0f1115] pt-[80px] pb-[100px] px-5 text-center">
      <div className="absolute inset-0 [background:radial-gradient(circle_at_top,#1c232b_0%,#0f1115_70%)] z-0"></div>

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
              className="absolute top-[calc(100%+6px)] left-0 right-0 z-[100] m-0 max-h-[60vh] overflow-y-auto py-1.5 list-none bg-[#1c2330] border border-[#30363d] rounded-[10px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-dropdown-fade"
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
                <li className="px-4 py-3 text-sm text-red-400 text-left">
                  Something went wrong. Please try again.
                </li>
              )}

              {!isLoading && !isError && !rawgAvailable && (
                <li className="px-4 py-2 text-xs text-amber-300 text-left">
                  RAWG unavailable. Local results are still available.
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
                  <li
                    key={
                      game.source === 'local'
                        ? `local-${game.id}`
                        : `rawg-${game.rawgId}`
                    }
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <button
                      type="button"
                      className="flex items-center min-w-0 flex-1 bg-transparent border-0 text-left cursor-pointer transition-colors duration-[0.12s] gap-3 hover:bg-blue-500/10"
                      onClick={() => handleSelect(game)}
                      disabled={selection.isPending}
                    >
                      <span className="text-[0.9375rem] text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis">
                        {game.name}
                      </span>
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

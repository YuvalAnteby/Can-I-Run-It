import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ClientGameDto } from '../../@types/game.types';
import { PLACEHOLDER_GAMES } from '../../data/placeholderGames';

/**
 * TODO: Once the NestJS games module exists, delete `searchPlaceholderGames`
 * and replace it with a real API call:
 *
 *   import { nestClient } from '../../api/nestClient';
 *
 *   const fetchGameSearch = (q: string): Promise<ClientGameDto[]> =>
 *     nestClient
 *       .get<ClientGameDto[]>('/games/search', { params: { q } })
 *       .then((r) => r.data);
 *
 * Then swap `queryFn: () => searchPlaceholderGames(trimmed)` below for
 * `queryFn: () => fetchGameSearch(trimmed)`.
 */
const searchPlaceholderGames = (q: string): Promise<ClientGameDto[]> =>
  Promise.resolve(
    PLACEHOLDER_GAMES.filter((g) =>
      g.name.toLowerCase().includes(q.toLowerCase()),
    ),
  );

interface UseGameSearchResult {
  results: ClientGameDto[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Debounced game search hook.
 *
 * Accepts a raw query string, debounces it by 300 ms, then queries
 * the game search function. Currently backed by placeholder data —
 * see the TODO above for how to swap in the real endpoint.
 */
export function useGameSearch(rawQuery: string): UseGameSearchResult {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(rawQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const trimmed = debouncedQuery.trim();

  const { data, isLoading, isError } = useQuery<ClientGameDto[]>({
    queryKey: ['games', 'search', trimmed] as const,
    queryFn: () => searchPlaceholderGames(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });

  return { results: data ?? [], isLoading, isError };
}

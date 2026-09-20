import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type {
  GameDiscoveryResponse,
  GameSearchResult,
} from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';

const fetchGameSearch = (q: string): Promise<GameDiscoveryResponse> =>
  nestClient
    .get<GameDiscoveryResponse>('/v2/games/discover', { params: { q } })
    .then((r) => r.data);

interface UseGameSearchResult {
  results: GameSearchResult[];
  rawgAvailable: boolean;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Debounced game search hook.
 *
 * Accepts a raw query string, debounces it by 300 ms, then queries
 * the v2 games search function on the backend.
 */
export function useGameSearch(rawQuery: string): UseGameSearchResult {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(rawQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const trimmed = debouncedQuery.trim();

  const { data, isLoading, isError } = useQuery<GameDiscoveryResponse>({
    queryKey: ['games', 'search', trimmed] as const,
    queryFn: () => fetchGameSearch(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });

  return {
    results: data?.data ?? [],
    rawgAvailable: data?.rawgAvailable ?? true,
    isLoading,
    isError,
  };
}

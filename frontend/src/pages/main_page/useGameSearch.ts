import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ClientGameDto } from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';

const fetchGameSearch = (q: string): Promise<ClientGameDto[]> =>
  nestClient
    .get<ClientGameDto[]>('/v1/games/mock/search', { params: { q } })
    .then((r) => r.data);

interface UseGameSearchResult {
  results: ClientGameDto[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Debounced game search hook.
 *
 * Accepts a raw query string, debounces it by 300 ms, then queries
 * the mock game search function on the backend.
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
    queryFn: () => fetchGameSearch(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });

  return { results: data ?? [], isLoading, isError };
}

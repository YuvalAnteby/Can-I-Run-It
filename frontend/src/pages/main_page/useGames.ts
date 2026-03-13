import { useQuery } from '@tanstack/react-query';

import type { PaginatedGamesResult } from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';

const fetchGames = (limit: number = 20): Promise<PaginatedGamesResult> =>
  nestClient
    .get<PaginatedGamesResult>('/v2/games', { params: { limit } })
    .then((r) => r.data);

interface UseGamesResult {
  games: PaginatedGamesResult['data'];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Hook to fetch the first page of games from the real database.
 * Used for the main page carousels.
 */
export function useGames(limit: number = 20): UseGamesResult {
  const { data, isLoading, isError } = useQuery<PaginatedGamesResult>({
    queryKey: ['games', 'paged', limit],
    queryFn: () => fetchGames(limit),
    staleTime: 60_000,
  });

  return {
    games: data?.data ?? [],
    isLoading,
    isError,
  };
}

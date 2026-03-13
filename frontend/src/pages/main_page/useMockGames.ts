import { useQuery } from '@tanstack/react-query';

import type { ClientGameDto } from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';

const fetchMockGames = (): Promise<ClientGameDto[]> =>
  nestClient.get<ClientGameDto[]>('/v1/games/mock').then((r) => r.data);

interface UseMockGamesResult {
  games: ClientGameDto[];
  isLoading: boolean;
  isError: boolean;
}

export function useMockGames(): UseMockGamesResult {
  const { data, isLoading, isError } = useQuery<ClientGameDto[]>({
    queryKey: ['games', 'mock'],
    queryFn: fetchMockGames,
    staleTime: 60_000,
  });

  return { games: data ?? [], isLoading, isError };
}

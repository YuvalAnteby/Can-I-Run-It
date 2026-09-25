import { useQuery } from '@tanstack/react-query';
import { ClientGameDto } from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';

export type GameDetailTarget = string | { pendingId: number } | undefined;

export function useGameDetail(target: GameDetailTarget) {
  const pendingId = typeof target === 'object' ? target.pendingId : undefined;
  const slug = typeof target === 'string' ? target : undefined;

  return useQuery<ClientGameDto>({
    queryKey: [
      'gameDetail',
      pendingId ? 'pending' : 'published',
      pendingId ?? slug,
    ],
    queryFn: async () => {
      if (pendingId) {
        const response = await nestClient.get<ClientGameDto>(
          `/v2/games/pending/${pendingId}`,
        );
        return response.data;
      }
      if (!slug) throw new Error('Game slug is required');
      const response = await nestClient.get<ClientGameDto>(`/v2/games/${slug}`);
      return response.data;
    },
    enabled: Boolean(slug || pendingId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: pendingId !== undefined ? 'always' : undefined,
  });
}

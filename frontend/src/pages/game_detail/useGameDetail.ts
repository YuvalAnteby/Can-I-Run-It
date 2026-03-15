import { useQuery } from '@tanstack/react-query';
import { ClientGameDto } from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';

export function useGameDetail(slug: string | undefined) {
  return useQuery<ClientGameDto>({
    queryKey: ['gameDetail', slug],
    queryFn: async () => {
      if (!slug) throw new Error('Game slug is required');
      const response = await nestClient.get<ClientGameDto>(`/v2/games/${slug}`);
      return response.data;
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

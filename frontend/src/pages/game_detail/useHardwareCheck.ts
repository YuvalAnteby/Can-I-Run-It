import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import type { CheckRequest, CheckResponse } from '../../@types/check.types';
import type { GameStatus } from '../../@types/game.types';
import { nestClient } from '../../api/nestClient';

export interface HardwareCheckTarget {
  gameId: number;
  status: GameStatus;
  slug?: string;
}

export function useHardwareCheck(target?: HardwareCheckTarget) {
  return useMutation<CheckResponse, Error, CheckRequest>({
    mutationFn: async (req: CheckRequest) => {
      try {
        const isPending = target?.status === 'pending_approval';
        const path = isPending
          ? `/v2/check/pending/${target.gameId}`
          : '/v1/check';
        const body = isPending
          ? { hardware: req.hardware, settings: req.settings }
          : { ...req, gameSlug: target?.slug ?? req.gameSlug };
        const response = await nestClient.post<CheckResponse>(path, body);
        return response.data;
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 429) {
            throw new Error(
              'Too many compatibility checks. Please wait a minute and try again.',
            );
          }

          if (
            !error.response ||
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT'
          ) {
            throw new Error(
              'The compatibility check timed out. Please try again.',
            );
          }
        }

        throw new Error("We couldn't check compatibility. Please try again.");
      }
    },
  });
}

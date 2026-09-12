import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { CheckRequest, CheckResponse } from '../../@types/check.types';
import { nestClient } from '../../api/nestClient';

export function useHardwareCheck() {
  return useMutation<CheckResponse, Error, CheckRequest>({
    mutationFn: async (req: CheckRequest) => {
      try {
        const response = await nestClient.post<CheckResponse>('/v1/check', req);
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

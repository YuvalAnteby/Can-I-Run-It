import { useMutation } from '@tanstack/react-query';
import { CheckRequest, CheckResponse } from '../../@types/check.types';
import { nestClient } from '../../api/nestClient';

export function useHardwareCheck() {
  return useMutation<CheckResponse, Error, CheckRequest>({
    mutationFn: async (req: CheckRequest) => {
      const response = await nestClient.post<CheckResponse>('/v1/check', req);
      return response.data;
    },
  });
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ClientCpuDto, PaginatedCpusResult } from '../../@types/cpu.types';
import type { ClientGpuDto, PaginatedGpusResult } from '../../@types/gpu.types';
import { nestClient } from '../../api/nestClient';

const fetchCpuInitial = (): Promise<ClientCpuDto[]> =>
  nestClient
    .get<PaginatedCpusResult>('v1/cpus', { params: { limit: 50 } })
    .then((r) => r.data.data);

const fetchCpuSearch = (q: string): Promise<ClientCpuDto[]> =>
  nestClient
    .get<ClientCpuDto[]>('v1/cpus/search', { params: { q } })
    .then((r) => r.data);

const fetchGpuInitial = (): Promise<ClientGpuDto[]> =>
  nestClient
    .get<PaginatedGpusResult>('v1/gpus', { params: { limit: 50 } })
    .then((r) => r.data.data);

const fetchGpuSearch = (q: string): Promise<ClientGpuDto[]> =>
  nestClient
    .get<ClientGpuDto[]>('v1/gpus/search', { params: { q } })
    .then((r) => r.data);

interface HardwareSearchResult<T> {
  results: T[];
  isLoading: boolean;
  isError: boolean;
}

export function useCpuSearch(
  query: string,
): HardwareSearchResult<ClientCpuDto> {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = debouncedQuery.trim();

  const { data, isLoading, isError } = useQuery<ClientCpuDto[]>({
    queryKey: ['cpus', 'search', trimmed] as const,
    queryFn: () =>
      trimmed.length > 0 ? fetchCpuSearch(trimmed) : fetchCpuInitial(),
    staleTime: 60_000,
  });

  return { results: data ?? [], isLoading, isError };
}

export function useGpuSearch(
  query: string,
): HardwareSearchResult<ClientGpuDto> {
  const [debouncedQuery, setDebouncedQuery] = useState<string>(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = debouncedQuery.trim();

  const { data, isLoading, isError } = useQuery<ClientGpuDto[]>({
    queryKey: ['gpus', 'search', trimmed] as const,
    queryFn: () =>
      trimmed.length > 0 ? fetchGpuSearch(trimmed) : fetchGpuInitial(),
    staleTime: 60_000,
  });

  return { results: data ?? [], isLoading, isError };
}

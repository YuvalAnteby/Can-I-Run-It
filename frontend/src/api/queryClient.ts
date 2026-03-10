import { QueryClient } from '@tanstack/react-query';

/**
 * Shared React Query client used across the entire app.
 *
 * Configuration rationale:
 *  - staleTime 60 s  → avoid redundant re-fetches on tab focus / re-mount.
 *  - retry 1          → one automatic retry on failure; keeps UX snappy.
 *  - refetchOnWindowFocus false → less aggressive for a gaming-tool SPA
 *    where data doesn't change while the user is away.
 */
export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

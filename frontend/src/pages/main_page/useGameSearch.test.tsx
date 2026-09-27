import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { server } from '../../mocks/server';
import { useGameSearch } from './useGameSearch';

const DISCOVER_URL = 'http://localhost:4000/api/v2/games/discover';

const localResult = {
  source: 'local' as const,
  id: 7,
  slug: 'local-game',
  name: 'Local Game',
  coverImageUrl: null,
};

const rawgResult = {
  source: 'rawg' as const,
  rawgId: 3498,
  name: 'RAWG Game',
  coverImageUrl: null,
  rawgUrl: 'https://rawg.io/games/rawg-game',
};

function makeWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useGameSearch', () => {
  it('queries the read-only discovery endpoint with a trimmed title and keeps source identities', async () => {
    let requestedQuery = '';
    server.use(
      http.get(DISCOVER_URL, ({ request }) => {
        requestedQuery = new URL(request.url).searchParams.get('q') ?? '';
        return HttpResponse.json({
          data: [localResult, rawgResult],
          rawgAvailable: true,
        });
      }),
    );

    const { result } = renderHook(() => useGameSearch('  mixed title  '), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(requestedQuery).toBe('mixed title');
    expect(result.current.results).toEqual([localResult, rawgResult]);
    expect(
      (result.current.results as unknown as Array<{ source: string }>).map(
        (row) => row.source,
      ),
    ).toEqual(['local', 'rawg']);
  });

  it('returns local results and exposes provider unavailability without treating it as a search error', async () => {
    server.use(
      http.get(DISCOVER_URL, () =>
        HttpResponse.json({ data: [localResult], rawgAvailable: false }),
      ),
    );

    const { result } = renderHook(() => useGameSearch('local'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.results).toEqual([localResult]));
    const state = result.current as typeof result.current & {
      rawgAvailable: boolean;
    };
    expect(state.rawgAvailable).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});

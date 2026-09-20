import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { server } from '../../mocks/server';
import type { ClientGameDto } from '../../@types/game.types';
import { useGameDetail } from './useGameDetail';

const pendingGame = {
  id: 42,
  slug: 'issue-66-pending',
  name: 'Issue 66 Pending Game',
  status: 'pending_approval' as const,
  coverImageUrl: null,
  releaseDate: null,
  developer: null,
  publisher: null,
  genre: null,
  description: null,
  tags: [],
  supportsRayTracing: false,
  supportsDlss: false,
  supportsFsr: false,
  supportsXeSS: false,
  isTrending: false,
  trendingRank: null,
  requirements: [],
} as unknown as ClientGameDto;

function makeWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useGameDetail pending route', () => {
  it('fetches pending detail by internal id and retains normalized status', async () => {
    server.use(
      http.get('http://localhost:4000/api/v2/games/pending/42', () =>
        HttpResponse.json(pendingGame),
      ),
    );
    const hook = useGameDetail as unknown as (target: {
      pendingId: number;
    }) => ReturnType<typeof useGameDetail>;

    const { result } = renderHook(() => hook({ pendingId: 42 }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toMatchObject({
      id: 42,
      status: 'pending_approval',
      slug: 'issue-66-pending',
    });
  });
});

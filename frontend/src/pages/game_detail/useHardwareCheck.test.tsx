import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { Hardware, Settings } from '../../@types/check.types';
import { server } from '../../mocks/server';
import { useHardwareCheck } from './useHardwareCheck';

const pendingRequest = {
  hardware: { cpuId: 2, gpuId: 3, ramGb: 16, isSsd: true } as Hardware,
  settings: {
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    preset: 'high',
    targetFps: 60,
  } as Settings,
};

function makeWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useHardwareCheck route selection', () => {
  it('posts pending checks by internal game id without sending a slug', async () => {
    let requestedPath = '';
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post(
        'http://localhost:4000/api/v2/check/pending/42',
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          requestBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            state: 'can',
            verdict: 'Likely can run',
            sub: 'AI estimate',
            source: 'ai',
            provider: 'gemini',
            confidence: 'medium',
            targetFps: 60,
            fps: { low: 80, med: 70, high: 60, ultra: 45 },
            gpuPass: true,
            cpuPass: true,
            ramPass: true,
            vramPass: true,
            ssdPass: true,
            notes: [],
          });
        },
      ),
    );
    const hook = useHardwareCheck as unknown as (target: {
      gameId: number;
      status: 'pending_approval';
    }) => ReturnType<typeof useHardwareCheck>;
    const { result } = renderHook(
      () => hook({ gameId: 42, status: 'pending_approval' }),
      { wrapper: makeWrapper() },
    );

    result.current.mutate(pendingRequest as never);
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toMatchObject({
      source: 'ai',
      provider: 'gemini',
    });
    expect(requestedPath).toBe('/api/v2/check/pending/42');
    expect(requestBody).not.toHaveProperty('gameSlug');
  });

  it('keeps the published slug check route after approval', async () => {
    let requestedPath = '';
    let requestBody: Record<string, unknown> | undefined;
    server.use(
      http.post('http://localhost:4000/api/v1/check', async ({ request }) => {
        requestedPath = new URL(request.url).pathname;
        requestBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          state: 'can',
          verdict: 'Can run',
          sub: 'Measured result',
          source: 'measured',
          provider: null,
          confidence: 'high',
          targetFps: 60,
          fps: { low: 110, med: 96, high: 78, ultra: 62 },
          gpuPass: true,
          cpuPass: true,
          ramPass: true,
          vramPass: true,
          ssdPass: true,
          notes: [],
        });
      }),
    );
    const hook = useHardwareCheck as unknown as (target: {
      gameId: number;
      slug: string;
      status: 'published';
    }) => ReturnType<typeof useHardwareCheck>;
    const { result } = renderHook(
      () =>
        hook({
          gameId: 42,
          slug: 'cyberpunk-2077',
          status: 'published',
        }),
      { wrapper: makeWrapper() },
    );

    result.current.mutate({
      gameSlug: 'cyberpunk-2077',
      ...pendingRequest,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toMatchObject({
      source: 'measured',
      provider: null,
    });
    expect(requestedPath).toBe('/api/v1/check');
    expect(requestBody).toHaveProperty('gameSlug', 'cyberpunk-2077');
  });
});

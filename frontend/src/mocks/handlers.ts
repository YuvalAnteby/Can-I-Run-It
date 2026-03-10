import { http, HttpResponse } from 'msw';

import type { ClientCpuDto } from '../@types/cpu.types';
import type { ClientGpuDto } from '../@types/gpu.types';

const BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'http://localhost:4000';

/**
 * MSW request handlers for unit / integration tests.
 *
 * Add a handler here for every backend endpoint your tests touch.
 * The server is configured with `onUnhandledRequest: 'error'` so any
 * request that isn't listed here will fail the test immediately.
 *
 * TODO: Add handlers for /games/search and /games once the games module exists.
 */
export const handlers = [
  /* ── CPU search ──────────────────────────────────────────────── */
  http.get(`${BASE}/cpus/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const results: ClientCpuDto[] = [
      {
        id: 1,
        slug: 'intel-core-i9-14900k',
        name: 'Intel Core i9-14900K',
        manufacturer: 'intel',
      } as ClientCpuDto,
      {
        id: 2,
        slug: 'amd-ryzen-9-7950x',
        name: 'AMD Ryzen 9 7950X',
        manufacturer: 'amd',
      } as ClientCpuDto,
    ].filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

    return HttpResponse.json(results);
  }),

  /* ── GPU search ──────────────────────────────────────────────── */
  http.get(`${BASE}/gpus/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const results: ClientGpuDto[] = [
      {
        id: 1,
        slug: 'nvidia-geforce-rtx-4090',
        name: 'GeForce RTX 4090',
        manufacturer: 'nvidia',
        vram_gb: 24,
      } as ClientGpuDto,
      {
        id: 2,
        slug: 'amd-radeon-rx-7900-xtx',
        name: 'Radeon RX 7900 XTX',
        manufacturer: 'amd',
        vram_gb: 24,
      } as ClientGpuDto,
    ].filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

    return HttpResponse.json(results);
  }),
];

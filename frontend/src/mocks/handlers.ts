import { http, HttpResponse } from 'msw';

import type { ClientCpuDto, CpuManufacturer } from '../@types/cpu.types';
import type { ClientGameDto } from '../@types/game.types';
import type { ClientGpuDto, GpuManufacturer } from '../@types/gpu.types';

const BASE =
  (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:4000';

const MOCK_GAMES: ClientGameDto[] = [
  {
    id: 10,
    slug: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    coverImageUrl: 'https://imgur.com/VDUcpgp.jpg',
    releaseDate: '2020-12-10',
    developer: 'CD PROJEKT RED',
    publisher: 'CD PROJEKT RED',
    supportsRayTracing: true,
    supportsDlss: true,
    supportsFsr: true,
    requirementTier: 'Extreme',
  },
  {
    id: 6,
    slug: 'black-myth-wukong',
    name: 'Black Myth: Wukong',
    coverImageUrl: 'https://imgur.com/yWszzjT.jpg',
    releaseDate: '2024-08-20',
    developer: 'Game Science',
    publisher: 'Game Science',
    supportsRayTracing: true,
    supportsDlss: true,
    supportsFsr: true,
    requirementTier: 'Extreme',
  },
];

/**
 * MSW request handlers for unit / integration tests.

 *
 * Add a handler here for every backend endpoint your tests touch.
 * The server is configured with `onUnhandledRequest: 'error'` so any
 * request not listed here will fail the test immediately — making
 * forgotten mocks visible right away.
 */
export const handlers = [
  /* ── Games ───────────────────────────────────────────────────── */
  http.get(`${BASE}/v1/games/mock`, () => {
    return HttpResponse.json(MOCK_GAMES);
  }),

  http.get(`${BASE}/v1/games/mock/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const results = MOCK_GAMES.filter((g) =>
      g.name.toLowerCase().includes(q.toLowerCase()),
    );
    return HttpResponse.json(results);
  }),

  /* ── CPU search ──────────────────────────────────────────────── */
  http.get(`${BASE}/v1/cpus/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const results: ClientCpuDto[] = [
      {
        id: 1,
        slug: 'intel-core-i9-14900k',
        name: 'Intel Core i9-14900K',
        manufacturer: 'intel' as CpuManufacturer,
      },
      {
        id: 2,
        slug: 'amd-ryzen-9-7950x',
        name: 'AMD Ryzen 9 7950X',
        manufacturer: 'amd' as CpuManufacturer,
      },
    ].filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

    return HttpResponse.json(results);
  }),

  /* ── GPU search ──────────────────────────────────────────────── */
  http.get(`${BASE}/v1/gpus/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const results: ClientGpuDto[] = [
      {
        id: 1,
        slug: 'nvidia-geforce-rtx-4090',
        name: 'GeForce RTX 4090',
        manufacturer: 'nvidia' as GpuManufacturer,
        vram_gb: 24,
      },
      {
        id: 2,
        slug: 'amd-radeon-rx-7900-xtx',
        name: 'Radeon RX 7900 XTX',
        manufacturer: 'amd' as GpuManufacturer,
        vram_gb: 24,
      },
    ].filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

    return HttpResponse.json(results);
  }),
];

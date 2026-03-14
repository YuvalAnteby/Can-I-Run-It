import { http, HttpResponse } from 'msw';

import type { ClientCpuDto, CpuManufacturer } from '../@types/cpu.types';
import type { ClientGameDto } from '../@types/game.types';
import type { ClientGpuDto, GpuManufacturer } from '../@types/gpu.types';

const BASE =
  (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:4000/api';

const MOCK_GAMES: ClientGameDto[] = [
  {
    id: 10,
    slug: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    coverImageUrl: 'https://imgur.com/VDUcpgp.jpg',
    releaseDate: '2020-12-10',
    developer: 'CD PROJEKT RED',
    publisher: 'CD PROJEKT RED',
    genre: 'Action RPG',
    description:
      'Cyberpunk 2077 is an open-world, action-adventure story set in Night City...',
    tags: ['ray-tracing', 'open-world', 'cpu-heavy'],
    supportsRayTracing: true,
    supportsDlss: true,
    supportsFsr: true,
    supportsXeSS: true,
    isTrending: true,
    trendingRank: 1,
  },
  {
    id: 6,
    slug: 'black-myth-wukong',
    name: 'Black Myth: Wukong',
    coverImageUrl: 'https://imgur.com/yWszzjT.jpg',
    releaseDate: '2024-08-20',
    developer: 'Game Science',
    publisher: 'Game Science',
    genre: 'Action RPG',
    description:
      'Black Myth: Wukong is an action RPG rooted in Chinese mythology...',
    tags: ['action', 'rpg', 'mythology'],
    supportsRayTracing: true,
    supportsDlss: true,
    supportsFsr: true,
    supportsXeSS: true,
    isTrending: true,
    trendingRank: 2,
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

  http.get(`${BASE}/v2/games`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? '';
    const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);
    const page = parseInt(url.searchParams.get('page') ?? '1', 10);

    const filtered = MOCK_GAMES.filter((g) =>
      g.name.toLowerCase().includes(search.toLowerCase()),
    );

    const data = filtered.slice((page - 1) * limit, page * limit);

    return HttpResponse.json({
      data,
      meta: {
        total: filtered.length,
        page,
        lastPage: Math.ceil(filtered.length / limit),
      },
    });
  }),

  http.get(`${BASE}/v2/games/:slug`, ({ params }) => {
    const { slug } = params;
    const game = MOCK_GAMES.find((g) => g.slug === slug);
    if (!game) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(game);
  }),

  /* ── CPU search ──────────────────────────────────────────────── */
  http.get(`${BASE}/v1/cpus/search`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const results: ClientCpuDto[] = [
      {
        id: 1,
        slug: 'intel-core-i9-14900k',
        name: 'Intel Core i9-14900K',
        manufacturer: 'Intel' as CpuManufacturer,
        tdp_watts: 125,
        release_year: 2023,
      },
      {
        id: 2,
        slug: 'amd-ryzen-9-7950x',
        name: 'AMD Ryzen 9 7950X',
        manufacturer: 'AMD' as CpuManufacturer,
        tdp_watts: 170,
        release_year: 2022,
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
        manufacturer: 'Nvidia' as GpuManufacturer,
        vram_gb: 24,
        shading_units: 16384,
        tdp_watts: 450,
        release_year: 2022,
      },
      {
        id: 2,
        slug: 'amd-radeon-rx-7900-xtx',
        name: 'Radeon RX 7900 XTX',
        manufacturer: 'AMD' as GpuManufacturer,
        vram_gb: 24,
        shading_units: 6144,
        tdp_watts: 355,
        release_year: 2022,
      },
    ].filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

    return HttpResponse.json(results);
  }),
];

import { http, HttpResponse } from 'msw';

import type { ClientCpuDto, CpuManufacturer } from '../@types/cpu.types';
import type { CheckRequest, CheckResponse } from '../@types/check.types';
import type { ClientGameDto } from '../@types/game.types';
import type { ClientGpuDto, GpuManufacturer } from '../@types/gpu.types';

const BASE =
  (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:4000/api';

const MOCK_GAMES: ClientGameDto[] = [
  {
    id: 10,
    slug: 'cyberpunk-2077',
    name: 'Cyberpunk 2077',
    status: 'published',
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
    requirements: [],
  },
  {
    id: 6,
    slug: 'black-myth-wukong',
    name: 'Black Myth: Wukong',
    status: 'published',
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
    requirements: [],
  },
];

type DiscoveryResult =
  | {
      source: 'local';
      id: number;
      slug: string;
      name: string;
      coverImageUrl: string | null;
    }
  | {
      source: 'rawg';
      rawgId: number;
      name: string;
      coverImageUrl: string | null;
      rawgUrl: string;
    };

const MOCK_DISCOVERY_RESULTS: DiscoveryResult[] = [
  ...MOCK_GAMES.map((game) => ({
    source: 'local' as const,
    id: game.id,
    slug: game.slug,
    name: game.name,
    coverImageUrl: game.coverImageUrl,
  })),
  {
    source: 'rawg' as const,
    rawgId: 910099,
    name: 'Issue 66 RAWG Game',
    coverImageUrl: null,
    rawgUrl: 'https://rawg.io/games/issue-66-rawg-game',
  },
];

const MOCK_PENDING_GAME = {
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
  attributions: [
    {
      source: 'rawg' as const,
      label: 'RAWG' as const,
      url: 'https://rawg.io/games/issue-66-pending',
    },
  ],
};

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

  http.get(`${BASE}/v2/games/discover`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    const data = MOCK_DISCOVERY_RESULTS.filter((game) =>
      game.name.toLowerCase().includes(q.toLowerCase()),
    );
    return HttpResponse.json({ data, rawgAvailable: true });
  }),

  http.post(`${BASE}/v2/games/rawg/:rawgId/select`, ({ params }) => {
    const rawgId = Number(params.rawgId);
    return HttpResponse.json({
      id: rawgId === 910099 ? 42 : 43,
      slug: rawgId === 910099 ? 'issue-66-pending' : 'selected-rawg-game',
      status: 'pending_approval',
    });
  }),

  http.get(`${BASE}/v2/games/pending/:id`, ({ params }) => {
    if (params.id !== String(MOCK_PENDING_GAME.id)) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(MOCK_PENDING_GAME);
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
        tdpWatts: 125,
        releaseYear: 2023,
      },
      {
        id: 2,
        slug: 'amd-ryzen-9-7950x',
        name: 'AMD Ryzen 9 7950X',
        manufacturer: 'AMD' as CpuManufacturer,
        tdpWatts: 170,
        releaseYear: 2022,
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
        vramGb: 24,
        shadingUnits: 16384,
        tdpWatts: 450,
        releaseYear: 2022,
      },
      {
        id: 2,
        slug: 'amd-radeon-rx-7900-xtx',
        name: 'Radeon RX 7900 XTX',
        manufacturer: 'AMD' as GpuManufacturer,
        vramGb: 24,
        shadingUnits: 6144,
        tdpWatts: 355,
        releaseYear: 2022,
      },
    ].filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));

    return HttpResponse.json(results);
  }),

  http.post(`${BASE}/v1/check`, async ({ request }) => {
    const body = (await request.json()) as CheckRequest;
    const response: CheckResponse = {
      state: 'can',
      verdict: 'Can run',
      sub: `Recorded performance at ${body.settings.preset} settings meets your selected target.`,
      source: 'measured',
      provider: null,
      confidence: 'high',
      targetFps: body.settings.targetFps ?? 60,
      fps: { low: 110, med: 96, high: 78, ultra: 62 },
      gpuPass: true,
      cpuPass: true,
      ramPass: true,
      vramPass: true,
      ssdPass: true,
      notes: [],
    };

    return HttpResponse.json(response);
  }),

  http.post(`${BASE}/v2/check/pending/:gameId`, async ({ request }) => {
    const body = (await request.json()) as CheckRequest;
    return HttpResponse.json({
      state: 'can',
      verdict: 'Likely can run',
      sub: `AI-predicted performance at ${body.settings.preset} settings meets your selected target.`,
      source: 'ai',
      provider: 'gemini',
      confidence: 'medium',
      targetFps: body.settings.targetFps ?? 60,
      fps: { low: 80, med: 70, high: 60, ultra: 45 },
      gpuPass: true,
      cpuPass: true,
      ramPass: true,
      vramPass: true,
      ssdPass: true,
      notes: [],
    });
  }),
];

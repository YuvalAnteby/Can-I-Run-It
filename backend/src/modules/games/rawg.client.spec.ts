import { ConfigService } from '@nestjs/config';

import { RawgClient } from './rawg.client';

const rawgSearchHit = {
    id: 3498,
    name: 'Cyberpunk 2077',
    slug: 'cyberpunk-2077',
    background_image: 'https://media.rawg.io/media/games/cover.jpg',
    released: '2020-12-10',
    description_raw: 'Night City story',
    developers: [{ id: 1, name: 'CD PROJEKT RED', slug: 'cd-projekt-red' }],
    publishers: [{ id: 1, name: 'CD PROJEKT RED', slug: 'cd-projekt-red' }],
    genres: [{ id: 1, name: 'Action', slug: 'action' }],
    tags: [{ id: 1, name: 'Open World', slug: 'open-world' }],
    platforms: [{ platform: { id: 4, name: 'PC', slug: 'pc' } }],
    ratings: [],
    rating: 4.5,
    ratings_count: 100,
    metacritic: 86,
    playtime: 60,
    esrb_rating: { id: 5, name: 'Mature', slug: 'mature' },
    stores: [],
    clip: null,
    short_screenshots: [],
};

const makeConfig = (apiKey: string | undefined): ConfigService =>
    ({
        get: jest.fn().mockReturnValue(apiKey),
    }) as unknown as ConfigService;

const requestUrl = (value: RequestInfo | URL): string => {
    if (typeof value === 'string') return value;
    if (value instanceof URL) return value.toString();
    return value.url;
};

describe('RawgClient', () => {
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('maps validated search hits and creates the server-owned RAWG attribution URL', async () => {
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    count: 4,
                    next: null,
                    previous: null,
                    results: [
                        rawgSearchHit,
                        {
                            ...rawgSearchHit,
                            id: 0,
                            name: 'Invalid id',
                        },
                        {
                            ...rawgSearchHit,
                            id: 3499,
                            name: '   ',
                        },
                        {
                            ...rawgSearchHit,
                            id: 3500,
                            name: 'Untrusted slug',
                            slug: 'not a slug',
                            external_url: 'https://attacker.example/game',
                        },
                    ],
                }),
            ),
        );

        const service = new RawgClient(makeConfig('server-only-key'));
        const result = await service.search('  Cyberpunk 2077  ');

        expect(result).toEqual({
            available: true,
            results: [
                {
                    rawgId: 3498,
                    name: 'Cyberpunk 2077',
                    coverImageUrl:
                        'https://media.rawg.io/media/games/cover.jpg',
                    rawgUrl: 'https://rawg.io/games/cyberpunk-2077',
                },
            ],
        });

        const [request, requestInit] = fetchSpy.mock.calls[0];
        const url = new URL(requestUrl(request));
        expect(url.origin + url.pathname).toBe('https://api.rawg.io/api/games');
        expect(url.searchParams.get('search')).toBe('Cyberpunk 2077');
        expect(url.searchParams.get('page_size')).toBe('8');
        expect(url.searchParams.get('key')).toBe('server-only-key');
        expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
        expect(JSON.stringify(result)).not.toContain('server-only-key');
        expect(JSON.stringify(result)).not.toContain('external_url');
    });

    it('caps the provider query before sending it upstream', async () => {
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ results: [] }), { status: 200 }),
        );

        const service = new RawgClient(makeConfig('server-only-key'));
        await service.search('x'.repeat(101));

        const [request] = fetchSpy.mock.calls[0];
        expect(
            new URL(requestUrl(request)).searchParams.get('search'),
        ).toHaveLength(100);
    });

    it.each([
        ['missing API key', undefined, undefined],
        ['timeout', 'server-only-key', new Error('timeout')],
        [
            'rate limit',
            'server-only-key',
            new Response('limited', { status: 429 }),
        ],
        [
            'provider failure',
            'server-only-key',
            new Response('failed', { status: 503 }),
        ],
        [
            'malformed JSON',
            'server-only-key',
            new Response('{"results":null}', { status: 200 }),
        ],
    ] as const)(
        '%s keeps discovery available locally',
        async (_name, key, failure) => {
            if (failure instanceof Error) {
                fetchSpy.mockRejectedValue(failure);
            } else if (failure) {
                fetchSpy.mockResolvedValue(failure);
            }

            const service = new RawgClient(makeConfig(key));
            const result = await service.search('Elden Ring');

            expect(result).toEqual({ available: false, results: [] });
            if (!key) {
                expect(fetchSpy).not.toHaveBeenCalled();
            }
        },
    );

    it('returns a validated detail payload only when the provider identity matches the requested id', async () => {
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    ...rawgSearchHit,
                    id: 3498,
                    name: 'Cyberpunk 2077',
                    slug: 'cyberpunk-2077',
                }),
                { status: 200 },
            ),
        );

        const service = new RawgClient(makeConfig('server-only-key'));
        const result = await service.getById(3498);

        expect(result).toMatchObject({
            id: 3498,
            name: 'Cyberpunk 2077',
            slug: 'cyberpunk-2077',
        });
        const [request, requestInit] = fetchSpy.mock.calls[0];
        expect(requestUrl(request)).toContain('/games/3498');
        expect(requestInit?.signal).toBeInstanceOf(AbortSignal);

        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({ ...rawgSearchHit, id: 1, slug: 'wrong-id' }),
                { status: 200 },
            ),
        );
        await expect(service.getById(3498)).resolves.toBeNull();
    });
});

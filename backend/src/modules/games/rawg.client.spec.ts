import { ConfigService } from '@nestjs/config';

import { AbuseProtectionService } from '../../common/abuse-protection/abuse-protection.service';
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

const makeConfig = (
    apiKey: string | undefined,
    values: Record<string, unknown> = {},
): ConfigService =>
    ({
        get: jest.fn((key: string, fallback?: unknown) =>
            key === 'RAWG_API_KEY' ? apiKey : (values[key] ?? fallback),
        ),
    }) as unknown as ConfigService;

const requestUrl = (value: RequestInfo | URL): string => {
    if (typeof value === 'string') return value;
    if (value instanceof URL) return value.toString();
    return value.url;
};

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

type AbuseProtectionDouble = {
    tryAcquireProvider: (...args: never[]) => (() => void) | null;
    recordEvent: (...args: never[]) => void;
};

const createClient = (
    config: ConfigService,
    abuseProtection: AbuseProtectionDouble,
): RawgClient =>
    new (RawgClient as unknown as new (
        config: ConfigService,
        abuseProtection: AbuseProtectionDouble,
    ) => RawgClient)(config, abuseProtection);

const permissiveProtection = () => ({
    tryAcquireProvider: jest.fn().mockReturnValue(jest.fn()),
    recordEvent: jest.fn(),
});

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

        const service = createClient(
            makeConfig('server-only-key'),
            permissiveProtection(),
        );
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

        const service = createClient(
            makeConfig('server-only-key'),
            permissiveProtection(),
        );
        await service.search('x'.repeat(101));

        const [request] = fetchSpy.mock.calls[0];
        expect(
            new URL(requestUrl(request)).searchParams.get('search'),
        ).toHaveLength(100);
    });

    it('fails fast when distinct RAWG work exhausts provider concurrency', async () => {
        const first = deferred<Response>();
        const second = deferred<Response>();
        let fetchCount = 0;
        fetchSpy.mockImplementation(() => {
            fetchCount += 1;
            if (fetchCount === 1) return first.promise;
            if (fetchCount === 2) return second.promise;
            return Promise.resolve(
                new Response(JSON.stringify({ results: [] }), {
                    status: 200,
                }),
            );
        });
        const abuseProtection = {
            tryAcquireProvider: jest
                .fn()
                .mockReturnValueOnce(jest.fn())
                .mockReturnValueOnce(jest.fn())
                .mockReturnValueOnce(null),
            recordEvent: jest.fn(),
        };

        const service = createClient(
            makeConfig('server-only-key'),
            abuseProtection,
        );
        const firstSearch = service.search('first');
        const secondSearch = service.search('second');

        await expect(service.search('third')).resolves.toEqual({
            available: false,
            results: [],
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(abuseProtection.tryAcquireProvider).toHaveBeenCalledTimes(3);

        const response = new Response(JSON.stringify({ results: [] }), {
            status: 200,
        });
        first.resolve(response);
        second.resolve(response);
        await Promise.all([firstSearch, secondSearch]);
    });

    it('coalesces identical normalized searches and keeps distinct queries separate', async () => {
        const body = deferred<Response>();
        fetchSpy.mockReturnValue(body.promise);
        const service = createClient(
            makeConfig('server-only-key'),
            permissiveProtection(),
        );

        const first = service.search('  Elden Ring  ');
        const duplicate = service.search('Elden Ring');
        body.resolve(new Response(JSON.stringify({ results: [] })));
        await expect(Promise.all([first, duplicate])).resolves.toEqual([
            { available: true, results: [] },
            { available: true, results: [] },
        ]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ results: [] }), { status: 200 }),
        );
        await expect(service.search('elden ring')).resolves.toEqual({
            available: true,
            results: [],
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('coalesces identical detail requests and clears the pending entry after settlement', async () => {
        const body = deferred<Response>();
        fetchSpy.mockReturnValue(body.promise);
        const service = createClient(
            makeConfig('server-only-key'),
            permissiveProtection(),
        );

        const first = service.getById(3498);
        const duplicate = service.getById(3498);
        body.resolve(
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
        await expect(Promise.all([first, duplicate])).resolves.toEqual([
            expect.objectContaining({ id: 3498, slug: 'cyberpunk-2077' }),
            expect.objectContaining({ id: 3498, slug: 'cyberpunk-2077' }),
        ]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

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
        await expect(service.getById(3498)).resolves.toEqual(
            expect.objectContaining({ id: 3498 }),
        );
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('holds a RAWG permit until an ignored-abort response body settles', async () => {
        jest.useFakeTimers();
        const body = deferred<unknown>();
        let signal: AbortSignal | undefined;
        let fetchCount = 0;
        fetchSpy.mockImplementation((_url, init) => {
            fetchCount += 1;
            signal = init?.signal as AbortSignal | undefined;
            if (fetchCount === 1) {
                return Promise.resolve({
                    ok: true,
                    json: () => body.promise,
                } as Response);
            }
            return Promise.resolve(
                new Response(JSON.stringify({ results: [] }), { status: 200 }),
            );
        });
        const providerConfig = makeConfig('server-only-key', {
            RAWG_TIMEOUT_MS: 100,
            RAWG_MAX_CONCURRENT: 1,
        });
        const protection = new AbuseProtectionService(providerConfig);
        const service = createClient(
            providerConfig,
            protection as unknown as AbuseProtectionDouble,
        );

        const first = service.search('first');
        await Promise.resolve();
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(100);

        let firstResult: unknown = 'pending';
        void first.then((result) => {
            firstResult = result;
        });
        await Promise.resolve();
        expect(firstResult).toEqual({ available: false, results: [] });
        expect(signal?.aborted).toBe(true);

        await expect(service.search('second')).resolves.toEqual({
            available: false,
            results: [],
        });
        expect(fetchCount).toBe(1);

        body.resolve({ results: [] });
        await first;
        await Promise.resolve();
        await Promise.resolve();
        await expect(service.search('third')).resolves.toEqual({
            available: true,
            results: [],
        });
        expect(fetchCount).toBe(2);
        protection.onApplicationShutdown();
    });

    it.each([
        ['fulfillment', false],
        ['rejection', true],
    ] as const)(
        'cancels non-OK response bodies before releasing the RAWG permit on %s',
        async (_cleanup, rejectCancellation) => {
            jest.useFakeTimers();
            const cancellation = deferred<void>();
            void cancellation.promise.catch(() => undefined);
            const cancel = jest.fn(() => cancellation.promise);
            const failureResponse = {
                ok: false,
                status: 503,
                body: { cancel },
            } as unknown as Response;
            let fetchCount = 0;
            let signal: AbortSignal | undefined;
            fetchSpy.mockImplementation((_url, init) => {
                fetchCount += 1;
                if (fetchCount === 1) {
                    signal = init?.signal as AbortSignal | undefined;
                    return Promise.resolve(failureResponse);
                }
                return Promise.resolve(
                    new Response(JSON.stringify({ results: [] }), {
                        status: 200,
                    }),
                );
            });

            const providerConfig = makeConfig('server-only-key', {
                RAWG_TIMEOUT_MS: 100,
                RAWG_MAX_CONCURRENT: 1,
            });
            const protection = new AbuseProtectionService(providerConfig);
            const recordEvent = jest.spyOn(protection, 'recordEvent');
            const service = createClient(
                providerConfig,
                protection as unknown as AbuseProtectionDouble,
            );

            const first = service.search('first');
            let firstResult: unknown = 'pending';
            void first.then((result) => {
                firstResult = result;
            });
            for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();

            expect(firstResult).toEqual({ available: false, results: [] });
            expect(cancel).toHaveBeenCalledTimes(1);
            expect(fetchCount).toBe(1);

            await expect(service.search('first')).resolves.toEqual({
                available: false,
                results: [],
            });
            expect(fetchCount).toBe(1);

            await expect(service.search('second')).resolves.toEqual({
                available: false,
                results: [],
            });
            expect(fetchCount).toBe(1);

            await jest.advanceTimersByTimeAsync(100);
            expect(signal?.aborted).toBe(true);
            if (rejectCancellation) {
                cancellation.reject(new Error('body cancellation failed'));
            } else {
                cancellation.resolve();
            }
            for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();

            await expect(service.search('third')).resolves.toEqual({
                available: true,
                results: [],
            });
            expect(fetchCount).toBe(2);
            const events = recordEvent.mock.calls.map(([event]) => event);
            expect(
                events.filter((event) => event === 'provider.rawg.failure'),
            ).toHaveLength(1);
            expect(events).toContain('provider.rawg.concurrency');
            expect(events).toContain('provider.rawg.timeout');
            protection.onApplicationShutdown();
            jest.useRealTimers();
        },
    );

    it.each([
        ['missing API key', undefined, undefined],
        ['timeout', 'server-only-key', new Error('timeout')],
        [
            'rate limit',
            'server-only-key',
            new Response('limited', { status: 429 }),
        ],
        [
            'payment required',
            'server-only-key',
            new Response('payment required', { status: 402 }),
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

            const protection = permissiveProtection();
            const service = createClient(makeConfig(key), protection);
            const result = await service.search('Elden Ring');

            expect(result).toEqual({ available: false, results: [] });
            if (!key) {
                expect(fetchSpy).not.toHaveBeenCalled();
                expect(protection.tryAcquireProvider).not.toHaveBeenCalled();
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

        const service = createClient(
            makeConfig('server-only-key'),
            permissiveProtection(),
        );
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

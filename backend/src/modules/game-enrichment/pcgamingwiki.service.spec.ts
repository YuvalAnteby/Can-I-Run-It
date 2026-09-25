import {
    ambiguousQueryResponse,
    errorParseResponse,
    errorQueryResponse,
    exactParseResponse,
    exactQueryResponse,
    malformedParseResponse,
    malformedQueryResponse,
    mismatchedQueryResponse,
    nestedParseResponse,
    noPageQueryResponse,
    noWindowsRequirementsParseResponse,
    otherThenWindowsRequirementsParseResponse,
    redirectQueryResponse,
    windowsThenOtherRequirementsParseResponse,
} from './__fixtures__/pcgamingwiki.fixtures';
import {
    PcGamingWikiProviderError,
    PcGamingWikiService,
} from './pcgamingwiki.service';

const USER_AGENT =
    'Can-I-Run-It/2.0 (+https://github.com/YuvalAnteby/Can-I-Run-It)';

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const fetchUrl = (input: Parameters<typeof fetch>[0]): URL =>
    input instanceof Request ? new URL(input.url) : new URL(input);

describe('PcGamingWikiService', () => {
    let service: PcGamingWikiService;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    beforeEach(() => {
        service = new PcGamingWikiService();
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('accepts one exact page, parses it, and derives a canonical source URL', async () => {
        fetchSpy
            .mockResolvedValueOnce(jsonResponse(exactQueryResponse))
            .mockResolvedValueOnce(jsonResponse(exactParseResponse));

        const result = await service.fetchExactGameData('Elden Ring');

        expect(result).toMatchObject({
            kind: 'matched',
            url: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
            metadata: {
                developer: 'FromSoftware',
                publisher: 'Bandai Namco Entertainment',
                releaseDate: '2022-02-25',
                genre: 'Action RPG',
            },
        });
        expect(result.kind === 'matched' && result.minimum).toContain('12 GB');
        expect(result.kind === 'matched' && result.recommended).toContain(
            '16 GB',
        );
        expect(fetchSpy).toHaveBeenCalledTimes(2);

        const queryUrl = fetchUrl(fetchSpy.mock.calls[0][0]);
        expect(queryUrl.pathname).toBe('/w/api.php');
        expect(queryUrl.searchParams.get('action')).toBe('query');
        expect(queryUrl.searchParams.get('format')).toBe('json');
        expect(queryUrl.searchParams.get('formatversion')).toBe('2');
        expect(queryUrl.searchParams.get('redirects')).toBe('1');
        expect(queryUrl.searchParams.get('titles')).toBe('Elden Ring');

        const queryOptions = fetchSpy.mock.calls[0]?.[1] as RequestInit;
        expect(new Headers(queryOptions.headers).get('User-Agent')).toBe(
            USER_AGENT,
        );

        const parseUrl = fetchUrl(fetchSpy.mock.calls[1][0]);
        expect(parseUrl.searchParams.get('action')).toBe('parse');
        expect(parseUrl.searchParams.get('prop')).toBe('wikitext');
        expect(parseUrl.searchParams.get('page')).toBe('Elden Ring');
    });

    it('accepts one explicit MediaWiki redirect and uses the target title', async () => {
        fetchSpy
            .mockResolvedValueOnce(jsonResponse(redirectQueryResponse))
            .mockResolvedValueOnce(jsonResponse(exactParseResponse));

        const result = await service.fetchExactGameData(
            'Elden Ring: Shadow of the Erdtree',
        );

        expect(result).toMatchObject({
            kind: 'matched',
            url: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
        const parseUrl = fetchUrl(fetchSpy.mock.calls[1][0]);
        expect(parseUrl.searchParams.get('page')).toBe('Elden Ring');
    });

    it.each([
        [
            'no page',
            'No exact page',
            noPageQueryResponse,
            'PCGamingWiki page not found',
        ],
        [
            'ambiguous pages',
            'Example',
            ambiguousQueryResponse,
            'PCGamingWiki title is ambiguous',
        ],
        [
            'a normalized but mismatched title',
            'Requested Game',
            mismatchedQueryResponse,
            'PCGamingWiki title did not match',
        ],
    ])(
        'returns the exact unmatched warning for %s and never parses a page',
        async (_caseName, requestedName, queryResponse, warning) => {
            fetchSpy.mockResolvedValueOnce(jsonResponse(queryResponse));

            await expect(
                service.fetchExactGameData(requestedName),
            ).resolves.toEqual({
                kind: 'unmatched',
                warning,
            });
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        },
    );

    it('accepts MediaWiki title normalization without accepting a different title', async () => {
        fetchSpy
            .mockResolvedValueOnce(
                jsonResponse({
                    query: {
                        pages: [{ pageid: 123, ns: 0, title: 'Elden_Ring' }],
                    },
                }),
            )
            .mockResolvedValueOnce(jsonResponse(exactParseResponse));

        await expect(
            service.fetchExactGameData('Elden Ring'),
        ).resolves.toMatchObject({
            kind: 'matched',
            url: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('treats an accepted query with a different parse title as malformed and retryable', async () => {
        fetchSpy
            .mockResolvedValueOnce(jsonResponse(exactQueryResponse))
            .mockResolvedValueOnce(
                jsonResponse({
                    parse: {
                        ...exactParseResponse.parse,
                        title: 'Different Game',
                    },
                }),
            );

        await expect(
            service.fetchExactGameData('Elden Ring'),
        ).rejects.toMatchObject({
            code: 'http_5xx',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('returns metadata and a warning when the accepted page lacks Windows requirements', async () => {
        fetchSpy
            .mockResolvedValueOnce(jsonResponse(exactQueryResponse))
            .mockResolvedValueOnce(
                jsonResponse(noWindowsRequirementsParseResponse),
            );

        const result = await service.fetchExactGameData('Elden Ring');

        expect(result).toMatchObject({
            kind: 'matched',
            metadata: { developer: 'FromSoftware' },
            warnings: ['PCGamingWiki Windows requirements missing'],
        });
        expect(result).not.toHaveProperty('minimum');
        expect(result).not.toHaveProperty('recommended');
    });

    it('omits an invalid Windows release date instead of returning it as metadata', async () => {
        fetchSpy
            .mockResolvedValueOnce(jsonResponse(exactQueryResponse))
            .mockResolvedValueOnce(
                jsonResponse({
                    parse: {
                        title: 'Elden Ring',
                        wikitext:
                            '{{Infobox game/row/date|Windows|2022-99-99}}\n' +
                            '{{System requirements|OSfamily=Windows|minram=8 GB}}',
                    },
                }),
            );

        const result = await service.fetchExactGameData('Elden Ring');

        expect(result.kind).toBe('matched');
        if (result.kind !== 'matched') return;
        expect(result.metadata.releaseDate).toBeUndefined();
    });

    it.each([
        ['an API error envelope', errorQueryResponse],
        ['a missing pages collection', malformedQueryResponse],
    ])(
        'throws a sanitized retryable failure for %s in a status-200 query response',
        async (_caseName, response) => {
            fetchSpy.mockResolvedValueOnce(jsonResponse(response));

            const rejection = service.fetchExactGameData('Elden Ring');
            await expect(rejection).rejects.toMatchObject({ code: 'http_5xx' });
            await rejection.catch((error: unknown) => {
                expect(String(error)).not.toContain('provider-secret');
            });
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        },
    );

    it.each([
        ['an API error envelope', errorParseResponse],
        ['missing wikitext data', malformedParseResponse],
    ])(
        'throws a sanitized retryable failure for %s in a status-200 parse response',
        async (_caseName, response) => {
            fetchSpy
                .mockResolvedValueOnce(jsonResponse(exactQueryResponse))
                .mockResolvedValueOnce(jsonResponse(response));

            const rejection = service.fetchExactGameData('Elden Ring');
            await expect(rejection).rejects.toMatchObject({ code: 'http_5xx' });
            await rejection.catch((error: unknown) => {
                expect(String(error)).not.toContain('provider-secret');
            });
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        },
    );

    it('parses nested real-shape templates and minHD/recHD storage aliases', async () => {
        fetchSpy
            .mockResolvedValueOnce(jsonResponse(exactQueryResponse))
            .mockResolvedValueOnce(jsonResponse(nestedParseResponse));

        const result = await service.fetchExactGameData('Elden Ring');

        expect(result.kind).toBe('matched');
        if (result.kind !== 'matched') return;
        expect(result.metadata).toEqual({
            developer: 'FromSoftware',
            publisher: 'Bandai Namco Entertainment',
            releaseDate: '2022-02-25',
            genre: 'Action RPG',
        });
        expect(result.minimum).toContain('Storage: 60 GB');
        expect(result.recommended).toContain('Storage: 80 GB');
        expect(result.warnings).toEqual([]);
    });

    it.each([
        [
            'Windows before Linux/macOS',
            windowsThenOtherRequirementsParseResponse,
        ],
        [
            'Linux/macOS before Windows',
            otherThenWindowsRequirementsParseResponse,
        ],
    ])(
        'accepts only the Windows System requirements template when templates appear in %s order',
        async (_order, parseResponse) => {
            fetchSpy
                .mockResolvedValueOnce(jsonResponse(exactQueryResponse))
                .mockResolvedValueOnce(jsonResponse(parseResponse));

            const result = await service.fetchExactGameData('Elden Ring');

            expect(result.kind).toBe('matched');
            if (result.kind !== 'matched') return;
            expect(result.minimum).toContain('12 GB');
            expect(result.minimum).toContain('Windows CPU');
            expect(result.minimum).not.toContain('4 GB');
            expect(result.minimum).not.toContain('6 GB');
            expect(result.minimum).not.toContain('Linux CPU');
            expect(result.minimum).not.toContain('macOS CPU');
        },
    );

    it.each([
        [403, 'http_403'],
        [429, 'http_429'],
        [500, 'http_5xx'],
        [503, 'http_5xx'],
    ])(
        'classifies HTTP %s as a sanitized retryable provider failure',
        async (status, code) => {
            fetchSpy.mockResolvedValueOnce(
                new Response('provider-secret-response-body', { status }),
            );

            const rejection = service.fetchExactGameData('Elden Ring');
            await expect(rejection).rejects.toMatchObject({ code });
            await rejection.catch((error: unknown) => {
                expect(error).toBeInstanceOf(PcGamingWikiProviderError);
                expect(String(error)).not.toContain(
                    'provider-secret-response-body',
                );
            });
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        },
    );

    it('classifies an aborted request as a sanitized timeout failure', async () => {
        fetchSpy.mockRejectedValueOnce(
            Object.assign(new Error('provider-secret-timeout'), {
                name: 'AbortError',
            }),
        );

        const rejection = service.fetchExactGameData('Elden Ring');
        await expect(rejection).rejects.toMatchObject({ code: 'timeout' });
        await rejection.catch((error: unknown) => {
            expect(String(error)).not.toContain('provider-secret-timeout');
        });
    });

    it('rejects a response over 256 KiB before parsing or making a second request', async () => {
        fetchSpy.mockResolvedValueOnce(
            new Response('x'.repeat(256 * 1024 + 1), { status: 200 }),
        );

        await expect(
            service.fetchExactGameData('Elden Ring'),
        ).rejects.toMatchObject({
            code: 'response_too_large',
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('cancels a streamed response as soon as it crosses 256 KiB', async () => {
        const read = jest
            .fn<Promise<ReadableStreamReadResult<Uint8Array>>, []>()
            .mockResolvedValueOnce({
                done: false,
                value: new Uint8Array(128 * 1024),
            })
            .mockResolvedValueOnce({
                done: false,
                value: new Uint8Array(128 * 1024),
            })
            .mockResolvedValueOnce({
                done: false,
                value: new Uint8Array(1),
            });
        const cancel = jest.fn<Promise<void>, []>().mockResolvedValue();
        const releaseLock = jest.fn();
        fetchSpy.mockResolvedValueOnce({
            status: 200,
            ok: true,
            headers: new Headers(),
            body: {
                getReader: () => ({ read, cancel, releaseLock }),
            },
        } as unknown as Response);

        await expect(
            service.fetchExactGameData('Elden Ring'),
        ).rejects.toMatchObject({
            code: 'response_too_large',
        });
        expect(read).toHaveBeenCalledTimes(3);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(releaseLock).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});

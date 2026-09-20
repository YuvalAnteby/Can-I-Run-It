import { Injectable } from '@nestjs/common';

export type PcGamingWikiWarning =
    | 'PCGamingWiki page not found'
    | 'PCGamingWiki title is ambiguous'
    | 'PCGamingWiki title did not match'
    | 'PCGamingWiki Windows requirements missing';

export type PcGamingWikiLookup =
    | { kind: 'unmatched'; warning: PcGamingWikiWarning }
    | {
          kind: 'matched';
          url: string;
          metadata: Partial<
              Record<
                  'developer' | 'publisher' | 'releaseDate' | 'genre',
                  string
              >
          >;
          minimum?: string;
          recommended?: string;
          warnings: PcGamingWikiWarning[];
      };

export type PcGamingWikiFailureCode =
    | 'http_403'
    | 'http_429'
    | 'http_5xx'
    | 'timeout'
    | 'response_too_large';

export class PcGamingWikiProviderError extends Error {
    constructor(
        readonly code: PcGamingWikiFailureCode,
        message: string,
    ) {
        super(message);
        this.name = PcGamingWikiProviderError.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

const API_URL = 'https://www.pcgamingwiki.com/w/api.php';
const USER_AGENT =
    'Can-I-Run-It/2.0 (+https://github.com/YuvalAnteby/Can-I-Run-It)';
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TEMPLATE_DEPTH = 128;
const MAX_TEMPLATES = 10_000;
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 55;

let requestStarts: number[] = [];
let rateLimitTail = Promise.resolve();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const nonblank = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const normalizedTitle = (value: string): string =>
    value.trim().replaceAll('_', ' ').replace(/\s+/g, ' ').toLocaleLowerCase();

const delay = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const reserveRequestSlot = async (): Promise<void> => {
    let release!: () => void;
    const previous = rateLimitTail;
    rateLimitTail = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;

    try {
        while (true) {
            const now = Date.now();
            requestStarts = requestStarts.filter(
                (startedAt) => now - startedAt < REQUEST_WINDOW_MS,
            );
            if (requestStarts.length < MAX_REQUESTS_PER_WINDOW) {
                requestStarts.push(now);
                return;
            }
            await delay(requestStarts[0] + REQUEST_WINDOW_MS - now);
        }
    } finally {
        release();
    }
};

const splitTemplate = (body: string): string[] => {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;

    for (let index = 0; index < body.length; index += 1) {
        if (body.startsWith('{{', index)) {
            depth += 1;
            index += 1;
        } else if (body.startsWith('}}', index)) {
            depth = Math.max(0, depth - 1);
            index += 1;
        } else if (body[index] === '|' && depth === 0) {
            parts.push(body.slice(start, index));
            start = index + 1;
        }
    }

    parts.push(body.slice(start));
    return parts;
};

const balancedTemplates = (wikitext: string): string[] => {
    const templates: string[] = [];
    const starts: number[] = [];

    for (let index = 0; index < wikitext.length - 1; index += 1) {
        if (wikitext.startsWith('{{', index)) {
            if (starts.length >= MAX_TEMPLATE_DEPTH) break;
            starts.push(index + 2);
            index += 1;
        } else if (wikitext.startsWith('}}', index)) {
            const start = starts.pop();
            if (start !== undefined) {
                templates.push(wikitext.slice(start, index));
                if (templates.length >= MAX_TEMPLATES) break;
            }
            index += 1;
        }
    }

    return templates;
};

const fullDate = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const parseRequirements = (
    parts: string[],
): { minimum?: string; recommended?: string } => {
    const lines: Record<'minimum' | 'recommended', string[]> = {
        minimum: [],
        recommended: [],
    };
    const labels: Record<string, string> = {
        windows: 'OS',
        os: 'OS',
        cpu: 'CPU',
        cpu2: 'CPU',
        processor: 'CPU',
        gpu: 'GPU',
        gpu2: 'GPU',
        gpu3: 'GPU',
        graphics: 'GPU',
        ram: 'RAM',
        memory: 'RAM',
        vram: 'VRAM',
        hd: 'Storage',
        hdd: 'Storage',
        storage: 'Storage',
        ssd: 'SSD',
        dx: 'DirectX',
        directx: 'DirectX',
        ogl: 'OpenGL',
        sm: 'Shader Model',
        tgt: 'Target',
        audio: 'Sound',
        cont: 'Controller',
        other: 'Notes',
        notes: 'Notes',
    };

    for (const part of parts.slice(1)) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        const key = part.slice(0, separator).trim().toLowerCase();
        const value = part.slice(separator + 1).trim();
        if (!value) continue;

        const tier = key.startsWith('min')
            ? 'minimum'
            : key.startsWith('rec')
              ? 'recommended'
              : undefined;
        if (!tier) continue;

        const field = key.replace(/^(?:min|rec)/, '');
        const label = labels[field];
        if (label) lines[tier].push(`${label}: ${value}`);
    }

    return {
        ...(lines.minimum.length > 0
            ? { minimum: lines.minimum.join('\n') }
            : {}),
        ...(lines.recommended.length > 0
            ? { recommended: lines.recommended.join('\n') }
            : {}),
    };
};

const parseWikitext = (
    wikitext: string,
): {
    metadata: Partial<
        Record<'developer' | 'publisher' | 'releaseDate' | 'genre', string>
    >;
    minimum?: string;
    recommended?: string;
    requirementsFound: boolean;
} => {
    const metadata: Partial<
        Record<'developer' | 'publisher' | 'releaseDate' | 'genre', string>
    > = {};
    let requirementsFound = false;
    let minimum: string | undefined;
    let recommended: string | undefined;

    for (const body of balancedTemplates(wikitext)) {
        const parts = splitTemplate(body);
        const name = parts[0]?.trim().toLowerCase();
        if (!name) continue;

        const value = parts.slice(1).join('|').trim();
        if (name === 'infobox game/row/developer' && value) {
            metadata.developer = value;
        } else if (name === 'infobox game/row/publisher' && value) {
            metadata.publisher = value;
        } else if (name === 'infobox game/taxonomy/genres' && value) {
            metadata.genre = value;
        } else if (name === 'infobox game/row/date') {
            if (
                parts[1]?.trim().toLowerCase() === 'windows' &&
                fullDate(parts[2]?.trim() ?? '')
            ) {
                metadata.releaseDate = parts[2].trim();
            }
        } else if (name === 'system requirements') {
            requirementsFound = true;
            const requirements = parseRequirements(parts);
            minimum = requirements.minimum;
            recommended = requirements.recommended;
        }
    }

    return { metadata, minimum, recommended, requirementsFound };
};

const warning = (value: PcGamingWikiWarning): PcGamingWikiLookup => ({
    kind: 'unmatched',
    warning: value,
});

@Injectable()
export class PcGamingWikiService {
    async findExact(name: string): Promise<PcGamingWikiLookup> {
        const requestedTitle = name.trim();
        if (!requestedTitle) return warning('PCGamingWiki page not found');

        const queryUrl = new URL(API_URL);
        queryUrl.search = new URLSearchParams({
            action: 'query',
            format: 'json',
            formatversion: '2',
            redirects: '1',
            titles: requestedTitle,
        }).toString();
        const query = await this.requestJson(queryUrl);
        const queryRecord =
            isRecord(query) && isRecord(query.query) ? query.query : undefined;
        const pages = Array.isArray(queryRecord?.pages)
            ? queryRecord.pages.filter(isRecord)
            : [];
        const availablePages = pages.filter((page) => page.missing !== true);

        if (availablePages.length === 0) {
            return warning('PCGamingWiki page not found');
        }
        if (availablePages.length !== 1) {
            return warning('PCGamingWiki title is ambiguous');
        }

        const page = availablePages[0];
        const canonicalTitle = nonblank(page.title) ? page.title.trim() : '';
        if (!canonicalTitle) return warning('PCGamingWiki title did not match');

        const redirects = Array.isArray(queryRecord?.redirects)
            ? queryRecord.redirects.filter(isRecord)
            : [];
        const redirectFrom =
            typeof redirects[0]?.from === 'string' ? redirects[0].from : '';
        const redirectTo =
            typeof redirects[0]?.to === 'string' ? redirects[0].to : '';
        const exact =
            normalizedTitle(canonicalTitle) === normalizedTitle(requestedTitle);
        const explicitRedirect =
            redirects.length === 1 &&
            normalizedTitle(redirectFrom) === normalizedTitle(requestedTitle) &&
            normalizedTitle(redirectTo) === normalizedTitle(canonicalTitle);
        if (!exact && !explicitRedirect) {
            return warning('PCGamingWiki title did not match');
        }

        const parseUrl = new URL(API_URL);
        parseUrl.search = new URLSearchParams({
            action: 'parse',
            format: 'json',
            formatversion: '2',
            prop: 'wikitext',
            page: canonicalTitle,
        }).toString();
        const parsed = await this.requestJson(parseUrl);
        const parseRecord =
            isRecord(parsed) && isRecord(parsed.parse)
                ? parsed.parse
                : undefined;
        const parseTitle = nonblank(parseRecord?.title)
            ? parseRecord.title
            : canonicalTitle;
        if (normalizedTitle(parseTitle) !== normalizedTitle(canonicalTitle)) {
            return warning('PCGamingWiki title did not match');
        }

        const wikitextValue = parseRecord?.wikitext;
        const wikitext =
            typeof wikitextValue === 'string'
                ? wikitextValue
                : isRecord(wikitextValue) && nonblank(wikitextValue['*'])
                  ? wikitextValue['*']
                  : undefined;
        const parsedPage = parseWikitext(wikitext ?? '');
        const warnings: PcGamingWikiWarning[] = parsedPage.requirementsFound
            ? []
            : ['PCGamingWiki Windows requirements missing'];

        return {
            kind: 'matched',
            url: `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(canonicalTitle.replaceAll(' ', '_'))}`,
            metadata: parsedPage.metadata,
            ...(parsedPage.minimum ? { minimum: parsedPage.minimum } : {}),
            ...(parsedPage.recommended
                ? { recommended: parsedPage.recommended }
                : {}),
            warnings,
        };
    }

    private async requestJson(url: URL): Promise<unknown> {
        await reserveRequestSlot();

        let response: Response;
        try {
            response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT },
                signal: AbortSignal.timeout(5_000),
            });
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                ['AbortError', 'TimeoutError'].includes(error.name)
            ) {
                throw new PcGamingWikiProviderError(
                    'timeout',
                    'PCGamingWiki request timed out',
                );
            }
            throw new PcGamingWikiProviderError(
                'timeout',
                'PCGamingWiki request failed',
            );
        }

        if (response.status === 403) {
            throw new PcGamingWikiProviderError(
                'http_403',
                'PCGamingWiki denied the request',
            );
        }
        if (response.status === 429) {
            throw new PcGamingWikiProviderError(
                'http_429',
                'PCGamingWiki rate limited the request',
            );
        }
        if (response.status >= 500) {
            throw new PcGamingWikiProviderError(
                'http_5xx',
                'PCGamingWiki server failure',
            );
        }
        if (!response.ok) {
            throw new PcGamingWikiProviderError(
                'http_5xx',
                'PCGamingWiki request returned an error',
            );
        }

        let bytes: Uint8Array;
        try {
            bytes = await this.readBounded(response);
        } catch (error: unknown) {
            if (error instanceof PcGamingWikiProviderError) throw error;
            throw new PcGamingWikiProviderError(
                'timeout',
                'PCGamingWiki response read failed',
            );
        }

        try {
            return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        } catch {
            throw new PcGamingWikiProviderError(
                'http_5xx',
                'PCGamingWiki response was invalid',
            );
        }
    }

    private async readBounded(response: Response): Promise<Uint8Array> {
        const contentLength = response.headers.get('content-length');
        if (
            contentLength !== null &&
            /^\d+$/.test(contentLength) &&
            Number(contentLength) > MAX_RESPONSE_BYTES
        ) {
            if (response.body) {
                await response.body.cancel().catch(() => undefined);
            }
            throw new PcGamingWikiProviderError(
                'response_too_large',
                'PCGamingWiki response exceeded the size limit',
            );
        }

        if (!response.body) return new Uint8Array();

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_RESPONSE_BYTES) {
                    await reader.cancel().catch(() => undefined);
                    throw new PcGamingWikiProviderError(
                        'response_too_large',
                        'PCGamingWiki response exceeded the size limit',
                    );
                }
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }

        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return bytes;
    }
}

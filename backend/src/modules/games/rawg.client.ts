import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AbuseProtectionService } from '../../common/abuse-protection/abuse-protection.service';
import { observeProvider } from '../../common/observability/telemetry';

const RAWG_API_ORIGIN = 'https://api.rawg.io';
const RAWG_PUBLIC_ORIGIN = 'https://rawg.io';
const RAWG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RAWG_QUERY_MAX_LENGTH = 100;
const RAWG_PAGE_SIZE = 8;
const RAWG_TIMEOUT_MS = 3_000;

export interface RawgSearchResult {
    rawgId: number;
    name: string;
    coverImageUrl: string | null;
    rawgUrl: string;
}

export interface RawgSearchResponse {
    available: boolean;
    results: RawgSearchResult[];
}

export interface RawgGameDetail extends Record<string, unknown> {
    id: number;
    name: string;
    slug: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidId = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;

const validSlug = (value: unknown): value is string =>
    typeof value === 'string' && RAWG_SLUG_PATTERN.test(value);

const validName = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const safeImageUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.trim() === '') return null;

    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password
            ? url.toString()
            : null;
    } catch {
        return null;
    }
};

@Injectable()
export class RawgClient {
    private readonly logger = new Logger(RawgClient.name);
    private readonly apiKey: string | undefined;
    private readonly timeoutMs: number;
    private readonly pending = new Map<string, Promise<unknown>>();

    constructor(
        private readonly config: ConfigService,
        private readonly abuseProtection: AbuseProtectionService,
    ) {
        const key = this.config.get<string>('RAWG_API_KEY');
        this.apiKey = key?.trim() || undefined;
        this.timeoutMs =
            this.config.get<number>('RAWG_TIMEOUT_MS') ?? RAWG_TIMEOUT_MS;
        if (!this.apiKey) {
            this.logger.warn({ event: 'provider.rawg.unconfigured' });
        }
    }

    async search(query: string): Promise<RawgSearchResponse> {
        const payload = await this.request('/api/games', {
            search: query.trim().slice(0, RAWG_QUERY_MAX_LENGTH),
            page_size: String(RAWG_PAGE_SIZE),
        });

        if (!isRecord(payload) || !Array.isArray(payload.results)) {
            if (payload !== null) {
                this.abuseProtection.recordEvent('provider.rawg.failure');
            }
            return { available: false, results: [] };
        }

        const results = payload.results
            .slice(0, RAWG_PAGE_SIZE)
            .map((value) => this.mapSearchResult(value))
            .filter((value): value is RawgSearchResult => value !== null);

        return { available: true, results };
    }

    async getById(rawgId: number): Promise<RawgGameDetail | null> {
        if (!isValidId(rawgId)) return null;

        const payload = await this.request(`/api/games/${rawgId}`);
        if (!isRecord(payload)) {
            if (payload !== null) {
                this.abuseProtection.recordEvent('provider.rawg.failure');
            }
            return null;
        }
        if (
            payload.id !== rawgId ||
            !validName(payload.name) ||
            !validSlug(payload.slug)
        ) {
            this.abuseProtection.recordEvent('provider.rawg.failure');
            return null;
        }

        return {
            ...payload,
            id: rawgId,
            name: payload.name.trim(),
            slug: payload.slug,
        };
    }

    private mapSearchResult(value: unknown): RawgSearchResult | null {
        if (!isRecord(value)) return null;
        if (!isValidId(value.id) || !validName(value.name)) return null;
        if (!validSlug(value.slug)) return null;

        return {
            rawgId: value.id,
            name: value.name.trim(),
            coverImageUrl: safeImageUrl(value.background_image),
            rawgUrl: new URL(
                `/games/${value.slug}`,
                RAWG_PUBLIC_ORIGIN,
            ).toString(),
        };
    }

    private async request(
        path: string,
        params?: Record<string, string>,
    ): Promise<unknown> {
        if (!this.apiKey) {
            return null;
        }

        const key = `${path}?${new URLSearchParams(params).toString()}`;
        const existing = this.pending.get(key);
        if (existing) return existing;
        const release = this.abuseProtection.tryAcquireProvider('rawg');
        if (!release) return null;

        const url = new URL(path, RAWG_API_ORIGIN);
        url.searchParams.set('key', this.apiKey);
        for (const [key, value] of Object.entries(params ?? {})) {
            url.searchParams.set(key, value);
        }

        const controller = new AbortController();
        let timedOut = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeout = new Promise<null>((resolve) => {
            timeoutId = setTimeout(() => {
                timedOut = true;
                controller.abort();
                this.abuseProtection.recordEvent('provider.rawg.timeout');
                resolve(null);
            }, this.timeoutMs);
        });
        let resolveNonOkFallback!: () => void;
        const nonOkFallback = new Promise<null>((resolve) => {
            resolveNonOkFallback = () => resolve(null);
        });
        const performRequest = async (): Promise<unknown> => {
            try {
                const response = await fetch(url.toString(), {
                    signal: controller.signal,
                });
                if (!response.ok) {
                    resolveNonOkFallback();
                    if (!timedOut) {
                        this.abuseProtection.recordEvent(
                            'provider.rawg.failure',
                        );
                    }
                    try {
                        await response.body?.cancel();
                    } catch {
                        return null;
                    }
                    return null;
                }
                try {
                    const payload: unknown = await response.json();
                    return payload;
                } catch {
                    if (!timedOut) {
                        this.abuseProtection.recordEvent(
                            'provider.rawg.failure',
                        );
                    }
                    return null;
                }
            } catch {
                if (!timedOut) {
                    this.abuseProtection.recordEvent('provider.rawg.failure');
                }
                return null;
            } finally {
                clearTimeout(timeoutId!);
            }
        };
        let physical: Promise<unknown> | undefined;
        const result = observeProvider('rawg', () => {
            physical = performRequest();
            return Promise.race([physical, timeout, nonOkFallback]);
        });
        this.pending.set(key, result);
        void (physical ?? Promise.resolve(null)).then(
            () => {
                if (this.pending.get(key) === result) this.pending.delete(key);
                release();
            },
            () => {
                if (this.pending.get(key) === result) this.pending.delete(key);
                release();
            },
        );
        return result;
    }
}

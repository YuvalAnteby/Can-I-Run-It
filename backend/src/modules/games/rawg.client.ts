import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

    constructor(private readonly config: ConfigService) {
        const key = this.config.get<string>('RAWG_API_KEY');
        this.apiKey = key?.trim() || undefined;
    }

    async search(query: string): Promise<RawgSearchResponse> {
        const payload = await this.request('/api/games', {
            search: query.trim().slice(0, RAWG_QUERY_MAX_LENGTH),
            page_size: String(RAWG_PAGE_SIZE),
        });

        if (!isRecord(payload) || !Array.isArray(payload.results)) {
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
        if (!isRecord(payload)) return null;
        if (
            payload.id !== rawgId ||
            !validName(payload.name) ||
            !validSlug(payload.slug)
        ) {
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
            this.logger.warn('RAWG_API_KEY is not configured');
            return null;
        }

        const url = new URL(path, RAWG_API_ORIGIN);
        url.searchParams.set('key', this.apiKey);
        for (const [key, value] of Object.entries(params ?? {})) {
            url.searchParams.set(key, value);
        }

        try {
            const response = await fetch(url.toString(), {
                signal: AbortSignal.timeout(RAWG_TIMEOUT_MS),
            });
            if (!response.ok) {
                this.logger.warn('RAWG provider unavailable');
                return null;
            }

            try {
                return await response.json();
            } catch {
                this.logger.warn('RAWG provider returned malformed data');
                return null;
            }
        } catch {
            this.logger.warn('RAWG provider request failed');
            return null;
        }
    }
}

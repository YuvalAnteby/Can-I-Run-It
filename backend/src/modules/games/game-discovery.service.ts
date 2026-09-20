import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { PublicAttributionDto } from './dto/client-game.dto';
import { EnrichmentPublisher } from './enrichment-publisher.service';
import { Game } from './entities/game.entity';
import { GameEnrichmentJob } from './entities/game-enrichment-job.entity';
import type { IGamesRepository } from './igames.repository';
import { IGamesRepositoryToken } from './igames.repository';
import type { RawgGameDetail, RawgSearchResponse } from './rawg.service';
import { RawgService } from './rawg.service';

export type GameDiscoveryResult =
    | {
          source: 'local';
          id: number;
          slug: string;
          name: string;
          coverImageUrl: string | null;
          attributions?: PublicAttributionDto[];
      }
    | {
          source: 'rawg';
          rawgId: number;
          name: string;
          coverImageUrl: string | null;
          rawgUrl: string;
      };

export interface GameDiscoveryResponse {
    data: GameDiscoveryResult[];
    rawgAvailable: boolean;
}

export interface SelectedRawgGame {
    id: number;
    slug: string;
    status: 'pending_approval' | 'published';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const safeCoverImage = (value: unknown): string | null => {
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

const rawgAttribution = (game: Game): PublicAttributionDto | undefined => {
    const payload = game.rawgPayload;
    if (
        !Number.isInteger(game.rawgId) ||
        (game.rawgId ?? 0) <= 0 ||
        !payload ||
        payload.id !== game.rawgId ||
        typeof payload.slug !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)
    ) {
        return undefined;
    }

    return {
        source: 'rawg',
        label: 'RAWG',
        url: `https://rawg.io/games/${payload.slug}`,
    };
};

const stringValue = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

const validReleaseDate = (value: unknown): Date | null => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
        ? null
        : date;
};

const firstNamedValue = (value: unknown): string | null => {
    if (!Array.isArray(value)) return null;
    for (const item of value) {
        if (isRecord(item)) {
            const name = stringValue(item.name);
            if (name) return name;
        }
    }
    return null;
};

const namedValues = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!isRecord(item)) return [];
        const name = stringValue(item.name);
        return name ? [name] : [];
    });
};

@Injectable()
export class GameDiscoveryService {
    private readonly logger = new Logger(GameDiscoveryService.name);

    constructor(
        @Inject(IGamesRepositoryToken)
        private readonly gamesRepository: IGamesRepository,
        private readonly rawgService: RawgService,
        private readonly enrichmentPublisher: EnrichmentPublisher,
        @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    ) {}

    async discover(query: string): Promise<GameDiscoveryResponse> {
        const trimmedQuery = query.trim();
        const [localResult, rawgResult] = await Promise.all([
            this.gamesRepository.findAll({
                search: trimmedQuery,
                limit: 8,
                page: 1,
            }),
            this.searchRawg(trimmedQuery),
        ]);
        const [localGames] = localResult;

        const existingRawgGames = rawgResult.results.length
            ? await this.gamesRepository.findByRawgIds(
                  rawgResult.results.map(({ rawgId }) => rawgId),
              )
            : [];
        const hiddenRawgIds = new Set(
            existingRawgGames
                .filter(
                    (game) =>
                        game.status === 'published' ||
                        game.status === 'rejected',
                )
                .map(({ rawgId }) => rawgId),
        );

        return {
            data: [
                ...localGames.map((game) => {
                    const attribution = rawgAttribution(game);
                    return {
                        source: 'local' as const,
                        id: game.id,
                        slug: game.slug,
                        name: game.name,
                        coverImageUrl: game.coverImageUrl ?? null,
                        ...(attribution ? { attributions: [attribution] } : {}),
                    };
                }),
                ...rawgResult.results
                    .filter(({ rawgId }) => !hiddenRawgIds.has(rawgId))
                    .map((result) => ({ source: 'rawg' as const, ...result })),
            ],
            rawgAvailable: rawgResult.available,
        };
    }

    async selectRawgGame(rawgId: number): Promise<SelectedRawgGame> {
        if (!Number.isInteger(rawgId) || rawgId <= 0) {
            throw new BadRequestException('RAWG ID must be a positive integer');
        }

        const existing = await this.gamesRepository.findByRawgId(rawgId);
        if (existing) return this.existingSelection(existing);

        const detail = await this.rawgService.getById(rawgId);
        if (!detail) {
            throw new NotFoundException(`RAWG game "${rawgId}" not found`);
        }

        const result = await this.createGame(detail);
        if (!result.created) return this.existingSelection(result.game);

        try {
            await this.enrichmentPublisher.publishInitial({
                ...({ status: 'queued', attempts: 0 } as GameEnrichmentJob),
                game: result.game,
            });
        } catch {
            this.logger.warn('Initial enrichment publication unavailable');
        }

        return this.selection(result.game);
    }

    private async searchRawg(query: string): Promise<RawgSearchResponse> {
        try {
            return await this.rawgService.search(query);
        } catch {
            this.logger.warn('RAWG discovery unavailable');
            return { available: false, results: [] };
        }
    }

    private existingSelection(game: Game): SelectedRawgGame {
        if (game.status === 'rejected') {
            throw new ConflictException('This RAWG game was rejected');
        }
        return this.selection(game);
    }

    private selection(game: Game): SelectedRawgGame {
        return {
            id: game.id,
            slug: game.slug,
            status: game.status as 'pending_approval' | 'published',
        };
    }

    private async createGame(
        detail: RawgGameDetail,
    ): Promise<{ game: Game; created: boolean }> {
        let slug = detail.slug.slice(0, 100);
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                return await this.dataSource.transaction(async (manager) => {
                    const existing = await manager.findOne(Game, {
                        where: { rawgId: detail.id },
                    });
                    if (existing) return { game: existing, created: false };

                    const game = await manager.save(
                        Game,
                        this.toGameValues(detail, slug),
                    );
                    await manager.save(GameEnrichmentJob, {
                        game,
                        status: 'queued',
                        attempts: 0,
                    });
                    return { game, created: true };
                });
            } catch (error: unknown) {
                if (!this.isUniqueViolation(error)) throw error;

                const winner = await this.gamesRepository.findByRawgId(
                    detail.id,
                );
                if (winner) return { game: winner, created: false };
                if (attempt === 1) throw error;
                slug = this.conflictSlug(detail.slug, detail.id);
            }
        }

        throw new Error('RAWG selection transaction did not complete');
    }

    private toGameValues(detail: RawgGameDetail, slug: string): Partial<Game> {
        const name = detail.name.trim().slice(0, 200);
        const coverImageUrl = safeCoverImage(detail.background_image);
        const releaseDate = validReleaseDate(detail.released);
        const developer =
            firstNamedValue(detail.developers)?.slice(0, 200) ?? null;
        const publisher =
            firstNamedValue(detail.publishers)?.slice(0, 200) ?? null;
        const genre = firstNamedValue(detail.genres)?.slice(0, 100) ?? null;
        const description = stringValue(detail.description_raw);
        const tags = namedValues(detail.tags);
        const sourceUrl = `https://rawg.io/games/${detail.slug}`;
        const metadataProvenance: Record<
            string,
            {
                source: 'rawg';
                sourceUrl: string;
                extractedBy: null;
            }
        > = {};
        const mark = (field: string, value: unknown): void => {
            if (
                value !== null &&
                value !== undefined &&
                (!Array.isArray(value) || value.length > 0)
            ) {
                metadataProvenance[field] = {
                    source: 'rawg',
                    sourceUrl,
                    extractedBy: null,
                };
            }
        };

        mark('name', name);
        mark('coverImageUrl', coverImageUrl);
        mark('releaseDate', releaseDate);
        mark('developer', developer);
        mark('publisher', publisher);
        mark('genre', genre);
        mark('description', description);
        mark('tags', tags);

        return {
            slug,
            name,
            status: 'pending_approval',
            rawgId: detail.id,
            rawgPayload: detail,
            metadataProvenance,
            rejectionReason: null,
            coverImageUrl,
            releaseDate,
            developer,
            publisher,
            genre,
            description,
            tags: tags.length ? tags : null,
            supportsRayTracing: false,
            supportsDlss: false,
            supportsFsr: false,
            supportsXeSS: false,
            isTrending: false,
            trendingRank: null,
        };
    }

    private conflictSlug(slug: string, rawgId: number): string {
        const suffix = `-rawg-${rawgId}`;
        const base = slug.slice(0, 100 - suffix.length - 1).replace(/-+$/, '');
        return `${base || 'selected-game'}${suffix}`;
    }

    private isUniqueViolation(error: unknown): boolean {
        return isRecord(error) && error.code === '23505';
    }
}

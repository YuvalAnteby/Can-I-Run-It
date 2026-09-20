import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { ClientGameDto, PublicAttributionDto } from './dto/client-game.dto';
import { ClientGameRequirementDto } from './dto/client-game-requirement.dto';
import { FilterGameDto } from './dto/filter-game.dto';
import { Game } from './entities/game.entity';
import { GameRequirement } from './entities/game-requirement.entity';
import type { GameStatus } from './game-lifecycle.contract';
import { MOCK_GAMES } from './games.constants';
import type { IGamesRepository } from './igames.repository';
import { IGamesRepositoryToken } from './igames.repository';

const displayedRequirementFields = new Set<keyof ClientGameRequirementDto>([
    'tier',
    'cpu',
    'gpu',
    'ramGb',
    'vramGb',
    'storageGb',
    'requiresSsd',
    'resolutionWidth',
    'resolutionHeight',
    'targetFps',
    'notes',
]);

@Injectable()
export class GamesService {
    private readonly logger = new Logger(GamesService.name);

    constructor(
        @Inject(IGamesRepositoryToken)
        private readonly gameRepository: IGamesRepository,
    ) {}

    async getMockGames(): Promise<ClientGameDto[]> {
        return Promise.resolve(MOCK_GAMES);
    }

    async searchMockGames(query: string): Promise<ClientGameDto[]> {
        if (!query) {
            return Promise.resolve([]);
        }
        const q = query.toLowerCase();
        return Promise.resolve(
            MOCK_GAMES.filter((g) => g.name.toLowerCase().includes(q)),
        );
    }

    /**
     * Fetch paginated games from the database.
     */
    async findPaged(
        filterDto: FilterGameDto,
    ): Promise<PaginatedResult<ClientGameDto>> {
        const [games, total] = await this.gameRepository.findAll(filterDto);

        return {
            data: games.map((game) => this.mapToClientDto(game)),
            meta: {
                total,
                page: filterDto.page || 1,
                lastPage: Math.ceil(total / (filterDto.limit || 10)),
            },
        };
    }

    /**
     * Find a single game by its slug.
     */
    async findBySlug(slug: string): Promise<ClientGameDto> {
        const game = await this.gameRepository.findBySlug(slug);

        if (!game) {
            throw new NotFoundException(`Game with slug "${slug}" not found`);
        }

        return this.mapToClientDto(game);
    }

    async findPendingPageById(id: number): Promise<ClientGameDto> {
        const game = await this.gameRepository.findPendingPageById(id);
        if (!game) {
            throw new NotFoundException(`Game with ID "${id}" not found`);
        }

        return this.mapToClientDto(game);
    }

    /**
     * Maps a Game entity to a ClientGameDto.
     * @param game Game entity to map
     * @returns ClientGameDto object
     */
    private mapToClientDto(game: Game): ClientGameDto {
        const dto: ClientGameDto = {
            id: game.id,
            slug: game.slug,
            name: game.name,
            status: game.status as Exclude<GameStatus, 'rejected'>,
            coverImageUrl: game.coverImageUrl,
            releaseDate: game.releaseDate
                ? new Date(game.releaseDate).toISOString().split('T')[0]
                : null,
            developer: game.developer,
            publisher: game.publisher,
            genre: game.genre,
            description: game.description,
            tags: game.tags ?? [],
            supportsRayTracing: game.supportsRayTracing,
            supportsDlss: game.supportsDlss,
            supportsFsr: game.supportsFsr,
            supportsXeSS: game.supportsXeSS,
            isTrending: game.isTrending,
            trendingRank: game.trendingRank,
            requirements:
                game.requirements?.map((req) =>
                    this.mapRequirementToDto(req),
                ) ?? [],
        };

        const attributions = this.mapPublicAttributions(game, dto);
        if (attributions.length) dto.attributions = attributions;
        return dto;
    }

    private mapPublicAttributions(
        game: Game,
        dto: ClientGameDto,
    ): PublicAttributionDto[] {
        const attributions: PublicAttributionDto[] = [];
        if (
            Number.isInteger(game.rawgId) &&
            (game.rawgId ?? 0) > 0 &&
            game.rawgPayload &&
            typeof game.rawgPayload.id === 'number' &&
            game.rawgPayload.id === game.rawgId &&
            typeof game.rawgPayload.slug === 'string' &&
            /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.rawgPayload.slug)
        ) {
            attributions.push({
                source: 'rawg',
                label: 'RAWG',
                url: `https://rawg.io/games/${game.rawgPayload.slug}`,
            });
        }

        const publicFields = new Set([
            'name',
            'coverImageUrl',
            'releaseDate',
            'developer',
            'publisher',
            'genre',
            'description',
            'tags',
            'supportsRayTracing',
            'supportsDlss',
            'supportsFsr',
            'supportsXeSS',
            'isTrending',
            'trendingRank',
            'requirements',
        ]);
        const pcGamingWikiUrl = Object.entries(
            game.metadataProvenance ?? {},
        ).reduce<string | null>((acceptedUrl, [field, provenance]) => {
            if (acceptedUrl) return acceptedUrl;
            if (provenance?.source !== 'pcgamingwiki') {
                return null;
            }
            let value: unknown;
            if (publicFields.has(field)) {
                value = dto[field as keyof ClientGameDto];
            } else {
                const [root, tier, requirementField, ...extra] =
                    field.split('.');
                if (
                    root !== 'requirements' ||
                    !tier ||
                    !requirementField ||
                    extra.length > 0 ||
                    !displayedRequirementFields.has(
                        requirementField as keyof ClientGameRequirementDto,
                    )
                ) {
                    return null;
                }
                const requirement = dto.requirements.find(
                    (item) => item.tier === tier,
                );
                value =
                    requirement?.[
                        requirementField as keyof ClientGameRequirementDto
                    ];
            }
            if (
                value === null ||
                value === undefined ||
                (Array.isArray(value) && value.length === 0) ||
                (typeof value === 'string' && value.trim() === '')
            ) {
                return null;
            }
            if (typeof provenance.sourceUrl !== 'string') return null;

            try {
                const url = new URL(provenance.sourceUrl);
                return url.origin === 'https://www.pcgamingwiki.com' &&
                    url.pathname.startsWith('/wiki/')
                    ? `${url.origin}${url.pathname}`
                    : null;
            } catch {
                return null;
            }
        }, null);

        if (pcGamingWikiUrl) {
            attributions.push({
                source: 'pcgamingwiki',
                label: 'PCGamingWiki',
                url: pcGamingWikiUrl,
            });
        }

        return attributions;
    }

    private mapRequirementToDto(
        req: GameRequirement,
    ): ClientGameRequirementDto {
        return {
            tier: req.tier,
            description: req.description,
            cpu: req.cpu
                ? {
                      id: req.cpu.id,
                      slug: req.cpu.slug,
                      name: req.cpu.name,
                      manufacturer: req.cpu.manufacturer,
                      tdpWatts: req.cpu.tdpWatts,
                      releaseYear: req.cpu.releaseYear,
                      benchmarks: req.cpu.benchmarks,
                  }
                : null,
            gpu: req.gpu
                ? {
                      id: req.gpu.id,
                      slug: req.gpu.slug,
                      name: req.gpu.name,
                      manufacturer: req.gpu.manufacturer,
                      vramGb: req.gpu.vramGb,
                      shadingUnits: req.gpu.shadingUnits,
                      tdpWatts: req.gpu.tdpWatts,
                      releaseYear: req.gpu.releaseYear,
                      benchmarks: req.gpu.benchmarks,
                  }
                : null,
            ramGb: req.ramGb,
            vramGb: req.vramGb,
            storageGb: req.storageGb,
            requiresSsd: req.requiresSsd,
            resolutionWidth: req.resolutionWidth,
            resolutionHeight: req.resolutionHeight,
            targetFps: req.targetFps,
            notes: req.notes,
        };
    }
}

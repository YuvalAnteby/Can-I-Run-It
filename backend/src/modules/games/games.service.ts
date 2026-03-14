import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { ClientGameDto } from './dto/client-game.dto';
import { FilterGameDto } from './dto/filter-game.dto';
import { Game } from './entities/game.entity';
import { MOCK_GAMES } from './games.constants';
import type { IGamesRepository } from './igames.repository';
import { IGamesRepositoryToken } from './igames.repository';

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

    /**
     * Maps a Game entity to a ClientGameDto.
     * @param game Game entity to map
     * @returns ClientGameDto object
     */
    private mapToClientDto(game: Game): ClientGameDto {
        return {
            id: game.id,
            slug: game.slug,
            name: game.name,
            coverImageUrl: game.coverImageUrl,
            releaseDate: game.releaseDate
                ? new Date(game.releaseDate).toISOString().split('T')[0]
                : null,
            developer: game.developer,
            publisher: game.publisher,
            supportsRayTracing: game.supportsRayTracing,
            supportsDlss: game.supportsDlss,
            supportsFsr: game.supportsFsr,
        };
    }
}

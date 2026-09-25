import { Inject, Injectable } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';

import { FilterGameDto } from './dto/filter-game.dto';
import { Game } from './entities/game.entity';
import { IGamesRepository } from './igames.repository';

const GAME_NAME_SIMILARITY_THRESHOLD = 0.15;

@Injectable()
export class TypeOrmGamesRepository implements IGamesRepository {
    private readonly repo: Repository<Game>;

    constructor(
        @Inject('DATA_SOURCE')
        private dataSource: DataSource,
    ) {
        this.repo = this.dataSource.getRepository(Game);
    }

    async findAll(filterDto: FilterGameDto): Promise<[Game[], number]> {
        const { search, limit = 10, page = 1, sortBy, sortOrder } = filterDto;

        const queryBuilder = this.repo.createQueryBuilder('game');
        queryBuilder.where('game.status = :status', { status: 'published' });

        const normalizedSearch = search?.trim().toLowerCase();
        if (normalizedSearch) {
            queryBuilder.andWhere(
                `(LOWER(game.name) LIKE :search
                  OR word_similarity(:query, LOWER(game.name)) > :threshold)`,
                {
                    search: `%${normalizedSearch}%`,
                    query: normalizedSearch,
                    threshold: GAME_NAME_SIMILARITY_THRESHOLD,
                },
            );
        }

        if (normalizedSearch && !sortBy) {
            queryBuilder
                .orderBy(
                    'CASE WHEN LOWER(game.name) LIKE :search THEN 0 ELSE 1 END',
                    'ASC',
                )
                .addOrderBy('word_similarity(:query, LOWER(game.name))', 'DESC')
                .addOrderBy('game.releaseDate', 'DESC');
        } else if (sortBy) {
            // sortBy is already validated by FilterGameDto @IsIn,
            // but we use an explicit check here for defense-in-depth.
            const allowedFields = [
                'name',
                'releaseDate',
                'developer',
                'publisher',
            ];
            const column = allowedFields.includes(sortBy)
                ? sortBy
                : 'releaseDate';
            queryBuilder.orderBy(`game.${column}`, sortOrder || 'DESC');
        } else {
            queryBuilder.orderBy('game.releaseDate', 'DESC');
        }

        return await queryBuilder
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
    }

    async findBySlug(slug: string): Promise<Game | null> {
        return await this.repo.findOne({
            where: { slug, status: 'published' },
            relations: [
                'gameEngine',
                'requirements',
                'requirements.cpu',
                'requirements.gpu',
            ],
        });
    }

    async findPendingPageById(id: number): Promise<Game | null> {
        return await this.repo.findOne({
            where: {
                id,
                status: In(['pending_approval', 'published']),
            },
            relations: ['requirements', 'requirements.cpu', 'requirements.gpu'],
        });
    }

    async findByRawgId(rawgId: number): Promise<Game | null> {
        return await this.repo.findOne({ where: { rawgId } });
    }

    async findByRawgIds(rawgIds: number[]): Promise<Game[]> {
        if (rawgIds.length === 0) return [];
        return await this.repo.find({ where: { rawgId: In(rawgIds) } });
    }
}

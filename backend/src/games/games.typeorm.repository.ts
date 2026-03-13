import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { FilterGameDto } from './dto/filter-game.dto';
import { Game } from './entities/game.entity';
import { IGamesRepository } from './igames.repository';

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

        if (search) {
            queryBuilder.where('game.name ILIKE :search', {
                search: `%${search}%`,
            });
        }

        if (sortBy) {
            queryBuilder.orderBy(`game.${sortBy}`, sortOrder || 'DESC');
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
            where: { slug },
            relations: ['gameEngine'],
        });
    }
}

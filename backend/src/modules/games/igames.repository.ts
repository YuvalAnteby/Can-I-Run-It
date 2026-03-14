import { FilterGameDto } from './dto/filter-game.dto';
import { Game } from './entities/game.entity';

export interface IGamesRepository {
    /**
     * Find all games with given filters.
     * @param filter filter and pagination parameters
     */
    findAll(filter: FilterGameDto): Promise<[Game[], number]>;

    /**
     * Finds a game by its slug.
     * @param slug slug value to search
     */
    findBySlug(slug: string): Promise<Game | null>;
}

export const IGamesRepositoryToken = 'IGamesRepository';

import { FilterGameDto } from './dto/filter-game.dto';
import { Game } from './entities/game.entity';

export interface IGamesRepository {
    /**
     * Find published games with given filters for public API responses.
     * @param filter filter and pagination parameters
     */
    findAll(filter: FilterGameDto): Promise<[Game[], number]>;

    /**
     * Finds a published game by its slug for public API responses.
     * @param slug slug value to search
     */
    findBySlug(slug: string): Promise<Game | null>;
}

export const IGamesRepositoryToken = 'IGamesRepository';

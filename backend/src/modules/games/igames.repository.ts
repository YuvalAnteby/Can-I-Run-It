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

    /** Finds pending or published pages by internal ID. */
    findPendingPageById(id: number): Promise<Game | null>;

    /** Finds a game by its durable RAWG identity. */
    findByRawgId(rawgId: number): Promise<Game | null>;

    /** Finds all local rows matching durable RAWG identities. */
    findByRawgIds(rawgIds: number[]): Promise<Game[]>;
}

export const IGamesRepositoryToken = 'IGamesRepository';

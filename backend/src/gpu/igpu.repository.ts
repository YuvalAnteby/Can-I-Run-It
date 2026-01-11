import { Gpu } from './entities/gpu.entity';
import { GpusFilterDto } from './dto/filter-gpu-dto';

export interface IGpuRepository {
    /**
     * Find all GPUs with given filters.
     * If no filters were given will fetch all GPUs with pagination.
     * @param filter filter and pagination parameters
     */
    findAll(filter: GpusFilterDto): Promise<[Gpu[], number]>;

    /**
     * Finds a GPU by its slug attribute.
     * @param slug slug value to search
     */
    findBySlug(slug: string): Promise<Gpu | null>;

    /**
     * Finds GPUs by their name.
     * @param q search query to search by
     */
    searchByName(query: string): Promise<Gpu[]>;
}

// a constant string to use as the Injection Token
export const IGpuRepositoryToken = 'IGpuRepository';

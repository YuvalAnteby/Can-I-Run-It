import { CpuFilterDto } from './dto/filter-cpu-dto';
import { Cpu } from './entities/cpu.entity';

export interface ICpuRepository {
    /**
     * Find all CPUs with given filters.
     * If no filters were given will fetch all CPUs with pagination.
     * @param filter filter and pagination parameters
     */
    findAll(filter: CpuFilterDto): Promise<[Cpu[], number]>;

    /**
     * Finds a CPU by its slug attribute.
     * @param slug slug value to search
     */
    findBySlug(slug: string): Promise<Cpu | null>;

    /**
     * Finds a CPU by its ID.
     * @param id ID to search
     */
    findById(id: number): Promise<Cpu | null>;

    /**
     * Finds CPUs by their name.
     * @param q search query to search by
     */
    searchByName(q: string): Promise<Cpu[]>;
}

// a constant string to use as the Injection Token
export const ICpuRepositoryToken = 'ICpuRepository';

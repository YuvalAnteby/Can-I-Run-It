import { Gpu } from './entities/gpu.entity';
import { GpusFilterDto } from './dto/filter-gpu-dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';

export interface IGpuRepository {
    findAll(filter: GpusFilterDto): Promise<[Gpu[], number]>;
    findBySlug(slug: string): Promise<Gpu | null>;
    searchByName(query: string): Promise<Gpu[]>;
}

// a constant string to use as the Injection Token
export const IGpuRepositoryToken = 'IGpuRepository';

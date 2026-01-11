import { Cpu } from './entities/cpu.entity';
import { CpuFilterDto } from './dto/filter-cpu-dto';

export interface ICpuRepository {
    findAll(filter: CpuFilterDto): Promise<[Cpu[], number]>;
    findBySlug(slug: string): Promise<Cpu | null>;
    searchByName(q: string): Promise<Cpu[]>;
}

// a constant string to use as the Injection Token
export const ICpuRepositoryToken = 'ICpuRepository';

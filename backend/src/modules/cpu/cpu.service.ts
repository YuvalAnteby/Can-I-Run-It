import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResult } from 'src/common/dto/paginated-result.dto';

import { ClientCpuDto } from './dto/client-cpu-dto';
import { CpuFilterDto } from './dto/filter-cpu-dto';
import { CpuSearchDto } from './dto/search-cpu-dto';
import { Cpu } from './entities/cpu.entity';
import type { ICpuRepository } from './icpu.repository';
import { ICpuRepositoryToken } from './icpu.repository';

@Injectable()
export class CpuService {
    constructor(
        @Inject(ICpuRepositoryToken)
        private readonly cpuRepository: ICpuRepository,
    ) {}

    /**
     * Get a paginated list of CPUs
     * @param filterDTO - The filter and pagination parameters
     * @returns A paginated list of CPUs
     */
    async findAll(
        filterDTO: CpuFilterDto,
    ): Promise<PaginatedResult<ClientCpuDto>> {
        const { page, limit } = filterDTO;

        const [results, total] = await this.cpuRepository.findAll(filterDTO);

        return {
            data: results.map((cpu) => this.toClientCpuDto(cpu)),
            meta: { total, page: page, lastPage: Math.ceil(total / limit) },
        };
    }

    /**
     * Search for CPUs by name
     * @param searchDTO - The search parameters
     * @returns A list of CPUs matching the search query
     */
    async searchByName(searchDTO: CpuSearchDto): Promise<ClientCpuDto[]> {
        const { q } = searchDTO;
        const res: Cpu[] = await this.cpuRepository.searchByName(q);

        return res.map((cpu) => this.toClientCpuDto(cpu));
    }

    /**
     * Get a CPU by its slug
     * @param slug - The slug of the CPU
     * @returns The CPU with the given slug
     */
    async findOne(slug: string): Promise<ClientCpuDto> {
        const res: Cpu | null = await this.cpuRepository.findBySlug(slug);

        if (!res)
            throw new NotFoundException(`CPU with slug "${slug}" not found`);

        return this.toClientCpuDto(res);
    }

    // Helper method to convert Cpu entity to ClientCpuDto
    private toClientCpuDto(cpu: Cpu): ClientCpuDto {
        return {
            id: cpu.id,
            slug: cpu.slug,
            name: cpu.name,
            manufacturer: cpu.manufacturer,
            tdp_watts: cpu.tdp_watts,
            release_year: cpu.release_year,
            benchmarks: cpu.benchmarks,
        };
    }
}

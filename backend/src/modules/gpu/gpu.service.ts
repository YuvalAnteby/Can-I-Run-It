import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import { ClientGpuDto } from './dto/client-gpu-dto';
import { GpusFilterDto } from './dto/filter-gpu-dto';
import { GpuSearchDto } from './dto/search-gpu-dto';
import { Gpu } from './entities/gpu.entity';
import type { IGpuRepository } from './igpu.repository';
import { IGpuRepositoryToken } from './igpu.repository';

@Injectable()
export class GpuService {
    constructor(
        @Inject(IGpuRepositoryToken)
        private readonly gpuRepository: IGpuRepository,
    ) {}

    /**
     * Get a paginated list of GPUs
     * @param filterDTO - The filter and pagination parameters
     * @returns A paginated list of GPUs
     */
    async findAll(
        filterDTO: GpusFilterDto,
    ): Promise<PaginatedResult<ClientGpuDto>> {
        const { page, limit } = filterDTO;

        const [results, total] = await this.gpuRepository.findAll(filterDTO);

        return {
            data: results.map((gpu) => this.toClientGpuDto(gpu)),
            meta: { total, page: page, lastPage: Math.ceil(total / limit) },
        };
    }

    /**
     * Search for GPUs by name
     * @param searchDTO - The search parameters
     * @returns A list of GPUs matching the search query
     */
    async searchByName(searchDTO: GpuSearchDto): Promise<ClientGpuDto[]> {
        const { q } = searchDTO;
        const res: Gpu[] = await this.gpuRepository.searchByName(q);

        return res.map((gpu) => this.toClientGpuDto(gpu));
    }

    /**
     * Get a GPU by its slug
     * @param slug - The slug of the GPU
     * @returns The GPU with the given slug
     */
    async findOne(slug: string): Promise<ClientGpuDto> {
        const res: Gpu | null = await this.gpuRepository.findBySlug(slug);
        if (!res)
            throw new NotFoundException(`GPU with slug "${slug}" not found`);

        return this.toClientGpuDto(res);
    }

    /**
     * Get a GPU by its ID
     * @param id - The ID of the GPU
     * @returns The GPU with the given ID
     */
    async findById(id: number): Promise<ClientGpuDto> {
        const res: Gpu | null = await this.gpuRepository.findById(id);
        if (!res) throw new NotFoundException(`GPU with ID "${id}" not found`);

        return this.toClientGpuDto(res);
    }

    // Helper method to convert Gpu entity to ClientGpuDto
    private toClientGpuDto(gpu: Gpu): ClientGpuDto {
        return {
            id: gpu.id,
            slug: gpu.slug,
            name: gpu.name,
            manufacturer: gpu.manufacturer,
            vram_gb: gpu.vram_gb,
            shading_units: gpu.shading_units,
            tdp_watts: gpu.tdp_watts,
            release_year: gpu.release_year,
            benchmarks: gpu.benchmarks,
        };
    }
}

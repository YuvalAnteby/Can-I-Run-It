import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { GpuSearchDto } from './dto/search-gpu-dto';
import { GpusFilterDto } from './dto/filter-gpu-dto';
import { Gpu } from './entities/gpu.entity';
import { ClientGpuDto } from './dto/client-gpu-dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';

@Injectable()
export class GpuService {
    constructor(
        @Inject('GPU_REPOSITORY')
        private gpuRepository: Repository<Gpu>,
    ) {}

    /**
     * Get a paginated list of GPUs
     * @param filterDTO - The filter and pagination parameters
     * @returns A paginated list of GPUs
     */
    async findAll(
        filterDTO: GpusFilterDto,
    ): Promise<PaginatedResult<ClientGpuDto>> {
        // Destruct filterDTO with default values
        const { page = 1, limit = 10, manufacturer, minVram } = filterDTO;
        const skip = (page - 1) * limit;

        // Apply Filters
        const queryBuilder = this.gpuRepository.createQueryBuilder('gpu');

        if (manufacturer)
            queryBuilder.andWhere('gpu.manufacturer = :manufacturer', {
                manufacturer,
            });

        if (minVram) queryBuilder.andWhere('gpu.vram >= :minVram', { minVram });

        // Apply Pagination
        queryBuilder.orderBy('gpu.id', 'ASC').skip(skip).take(limit);

        const [results, total] = await queryBuilder.getManyAndCount();

        return {
            data: results.map((gpu) => ({
                id: gpu.id,
                slug: gpu.slug,
                name: gpu.name,
                manufacturer: gpu.manufacturer,
            })),
            meta: { total, page, lastPage: Math.ceil(total / limit) },
        };
    }

    /**
     * Search for GPUs by name
     * @param searchDTO - The search parameters
     * @returns A list of GPUs matching the search query
     */
    async searchByName(searchDTO: GpuSearchDto): Promise<ClientGpuDto[]> {
        const { q } = searchDTO;

        const res = await this.gpuRepository
            .createQueryBuilder('gpus')
            .select(['gpus.id', 'gpus.slug', 'gpus.name', 'gpus.manufacturer'])
            // WORD_SIMILARITY checks if 'rxt' is similar to any word INSIDE 'NVIDIA GeForce RTX...'
            // We set a threshold of 0.3 to catch typos (adjust 0.1-1.0 as needed)
            .where('word_similarity(:query, gpus.name) > 0.3', { query: q })
            // Sort by best match first
            .orderBy('word_similarity(:query, gpus.name)', 'DESC')
            .getMany();

        console.log(`Found results`, res);

        return res.map((gpu) => ({
            id: gpu.id,
            slug: gpu.slug,
            name: gpu.name,
            manufacturer: gpu.manufacturer,
        }));
    }

    /**
     * Get a GPU by its slug
     * @param slug - The slug of the GPU
     * @returns The GPU with the given slug
     */
    async findOne(slug: string): Promise<ClientGpuDto> {
        const res: Gpu | null = await this.gpuRepository.findOneBy({ slug });
        if (!res)
            throw new NotFoundException(`GPU with slug "${slug}" not found`);

        return res as ClientGpuDto;
    }
}

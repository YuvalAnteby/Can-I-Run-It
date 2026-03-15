import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { GpusFilterDto } from './dto/filter-gpu-dto';
import { Gpu } from './entities/gpu.entity';
import { IGpuRepository } from './igpu.repository';

@Injectable()
export class TypeOrmGpuRepository implements IGpuRepository {
    private readonly repo: Repository<Gpu>;

    constructor(
        @Inject('DATA_SOURCE')
        private dataSource: DataSource,
    ) {
        this.repo = this.dataSource.getRepository(Gpu);
    }

    async findAll(filterDTO: GpusFilterDto): Promise<[Gpu[], number]> {
        // Destruct filterDTO with default values
        const { page, limit, manufacturer, minVram } = filterDTO;
        const skip = (page - 1) * limit;

        const qb = this.repo.createQueryBuilder('gpu');
        if (manufacturer)
            qb.andWhere('gpu.manufacturer = :manufacturer', { manufacturer });
        if (minVram) qb.andWhere('gpu.vram_gb >= :minVram', { minVram });

        return await qb
            .orderBy('gpu.id', 'ASC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();
    }

    async findBySlug(slug: string): Promise<Gpu | null> {
        return await this.repo.findOneBy({ slug });
    }

    async searchByName(q: string): Promise<Gpu[]> {
        const SIMILARITY_THRESHOLD = 0.3;
        return await this.repo
            .createQueryBuilder('gpu')
            .select([
                'gpu.id',
                'gpu.slug',
                'gpu.name',
                'gpu.manufacturer',
                'gpu.vram_gb',
                'gpu.shading_units',
                'gpu.tdp_watts',
                'gpu.release_year',
                'gpu.benchmarks',
            ])
            // WORD_SIMILARITY checks if 'rxt' is similar to any word INSIDE 'NVIDIA GeForce RTX...'
            // We set a threshold of 0.3 to catch typos (adjust 0.1-1.0 as needed)
            .where('word_similarity(:query, gpu.name) > :threshold', {
                query: q,
                threshold: SIMILARITY_THRESHOLD,
            })
            // Sort by best match first
            .orderBy('word_similarity(:query, gpu.name)', 'DESC')
            .take(20)
            .getMany();
    }
}

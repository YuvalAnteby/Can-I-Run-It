import { Inject, Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { CpuFilterDto } from './dto/filter-cpu-dto';
import { Cpu } from './entities/cpu.entity';
import { ICpuRepository } from './icpu.repository';

@Injectable()
export class TypeOrmCpuRepository implements ICpuRepository {
    private readonly repo: Repository<Cpu>;

    constructor(
        @Inject('DATA_SOURCE')
        private dataSource: DataSource,
    ) {
        this.repo = this.dataSource.getRepository(Cpu);
    }

    async findAll(filterDTO: CpuFilterDto): Promise<[Cpu[], number]> {
        // Destruct filterDTO with default values
        const { page, limit, manufacturer } = filterDTO;
        const skip = (page - 1) * limit;

        const qb = this.repo.createQueryBuilder('cpu');
        if (manufacturer)
            qb.andWhere('gpu.manufacturer = :manufacturer', { manufacturer });

        return await qb
            .orderBy('cpu.id', 'ASC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();
    }

    async findBySlug(slug: string): Promise<Cpu | null> {
        return await this.repo.findOneBy({ slug });
    }

    async searchByName(q: string): Promise<Cpu[]> {
        const SIMILARITY_THRESHOLD = 0.3;
        return await this.repo
            .createQueryBuilder('cpu')
            .select(['cpu.id', 'cpu.slug', 'cpu.name', 'cpu.manufacturer'])
            // WORD_SIMILARITY checks if 'rxt' is similar to any word INSIDE 'NVIDIA GeForce RTX...'
            // We set a threshold of 0.3 to catch typos (adjust 0.1-1.0 as needed)
            .where('word_similarity(:query, gpu.name) > threshold', {
                query: q,
                threshold: SIMILARITY_THRESHOLD,
            })
            // Sort by best match first
            .orderBy('word_similarity(:query, gpu.name)', 'DESC')
            .getMany();
    }
}

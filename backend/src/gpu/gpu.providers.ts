import { DataSource } from 'typeorm';
import { Gpu } from './entities/gpu.entity';

export const gpuProviders = [
    {
        provide: 'GPU_REPOSITORY',
        useFactory: (dataSource: DataSource) => dataSource.getRepository(Gpu),
        inject: ['DATA_SOURCE'],
    },
];

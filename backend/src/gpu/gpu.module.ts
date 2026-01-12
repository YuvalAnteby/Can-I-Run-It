import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';

import { GpuController } from './gpu.controller';
import { GpuService } from './gpu.service';
import { TypeOrmGpuRepository } from './gpu.typeorm.repository';
import { IGpuRepositoryToken } from './igpu.repository';

@Module({
    imports: [DatabaseModule],
    controllers: [GpuController],
    providers: [
        GpuService,
        {
            provide: IGpuRepositoryToken,
            useClass: TypeOrmGpuRepository,
        },
    ],
})
export class GpuModule {}

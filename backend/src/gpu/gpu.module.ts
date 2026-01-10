import { Module } from '@nestjs/common';
import { GpuService } from './gpu.service';
import { GpuController } from './gpu.controller';
import { DatabaseModule } from 'src/database/database.module';
import { IGpuRepositoryToken } from './igpu.repository';
import { TypeOrmGpuRepository } from './gpu.typeorm.repository';

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

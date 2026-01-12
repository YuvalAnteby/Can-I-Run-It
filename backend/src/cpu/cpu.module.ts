import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { TypeOrmGpuRepository } from 'src/gpu/gpu.typeorm.repository';

import { CpuController } from './cpu.controller';
import { CpuService } from './cpu.service';
import { ICpuRepositoryToken } from './icpu.repository';

@Module({
    imports: [DatabaseModule],
    controllers: [CpuController],
    providers: [
        CpuService,
        {
            provide: ICpuRepositoryToken,
            useClass: TypeOrmGpuRepository,
        },
    ],
})
export class CpuModule {}

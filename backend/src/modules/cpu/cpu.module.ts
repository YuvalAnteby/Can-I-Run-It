import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { CpuController } from './cpu.controller';
import { CpuService } from './cpu.service';
import { TypeOrmCpuRepository } from './gpu.typeorm.repository';
import { ICpuRepositoryToken } from './icpu.repository';

@Module({
    imports: [DatabaseModule],
    controllers: [CpuController],
    providers: [
        CpuService,
        {
            provide: ICpuRepositoryToken,
            useClass: TypeOrmCpuRepository,
        },
    ],
})
export class CpuModule {}

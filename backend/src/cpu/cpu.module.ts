import { Module } from '@nestjs/common';
import { CpuService } from './cpu.service';
import { CpuController } from './cpu.controller';
import { DatabaseModule } from 'src/database/database.module';
import { ICpuRepositoryToken } from './icpu.repository';
import { TypeOrmGpuRepository } from 'src/gpu/gpu.typeorm.repository';

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

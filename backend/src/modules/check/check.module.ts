import { Module } from '@nestjs/common';

import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { DatabaseModule } from '../../database/database.module';
import { CpuModule } from '../cpu/cpu.module';
import { GamesModule } from '../games/games.module';
import { GeminiModule } from '../gemini/gemini.module';
import { GpuModule } from '../gpu/gpu.module';
import { CheckController } from './check.controller';
import { CheckService } from './check.service';

@Module({
    imports: [DatabaseModule, GamesModule, CpuModule, GpuModule, GeminiModule],
    controllers: [CheckController],
    providers: [CheckService, CheckRateLimitGuard],
    exports: [CheckService],
})
export class CheckModule {}

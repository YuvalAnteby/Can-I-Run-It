import { Module } from '@nestjs/common';

import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { DatabaseModule } from '../../database/database.module';
import { GeminiModule } from '../gemini/gemini.module';
import { CheckController } from './check.controller';
import { CheckService } from './check.service';

@Module({
    imports: [DatabaseModule, GeminiModule],
    controllers: [CheckController],
    providers: [CheckService, CheckRateLimitGuard],
})
export class CheckModule {}

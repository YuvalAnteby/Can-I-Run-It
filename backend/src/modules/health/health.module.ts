import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DatabaseModule } from '../../database/database.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
    imports: [TerminusModule, DatabaseModule],
    controllers: [HealthController],
    providers: [HealthService],
})
export class HealthModule {}

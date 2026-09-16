import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DatabaseModule } from '../../database/database.module';
import { MessagingModule } from '../messaging/messaging.module';
import { HealthController } from './health.controller';

@Module({
    imports: [TerminusModule, DatabaseModule, MessagingModule],
    controllers: [HealthController],
})
export class HealthModule {}

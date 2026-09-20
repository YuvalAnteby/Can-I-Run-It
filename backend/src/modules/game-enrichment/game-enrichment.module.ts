import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../../database/database.module';
import { MessagingModule } from '../messaging/messaging.module';
import { GameEnrichmentWorker } from './game-enrichment.worker';
import { GeminiRequirementsService } from './gemini-requirements.service';
import { PcGamingWikiService } from './pcgamingwiki.service';

@Module({
    imports: [ConfigModule, DatabaseModule, MessagingModule],
    providers: [
        Logger,
        PcGamingWikiService,
        GeminiRequirementsService,
        GameEnrichmentWorker,
    ],
})
export class GameEnrichmentModule {}

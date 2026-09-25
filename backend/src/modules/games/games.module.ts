import { Module } from '@nestjs/common';

import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { DatabaseModule } from '../../database/database.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EnrichmentPublisher } from './enrichment-publisher.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { TypeOrmGamesRepository } from './games.typeorm.repository';
import { IGamesRepositoryToken } from './igames.repository';
import { RawgClient } from './rawg.client';

@Module({
    imports: [DatabaseModule, MessagingModule],
    controllers: [GamesController],
    providers: [
        CheckRateLimitGuard,
        GamesService,
        RawgClient,
        EnrichmentPublisher,
        {
            provide: IGamesRepositoryToken,
            useClass: TypeOrmGamesRepository,
        },
    ],
    exports: [GamesService],
})
export class GamesModule {}

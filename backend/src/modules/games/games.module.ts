import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { MessagingModule } from '../messaging/messaging.module';
import { EnrichmentPublisher } from './enrichment-publisher.service';
import { GameDiscoveryService } from './game-discovery.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { TypeOrmGamesRepository } from './games.typeorm.repository';
import { IGamesRepositoryToken } from './igames.repository';
import { RawgService } from './rawg.service';

@Module({
    imports: [DatabaseModule, MessagingModule],
    controllers: [GamesController],
    providers: [
        GamesService,
        RawgService,
        EnrichmentPublisher,
        GameDiscoveryService,
        {
            provide: IGamesRepositoryToken,
            useClass: TypeOrmGamesRepository,
        },
    ],
    exports: [GamesService],
})
export class GamesModule {}

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { TypeOrmGamesRepository } from './games.typeorm.repository';
import { IGamesRepositoryToken } from './igames.repository';

@Module({
    imports: [DatabaseModule],
    controllers: [GamesController],
    providers: [
        GamesService,
        {
            provide: IGamesRepositoryToken,
            useClass: TypeOrmGamesRepository,
        },
    ],
    exports: [GamesService],
})
export class GamesModule {}

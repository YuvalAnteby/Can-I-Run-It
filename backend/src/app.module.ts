import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CpuModule } from './modules/cpu/cpu.module';
import { GamesModule } from './modules/games/games.module';
import { GpuModule } from './modules/gpu/gpu.module';
import { HealthModule } from './modules/health/health.module';

@Module({
    imports: [
        TerminusModule,
        DatabaseModule,
        HealthModule,
        CpuModule,
        GpuModule,
        GamesModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CpuModule } from './cpu/cpu.module';
import { DatabaseModule } from './database/database.module';
import { GamesModule } from './games/games.module';
import { GpuModule } from './gpu/gpu.module';
import { HealthModule } from './health/health.module';

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

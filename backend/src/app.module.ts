import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CheckModule } from './modules/check/check.module';
import { CpuModule } from './modules/cpu/cpu.module';
import { GamesModule } from './modules/games/games.module';
import { GpuModule } from './modules/gpu/gpu.module';
import { HealthModule } from './modules/health/health.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        TerminusModule,
        DatabaseModule,
        HealthModule,
        CpuModule,
        GpuModule,
        GamesModule,
        CheckModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AbuseProtectionModule } from './common/abuse-protection/abuse-protection.module';
import { shutdownTelemetry } from './common/observability/telemetry-bootstrap';
import { validateAbuseProtectionConfig } from './config/abuse-protection.config';
import { DatabaseModule } from './database/database.module';
import { CheckModule } from './modules/check/check.module';
import { CpuModule } from './modules/cpu/cpu.module';
import { GamesModule } from './modules/games/games.module';
import { GpuModule } from './modules/gpu/gpu.module';
import { HealthModule } from './modules/health/health.module';

const telemetryShutdownProvider = {
    provide: 'TELEMETRY_SHUTDOWN',
    useFactory: () => ({
        onApplicationShutdown: async (): Promise<void> => {
            await shutdownTelemetry();
        },
    }),
};

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: validateAbuseProtectionConfig,
        }),
        AbuseProtectionModule,
        TerminusModule,
        DatabaseModule,
        HealthModule,
        CpuModule,
        GpuModule,
        GamesModule,
        CheckModule,
    ],
    controllers: [AppController],
    providers: [AppService, telemetryShutdownProvider],
})
export class AppModule {}

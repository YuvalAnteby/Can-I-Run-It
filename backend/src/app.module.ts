import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { CpuModule } from './cpu/cpu.module';
import { GpuModule } from './gpu/gpu.module';

@Module({
    imports: [
        TerminusModule,
        DatabaseModule,
        HealthModule,
        CpuModule,
        GpuModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}

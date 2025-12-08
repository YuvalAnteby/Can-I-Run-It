import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import {
    HealthCheckService,
    TypeOrmHealthIndicator,
    HealthCheck,
} from '@nestjs/terminus';
import { DataSource } from 'typeorm';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private db: TypeOrmHealthIndicator,
        @Inject('DATA_SOURCE')
        private dataSource: DataSource,
    ) {}

    @Get('/postgres')
    @HealthCheck()
    check() {
        return this.health.check([
            () =>
                this.db.pingCheck('database', { connection: this.dataSource }),
        ]);
    }
}

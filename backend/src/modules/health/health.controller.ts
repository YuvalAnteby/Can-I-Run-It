import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    HealthCheck,
    HealthCheckResult,
    HealthCheckService,
    TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { DataSource } from 'typeorm';

@ApiTags('health')
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
    @ApiOperation({ summary: 'Check the health of the PostgreSQL connection' })
    @ApiOkResponse({ description: 'The health check result' })
    check(): Promise<HealthCheckResult> {
        return this.health.check([
            () =>
                this.db.pingCheck('database', { connection: this.dataSource }),
        ]);
    }
}

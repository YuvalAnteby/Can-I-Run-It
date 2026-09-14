import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    HealthCheck,
    HealthCheckResult,
    HealthCheckService,
    HealthIndicatorService,
    TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { DataSource } from 'typeorm';

import { RabbitMqService } from '../messaging/rabbitmq.service';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private db: TypeOrmHealthIndicator,
        private rabbitMqIndicator: HealthIndicatorService,
        private rabbitMq: RabbitMqService,
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

    @Get('/rabbitmq')
    @HealthCheck()
    @ApiOperation({ summary: 'Check the health of the RabbitMQ connection' })
    @ApiOkResponse({ description: 'The health check result' })
    checkRabbitMq(): Promise<HealthCheckResult> {
        return this.health.check([
            () => {
                const indicator = this.rabbitMqIndicator.check('rabbitmq');
                return this.rabbitMq.isConnected()
                    ? indicator.up()
                    : indicator.down();
            },
        ]);
    }
}

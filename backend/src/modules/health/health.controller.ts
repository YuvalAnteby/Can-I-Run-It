import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult } from '@nestjs/terminus';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
    constructor(private readonly health: HealthService) {}

    @Get('/live')
    @ApiOperation({ summary: 'Check that the API process is live' })
    @ApiOkResponse({ description: 'The API process is live' })
    live(): { status: 'ok' } {
        return this.health.live();
    }

    @Get('/ready')
    @ApiOperation({ summary: 'Check PostgreSQL readiness' })
    @ApiOkResponse({ description: 'PostgreSQL is ready' })
    @ApiResponse({ status: 503, description: 'PostgreSQL is unavailable' })
    ready(): Promise<{ status: 'ok' }> {
        return this.health.ready();
    }

    @Get('/postgres')
    @HealthCheck()
    @ApiOperation({ summary: 'Check the health of the PostgreSQL connection' })
    @ApiOkResponse({ description: 'The health check result' })
    check(): Promise<HealthCheckResult> {
        return this.health.postgres();
    }
}

import {
    Inject,
    Injectable,
    ServiceUnavailableException,
} from '@nestjs/common';
import {
    HealthCheckResult,
    HealthCheckService,
    TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
    constructor(
        private readonly health: HealthCheckService,
        private readonly database: TypeOrmHealthIndicator,
        @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
    ) {}

    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    async ready(): Promise<{ status: 'ok' }> {
        try {
            await this.health.check([
                () =>
                    this.database.pingCheck('database', {
                        connection: this.dataSource,
                        timeout: 1_000,
                    }),
            ]);
            return { status: 'ok' };
        } catch {
            throw new ServiceUnavailableException({ status: 'unavailable' });
        }
    }

    postgres(): Promise<HealthCheckResult> {
        return this.health.check([
            () =>
                this.database.pingCheck('database', {
                    connection: this.dataSource,
                }),
        ]);
    }
}

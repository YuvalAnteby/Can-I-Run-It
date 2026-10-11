import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { buildDatabaseOptions } from './database.config';
import {
    AzureBaseline1790985600000,
    PerformanceSource1790985600001,
    RuntimeGrants1790985600002,
} from './migrations';

export function migrationDataSource(
    env: NodeJS.ProcessEnv = process.env,
): DataSource {
    return new DataSource({
        ...buildDatabaseOptions(env),
        migrations: [
            AzureBaseline1790985600000,
            PerformanceSource1790985600001,
            RuntimeGrants1790985600002,
        ],
    });
}

export const AppDataSource = migrationDataSource();

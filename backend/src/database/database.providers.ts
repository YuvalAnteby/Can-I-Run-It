import { DataSource } from 'typeorm';

import {
    buildDatabaseOptions,
    initializeDatabase,
    startupRetryBudgetMs,
} from './database.config';

export const databaseProviders = [
    {
        provide: 'DATA_SOURCE',
        useFactory: (): Promise<DataSource> => {
            return initializeDatabase(
                new DataSource(buildDatabaseOptions()),
                startupRetryBudgetMs(),
            );
        },
    },
];

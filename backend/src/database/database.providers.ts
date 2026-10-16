import { DataSource } from 'typeorm';

import { buildDatabaseOptions } from './database.config';

export const databaseProviders = [
    {
        provide: 'DATA_SOURCE',
        useFactory: async (): Promise<DataSource> => {
            const dataSource = new DataSource(buildDatabaseOptions());

            return dataSource.initialize();
        },
    },
];

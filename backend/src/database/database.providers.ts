import { DataSource } from 'typeorm';

import { databaseOptions, initializeDatabase } from './connection-options';

export const databaseProviders = [
    {
        provide: 'DATA_SOURCE',
        useFactory: async (): Promise<DataSource> => {
            return initializeDatabase(new DataSource(databaseOptions()));
        },
    },
];

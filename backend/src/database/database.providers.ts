import { DataSource } from 'typeorm';

export const databaseProviders = [
    {
        provide: 'DATA_SOURCE',
        useFactory: async () => {
            const dataSource = new DataSource({
                type: 'postgres',
                host: process.env.POSTGRES_HOST || 'postgres',
                port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
                username: process.env.POSTGRES_USER || 'username',
                password: process.env.POSTGRES_PASSWORD || 'changeme',
                database: process.env.POSTGRES_DB || 'myciridb',
                entities: [__dirname + '/../**/*.entity.{js,ts}'],
                synchronize: process.env.NODE_ENV === 'development',
            });

            return dataSource.initialize();
        },
    },
];

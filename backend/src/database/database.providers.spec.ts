import { DataSource } from 'typeorm';

import { databaseProviders } from './database.providers';

describe('database providers', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        jest.restoreAllMocks();
        if (originalNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = originalNodeEnv;
        }
    });

    it('keeps TypeORM schema synchronization disabled in development', async () => {
        process.env.NODE_ENV = 'development';
        jest.spyOn(DataSource.prototype, 'initialize').mockImplementation(
            function (this: DataSource): Promise<DataSource> {
                return Promise.resolve(this);
            },
        );

        const dataSource = await databaseProviders[0].useFactory();

        expect(dataSource.options.synchronize).toBe(false);
    });
});

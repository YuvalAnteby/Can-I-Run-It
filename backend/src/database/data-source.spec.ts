import { DataSource } from 'typeorm';

import { AppDataSource, migrationDataSource } from './data-source';

describe('migration data source boundary', () => {
    it('exports an uninitialized CLI data source with all migrations and no synchronization', () => {
        const source = migrationDataSource({
            POSTGRES_HOST: 'postgres',
            POSTGRES_PORT: '5432',
            POSTGRES_USER: 'username',
            POSTGRES_DB: 'ciri',
            POSTGRES_PASSWORD: 'local-password',
        });

        expect(source).toBeInstanceOf(DataSource);
        expect(source.isInitialized).toBe(false);
        expect(source.options.synchronize).toBe(false);
        expect(source.options.migrations).toHaveLength(3);
        expect(AppDataSource.isInitialized).toBe(false);
    });
});

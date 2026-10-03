import { DataSource } from 'typeorm';

import { databaseOptions, initializeDatabase } from './connection-options';

describe('database connection boundary', () => {
    const base = {
        POSTGRES_HOST: 'postgres',
        POSTGRES_USER: 'username',
        POSTGRES_DB: 'ciri',
        POSTGRES_PASSWORD: 'local',
    };
    it('keeps password Compose mode and bounded pool settings', () => {
        const options = databaseOptions(base);
        expect(options.ssl).toBe(false);
        expect(options.password).toBe('local');
        expect(options.poolSize).toBe(5);
        expect(options.synchronize).toBe(false);
    });
    it.each([
        { POSTGRES_AUTH_MODE: 'bad' },
        { POSTGRES_SSL_MODE: 'require' },
        { POSTGRES_POOL_MAX: '6' },
        { POSTGRES_POOL_MAX: '0' },
        { POSTGRES_AUTH_MODE: 'entra' },
        {
            POSTGRES_AUTH_MODE: 'entra',
            POSTGRES_SSL_MODE: 'verify-full',
            AZURE_CLIENT_ID: 'invalid',
        },
    ])('rejects invalid configuration %j', (env) => {
        expect(() => databaseOptions({ ...base, ...env })).toThrow();
    });
    it('passes a fresh async password callback through the real TypeORM pg adapter', async () => {
        let calls = 0;
        const credential = {
            getToken: () =>
                Promise.resolve({
                    token: `token-${++calls}`,
                    expiresOnTimestamp: Date.now() + 120000,
                }),
        };
        const options = databaseOptions(
            {
                ...base,
                POSTGRES_PASSWORD: '',
                POSTGRES_AUTH_MODE: 'entra',
                POSTGRES_SSL_MODE: 'verify-full',
                AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
            },
            credential,
        );
        const dataSource = new DataSource(options);
        const driver = dataSource.driver as unknown as {
            createPool: (
                options: unknown,
                credentials: unknown,
            ) => Promise<unknown>;
            postgres: { Pool: unknown };
        };
        let password: (() => Promise<string>) | undefined;
        driver.postgres.Pool = class {
            constructor(config: {
                password: () => Promise<string>;
                ssl: { rejectUnauthorized: boolean };
            }) {
                password = config.password;
                expect(config.ssl.rejectUnauthorized).toBe(true);
            }
            on() {}
            connect(
                cb: (
                    error: null,
                    connection: { on: () => void },
                    release: () => void,
                ) => void,
            ) {
                cb(null, { on() {} }, () => undefined);
            }
        };
        await driver.createPool(options, options);
        expect(await password!()).toBe('token-1');
        expect(await password!()).toBe('token-2');
    });
    it('rejects expired tokens and never falls back to a password', async () => {
        const options = databaseOptions(
            {
                ...base,
                POSTGRES_PASSWORD: '',
                POSTGRES_AUTH_MODE: 'entra',
                POSTGRES_SSL_MODE: 'verify-full',
                AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
            },
            {
                getToken: () =>
                    Promise.resolve({
                        token: 'expired',
                        expiresOnTimestamp: Date.now() - 1,
                    }),
            },
        );
        const password = (options.extra as { password: () => Promise<string> })
            .password;
        await expect(password()).rejects.toThrow('expired');
    });
    it('retries initial connections only within the finite attempt budget', async () => {
        let calls = 0;
        const source = {
            initialize: () => {
                if (++calls < 3) return Promise.reject(new Error('offline'));
                return Promise.resolve(source);
            },
        } as unknown as DataSource;
        expect(await initializeDatabase(source, 3, 0)).toBe(source);
        expect(calls).toBe(3);
        const offline = {
            initialize: () => {
                return Promise.reject(new Error('offline'));
            },
        } as unknown as DataSource;
        await expect(initializeDatabase(offline, 2, 0)).rejects.toThrow(
            'offline',
        );
    });
});

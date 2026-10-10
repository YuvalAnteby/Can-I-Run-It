import type { PeerCertificate } from 'node:tls';

import { ManagedIdentityCredential } from '@azure/identity';
import { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import {
    buildDatabaseOptions,
    initializeDatabase,
    initializeMaintenanceDatabase,
} from './database.config';

describe('database configuration boundary', () => {
    const base: NodeJS.ProcessEnv = {
        POSTGRES_HOST: 'postgres',
        POSTGRES_PORT: '5432',
        POSTGRES_USER: 'username',
        POSTGRES_DB: 'ciri',
        POSTGRES_PASSWORD: 'local-password',
    };

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('preserves local Compose password authentication and the five-connection cap', () => {
        const options = buildDatabaseOptions(base);

        expect(options.password).toBe('local-password');
        expect(options.ssl).toBe(false);
        expect(options.poolSize).toBe(5);
        expect(options.synchronize).toBe(false);
        const extra = options.extra as {
            connectionTimeoutMillis?: unknown;
        };
        expect(extra.connectionTimeoutMillis).toBe(5_000);
    });

    it('uses the local Compose defaults when optional settings are omitted', () => {
        const options = buildDatabaseOptions({});

        expect(options).toEqual(
            expect.objectContaining({
                host: 'postgres',
                port: 5432,
                username: 'username',
                database: 'myciridb',
                password: 'changeme',
                poolSize: 5,
                ssl: false,
                synchronize: false,
            }),
        );
    });

    it.each([
        { POSTGRES_AUTH_MODE: 'unsupported' },
        { POSTGRES_SSL_MODE: 'require' },
        { POSTGRES_POOL_MAX: '6' },
        { POSTGRES_POOL_MAX: '0' },
        {
            POSTGRES_AUTH_MODE: 'entra',
            POSTGRES_SSL_MODE: 'disable',
            AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
            POSTGRES_PASSWORD: '',
        },
        {
            POSTGRES_AUTH_MODE: 'entra',
            POSTGRES_SSL_MODE: 'verify-full',
            AZURE_CLIENT_ID: '',
            POSTGRES_PASSWORD: '',
        },
        {
            POSTGRES_AUTH_MODE: 'entra',
            POSTGRES_SSL_MODE: 'verify-full',
            AZURE_CLIENT_ID: 'not-a-client-id',
            POSTGRES_PASSWORD: '',
        },
        {
            POSTGRES_AUTH_MODE: 'entra',
            POSTGRES_SSL_MODE: 'verify-full',
            AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
            POSTGRES_HOST: '',
            POSTGRES_PASSWORD: '',
        },
    ])('rejects unsafe or incomplete settings: %j', (overrides) => {
        expect(() => buildDatabaseOptions({ ...base, ...overrides })).toThrow();
    });

    it('maps verify-full TLS to CA and hostname verification without disabling certificate checks', () => {
        const options = buildDatabaseOptions({
            ...base,
            POSTGRES_AUTH_MODE: 'password',
            POSTGRES_SSL_MODE: 'verify-full',
            POSTGRES_SSL_CA_FILE: __filename,
        });
        const ssl = options.ssl as {
            rejectUnauthorized?: boolean;
            ca?: string;
            checkServerIdentity?: (
                hostname: string,
                certificate: PeerCertificate,
            ) => Error | undefined;
        };

        expect(ssl.rejectUnauthorized).toBe(true);
        expect(ssl.ca).toContain('database configuration boundary');
        expect(typeof ssl.checkServerIdentity).toBe('function');

        const checkServerIdentity = ssl.checkServerIdentity;
        if (typeof checkServerIdentity !== 'function')
            throw new Error('hostname verification callback is missing');
        const certificate = {
            subject: { CN: 'db.example' },
            subjectaltname: 'DNS:db.example',
        } as PeerCertificate;
        const result = checkServerIdentity('wrong.example', certificate);
        expect(result).toBeDefined();
        expect(result?.message).toMatch(/wrong\.example|db\.example/i);
    });

    it('passes a fresh async Entra password callback through TypeORM to the pg pool adapter', async () => {
        const getToken = jest
            .spyOn(ManagedIdentityCredential.prototype, 'getToken')
            .mockResolvedValue({
                token: 'token-1',
                expiresOnTimestamp: Date.now() + 120_000,
            });
        const options = buildDatabaseOptions({
            ...base,
            POSTGRES_AUTH_MODE: 'entra',
            POSTGRES_SSL_MODE: 'verify-full',
            POSTGRES_PASSWORD: '',
            AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
        });
        const dataSource = new DataSource(options);
        const driver = dataSource.driver as unknown as {
            createPool: (
                options: PostgresConnectionOptions,
                credentials: PostgresConnectionOptions,
            ) => Promise<unknown>;
            postgres: { Pool: unknown };
        };
        const originalPool = driver.postgres.Pool;
        let password: (() => Promise<string>) | undefined;

        driver.postgres.Pool = class {
            constructor(config: {
                password: () => Promise<string>;
                ssl: { rejectUnauthorized: boolean };
            }) {
                password = config.password;
                expect(config.ssl.rejectUnauthorized).toBe(true);
            }

            on(): void {
                // TypeORM registers pool error listeners during construction.
            }

            connect(
                callback: (
                    error: null,
                    connection: { on: () => void },
                    release: () => void,
                ) => void,
            ): void {
                callback(null, { on: () => undefined }, () => undefined);
            }
        };

        try {
            await driver.createPool(options, options);
            expect(password).toBeDefined();
            if (!password)
                throw new Error('pg password callback was not passed');
            expect(await password()).toBe('token-1');

            getToken.mockResolvedValueOnce({
                token: 'token-2',
                expiresOnTimestamp: Date.now() + 120_000,
            });
            expect(await password()).toBe('token-2');
            expect(getToken).toHaveBeenCalledTimes(2);
        } finally {
            driver.postgres.Pool = originalPool;
        }
    });

    it.each([
        { response: null },
        {
            response: {
                token: 'expired',
                expiresOnTimestamp: Date.now() - 1,
            },
        },
    ])('rejects missing or expired Entra tokens: %j', async ({ response }) => {
        // The SDK types token acquisition as non-null, but the runtime guard must reject null too.
        const getToken = jest
            .spyOn(ManagedIdentityCredential.prototype, 'getToken')
            .mockResolvedValue(
                response as unknown as Awaited<
                    ReturnType<ManagedIdentityCredential['getToken']>
                >,
            );
        const options = buildDatabaseOptions({
            ...base,
            POSTGRES_AUTH_MODE: 'entra',
            POSTGRES_SSL_MODE: 'verify-full',
            POSTGRES_PASSWORD: '',
            AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
        });
        const password = options.password as () => Promise<string>;

        try {
            await expect(password()).rejects.toThrow(/token|expired/i);
        } finally {
            getToken.mockRestore();
        }
    });

    it('retries only within the supplied startup budget and returns a successful DataSource', async () => {
        let attempts = 0;
        const source = {
            initialize: jest.fn(() => {
                attempts += 1;
                if (attempts < 3) throw new Error('database offline');
                return Promise.resolve(source as unknown as DataSource);
            }),
        } as unknown as DataSource;

        await expect(initializeDatabase(source, 5_000)).resolves.toBe(source);
        expect(attempts).toBeGreaterThanOrEqual(2);
        expect(attempts).toBeLessThanOrEqual(5);
    });

    it('fails after the retry budget instead of retrying forever', async () => {
        const initialize = jest
            .fn()
            .mockRejectedValue(new Error('database offline'));
        const source = { initialize } as unknown as DataSource;

        await expect(initializeDatabase(source, 1)).rejects.toThrow(
            'database offline',
        );
        expect(initialize).toHaveBeenCalled();
        expect(initialize.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('does not start another HTTP attempt after the startup deadline expires', async () => {
        const initialize = jest
            .fn()
            .mockRejectedValue(new Error('database offline'));
        const source = { initialize } as unknown as DataSource;
        const now = jest
            .spyOn(Date, 'now')
            .mockReturnValueOnce(1_000)
            .mockReturnValue(1_002);

        await expect(initializeDatabase(source, 1)).rejects.toThrow(
            'database offline',
        );
        expect(initialize).toHaveBeenCalledTimes(1);
        now.mockRestore();
    });

    it('retries transient maintenance connections until success within the firewall budget', async () => {
        const initialize = jest.fn();
        const source = sourceForRetry(initialize);
        initialize
            .mockRejectedValueOnce(
                Object.assign(new Error('firewall pending'), {
                    code: 'ECONNREFUSED',
                }),
            )
            .mockResolvedValue(source);
        const nowValues = [0, 0, 1_000];
        const now = jest.fn(() => nowValues.shift() ?? 1_000);
        const wait = jest.fn().mockResolvedValue(undefined);

        await expect(
            initializeMaintenanceDatabase(source, now, wait),
        ).resolves.toBe(source);
        expect(initialize).toHaveBeenCalledTimes(2);
        expect(wait).toHaveBeenCalledWith(1_000);
    });

    it('fails immediately for non-transient maintenance errors', async () => {
        const initialize = jest
            .fn()
            .mockRejectedValue(new Error('password authentication failed'));
        const source = sourceForRetry(initialize);
        const wait = jest.fn().mockResolvedValue(undefined);

        await expect(
            initializeMaintenanceDatabase(source, () => 0, wait),
        ).rejects.toThrow('password authentication failed');
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
    });

    it('stops maintenance retries before the five-minute connection deadline', async () => {
        const initialize = jest.fn().mockRejectedValue(
            Object.assign(new Error('network down'), {
                code: 'ECONNRESET',
            }),
        );
        const source = sourceForRetry(initialize);
        const now = jest.fn().mockReturnValueOnce(0).mockReturnValue(295_000);
        const wait = jest.fn().mockResolvedValue(undefined);

        await expect(
            initializeMaintenanceDatabase(source, now, wait),
        ).rejects.toThrow(/deadline exceeded/i);
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
    });
});

function sourceForRetry(
    initialize: jest.Mock = jest.fn().mockResolvedValue(undefined),
): DataSource {
    return { initialize } as unknown as DataSource;
}

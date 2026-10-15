import { ManagedIdentityCredential } from '@azure/identity';

import { buildDatabaseOptions, POSTGRES_ENTRA_SCOPE } from './database.config';

jest.mock('@azure/identity');

const CredentialMock = ManagedIdentityCredential as jest.MockedClass<
    typeof ManagedIdentityCredential
>;

const CLIENT_ID = '11111111-2222-3333-4444-555555555555';

const entraEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    POSTGRES_AUTH_MODE: 'entra',
    POSTGRES_SSL: 'verify-full',
    POSTGRES_HOST: 'psql-ciri-prod.postgres.database.azure.com',
    POSTGRES_USER: 'id-ciri-api',
    POSTGRES_DB: 'ciri',
    AZURE_CLIENT_ID: CLIENT_ID,
    ...overrides,
});

const passwordOf = (env: NodeJS.ProcessEnv): (() => Promise<string>) =>
    buildDatabaseOptions(env).password as () => Promise<string>;

describe('buildDatabaseOptions', () => {
    beforeEach(() => {
        CredentialMock.mockClear();
    });

    describe('password mode', () => {
        it('keeps the local Compose defaults when nothing is set', () => {
            const options = buildDatabaseOptions({});

            expect(options).toMatchObject({
                type: 'postgres',
                host: 'postgres',
                port: 5432,
                username: 'username',
                password: 'changeme',
                database: 'myciridb',
                ssl: false,
                poolSize: 5,
                synchronize: false,
                migrationsRun: true,
            });
            expect(CredentialMock).not.toHaveBeenCalled();
        });

        it('reads connection values from the environment', () => {
            const options = buildDatabaseOptions({
                POSTGRES_HOST: 'db.internal',
                POSTGRES_PORT: '6543',
                POSTGRES_USER: 'ciri',
                POSTGRES_PASSWORD: 's3cret',
                POSTGRES_DB: 'test_db',
            });

            expect(options).toMatchObject({
                host: 'db.internal',
                port: 6543,
                username: 'ciri',
                password: 's3cret',
                database: 'test_db',
            });
        });

        it('enables verified TLS with verify-full', () => {
            const options = buildDatabaseOptions({
                POSTGRES_SSL: 'verify-full',
            });

            expect(options.ssl).toEqual({ rejectUnauthorized: true });
        });
    });

    describe('validation', () => {
        it.each([
            [{ POSTGRES_AUTH_MODE: 'token' }, /POSTGRES_AUTH_MODE/],
            [{ POSTGRES_SSL: 'require' }, /POSTGRES_SSL/],
            [{ POSTGRES_PORT: 'abc' }, /POSTGRES_PORT/],
            [{ POSTGRES_PORT: '70000' }, /POSTGRES_PORT/],
        ])('rejects %j', (env, message) => {
            expect(() => buildDatabaseOptions(env)).toThrow(message);
        });

        it('requires verify-full TLS in Entra mode', () => {
            expect(() =>
                buildDatabaseOptions(entraEnv({ POSTGRES_SSL: 'disable' })),
            ).toThrow(/verify-full/);
        });

        it.each([
            'POSTGRES_HOST',
            'POSTGRES_USER',
            'POSTGRES_DB',
            'AZURE_CLIENT_ID',
        ])('requires %s in Entra mode', (name) => {
            expect(() =>
                buildDatabaseOptions(entraEnv({ [name]: undefined })),
            ).toThrow(new RegExp(name));
        });

        it('rejects an AZURE_CLIENT_ID that is not a GUID', () => {
            expect(() =>
                buildDatabaseOptions(
                    entraEnv({ AZURE_CLIENT_ID: 'id-ciri-api' }),
                ),
            ).toThrow(/AZURE_CLIENT_ID/);
        });
    });

    describe('Entra mode', () => {
        it('requests a fresh token per connection from the managed identity', async () => {
            const options = buildDatabaseOptions(entraEnv());
            const getToken = jest
                .fn()
                .mockResolvedValueOnce({
                    token: 'token-1',
                    expiresOnTimestamp: 1,
                })
                .mockResolvedValueOnce({
                    token: 'token-2',
                    expiresOnTimestamp: 2,
                });
            CredentialMock.mock.instances[0].getToken = getToken;
            const password = options.password as () => Promise<string>;

            await expect(password()).resolves.toBe('token-1');
            await expect(password()).resolves.toBe('token-2');

            expect(CredentialMock).toHaveBeenCalledTimes(1);
            expect(CredentialMock).toHaveBeenCalledWith({
                clientId: CLIENT_ID,
            });
            expect(getToken).toHaveBeenCalledTimes(2);
            expect(getToken).toHaveBeenCalledWith(POSTGRES_ENTRA_SCOPE);
            expect(POSTGRES_ENTRA_SCOPE).toBe(
                'https://ossrdbms-aad.database.windows.net/.default',
            );
        });

        it('rejects when the managed identity returns no token', async () => {
            const password = passwordOf(entraEnv());
            CredentialMock.mock.instances[0].getToken = jest
                .fn()
                .mockResolvedValue(null);

            await expect(password()).rejects.toThrow(/token/);
        });

        it('uses the Entra role name as the username over verified TLS', () => {
            const options = buildDatabaseOptions(entraEnv());

            expect(options).toMatchObject({
                host: 'psql-ciri-prod.postgres.database.azure.com',
                username: 'id-ciri-api',
                database: 'ciri',
                ssl: { rejectUnauthorized: true },
                poolSize: 5,
            });
        });
    });
});

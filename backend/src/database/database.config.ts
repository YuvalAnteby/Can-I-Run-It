import { ManagedIdentityCredential } from '@azure/identity';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import { Baseline1792022400000 } from './migrations/1792022400000-baseline';

export const POSTGRES_ENTRA_SCOPE =
    'https://ossrdbms-aad.database.windows.net/.default';

const AUTH_MODES = ['password', 'entra'] as const;
const SSL_MODES = ['disable', 'verify-full'] as const;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function oneOf<T extends string>(
    name: string,
    value: string | undefined,
    allowed: readonly T[],
): T {
    const normalized = value?.trim() || allowed[0];
    if (!allowed.includes(normalized as T)) {
        throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
    }
    return normalized as T;
}

function required(name: string, value: string | undefined): string {
    const normalized = value?.trim();
    if (!normalized) {
        throw new Error(`${name} is required when POSTGRES_AUTH_MODE=entra`);
    }
    return normalized;
}

function parsePort(value: string | undefined): number {
    const port = Number(value?.trim() || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('POSTGRES_PORT must be an integer between 1 and 65535');
    }
    return port;
}

/**
 * Builds the TypeORM connection options from the environment and fails fast on
 * invalid values. `password` mode keeps the local Compose defaults; `entra` mode
 * authenticates as the API's managed identity with a token per connection.
 */
export function buildDatabaseOptions(
    env: NodeJS.ProcessEnv = process.env,
): PostgresConnectionOptions {
    const authMode = oneOf(
        'POSTGRES_AUTH_MODE',
        env.POSTGRES_AUTH_MODE,
        AUTH_MODES,
    );
    const sslMode = oneOf('POSTGRES_SSL', env.POSTGRES_SSL, SSL_MODES);
    const port = parsePort(env.POSTGRES_PORT);

    const common = {
        type: 'postgres',
        port,
        ssl: sslMode === 'verify-full' ? { rejectUnauthorized: true } : false,
        poolSize: 5,
        entities: [__dirname + '/../**/*.entity.{js,ts}'],
        synchronize: false,
        migrations: [Baseline1792022400000],
        migrationsRun: true,
    } satisfies Partial<PostgresConnectionOptions>;

    if (authMode === 'password') {
        return {
            ...common,
            host: env.POSTGRES_HOST || 'postgres',
            username: env.POSTGRES_USER || 'username',
            password: env.POSTGRES_PASSWORD || 'changeme',
            database: env.POSTGRES_DB || 'myciridb',
        };
    }

    if (sslMode !== 'verify-full') {
        throw new Error(
            'POSTGRES_AUTH_MODE=entra requires POSTGRES_SSL=verify-full',
        );
    }
    const host = required('POSTGRES_HOST', env.POSTGRES_HOST);
    const username = required('POSTGRES_USER', env.POSTGRES_USER);
    const database = required('POSTGRES_DB', env.POSTGRES_DB);
    const clientId = required('AZURE_CLIENT_ID', env.AZURE_CLIENT_ID);
    if (!GUID.test(clientId)) {
        throw new Error(
            'AZURE_CLIENT_ID must be the managed identity client ID (a GUID)',
        );
    }

    // The credential caches tokens; pg calls this once per physical connection.
    const credential = new ManagedIdentityCredential({ clientId });
    return {
        ...common,
        host,
        username,
        database,
        password: async (): Promise<string> => {
            const accessToken = await credential.getToken(POSTGRES_ENTRA_SCOPE);
            if (!accessToken?.token) {
                throw new Error(
                    'Managed identity returned no PostgreSQL access token',
                );
            }
            return accessToken.token;
        },
    };
}

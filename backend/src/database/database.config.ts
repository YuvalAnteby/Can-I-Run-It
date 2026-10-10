import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { checkServerIdentity, type ConnectionOptions } from 'node:tls';

import { ManagedIdentityCredential } from '@azure/identity';
import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export const POSTGRES_ENTRA_SCOPE =
    'https://ossrdbms-aad.database.windows.net/.default';
export const MAINTENANCE_CONNECTION_BUDGET_MS = 300_000;
export const MAINTENANCE_COMMAND_BUDGET_MS = 600_000;

const CLIENT_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asError = (error: unknown, message: string): Error =>
    error instanceof Error ? error : new Error(message, { cause: error });

const parseInteger = (
    name: string,
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
): number => {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
};

const requiredEntraValue = (
    name: string,
    value: string | undefined,
): string => {
    const normalized = value?.trim();
    if (!normalized) throw new Error(`${name} is required in Entra mode`);
    return normalized;
};

const sslOptions = (
    env: NodeJS.ProcessEnv,
    mode: 'disable' | 'verify-full',
    host: string,
):
    | false
    | Pick<
          ConnectionOptions,
          'ca' | 'checkServerIdentity' | 'rejectUnauthorized'
      > => {
    if (mode === 'disable') {
        if (env.POSTGRES_SSL_CA_FILE) {
            throw new Error('POSTGRES_SSL_CA_FILE requires verify-full TLS');
        }
        return false;
    }

    return {
        rejectUnauthorized: true,
        checkServerIdentity: (_hostname, certificate) =>
            checkServerIdentity(host, certificate),
        ...(env.POSTGRES_SSL_CA_FILE
            ? { ca: readFileSync(env.POSTGRES_SSL_CA_FILE, 'utf8') }
            : {}),
    };
};

export function buildDatabaseOptions(
    env: NodeJS.ProcessEnv = process.env,
): PostgresConnectionOptions {
    const authMode = env.POSTGRES_AUTH_MODE ?? 'password';
    const sslMode = env.POSTGRES_SSL_MODE ?? 'disable';
    if (authMode !== 'password' && authMode !== 'entra') {
        throw new Error('POSTGRES_AUTH_MODE must be password or entra');
    }
    if (sslMode !== 'disable' && sslMode !== 'verify-full') {
        throw new Error('POSTGRES_SSL_MODE must be disable or verify-full');
    }

    const host =
        authMode === 'entra'
            ? requiredEntraValue('POSTGRES_HOST', env.POSTGRES_HOST)
            : env.POSTGRES_HOST?.trim() || 'postgres';
    const username =
        authMode === 'entra'
            ? requiredEntraValue('POSTGRES_USER', env.POSTGRES_USER)
            : env.POSTGRES_USER?.trim() || 'username';
    const database =
        authMode === 'entra'
            ? requiredEntraValue('POSTGRES_DB', env.POSTGRES_DB)
            : env.POSTGRES_DB?.trim() || 'myciridb';
    const port = parseInteger(
        'POSTGRES_PORT',
        env.POSTGRES_PORT,
        5432,
        1,
        65535,
    );
    const poolMax = parseInteger(
        'POSTGRES_POOL_MAX',
        env.POSTGRES_POOL_MAX,
        5,
        1,
        5,
    );

    const options: PostgresConnectionOptions = {
        type: 'postgres',
        host,
        port,
        username,
        database,
        ssl: sslOptions(env, sslMode, host),
        poolSize: poolMax,
        connectTimeoutMS: 5_000,
        extra: {
            connectionTimeoutMillis: 5_000,
            idleTimeoutMillis: 30_000,
            statement_timeout: 30_000,
            query_timeout: 30_000,
        },
        entities: [__dirname + '/../**/*.entity.{js,ts}'],
        synchronize: false,
        migrationsTableName: 'migrations',
    };

    if (authMode === 'password') {
        Object.assign(options, {
            password: env.POSTGRES_PASSWORD || 'changeme',
        });
        return options;
    }

    if (sslMode !== 'verify-full') {
        throw new Error('Entra mode requires verify-full TLS');
    }
    if (env.POSTGRES_PASSWORD?.trim()) {
        throw new Error('POSTGRES_PASSWORD must be omitted in Entra mode');
    }
    const clientId = requiredEntraValue('AZURE_CLIENT_ID', env.AZURE_CLIENT_ID);
    if (!CLIENT_ID_PATTERN.test(clientId)) {
        throw new Error('AZURE_CLIENT_ID must be a managed identity client ID');
    }

    const credential = new ManagedIdentityCredential({ clientId });
    Object.assign(options, {
        password: async (): Promise<string> => {
            const token = await credential.getToken(POSTGRES_ENTRA_SCOPE, {
                abortSignal: AbortSignal.timeout(5_000),
            });
            if (
                !token?.token ||
                !Number.isFinite(token.expiresOnTimestamp) ||
                token.expiresOnTimestamp <= Date.now() + 30_000
            ) {
                throw new Error('PostgreSQL Entra token missing or expired');
            }
            return token.token;
        },
    });
    return options;
}

export function startupRetryBudgetMs(
    env: NodeJS.ProcessEnv = process.env,
): number {
    return parseInteger(
        'POSTGRES_STARTUP_RETRY_BUDGET_MS',
        env.POSTGRES_STARTUP_RETRY_BUDGET_MS,
        30_000,
        1,
        300_000,
    );
}

export async function initializeDatabase(
    source: DataSource,
    budgetMs: number,
): Promise<DataSource> {
    if (!Number.isSafeInteger(budgetMs) || budgetMs < 1) {
        throw new Error('Database startup retry budget must be positive');
    }

    const startedAt = Date.now();
    let attempt = 0;
    let backoffMs = 25;
    let lastError: unknown;
    const logger = new Logger('Database');
    for (;;) {
        if (attempt > 0 && Date.now() - startedAt >= budgetMs) {
            throw asError(lastError, 'Database startup retry budget exceeded');
        }
        attempt += 1;
        try {
            return await source.initialize();
        } catch (error) {
            lastError = error;
            const remainingMs = budgetMs - (Date.now() - startedAt);
            if (remainingMs <= 0) throw error;
            logger.warn(
                `Initial database connection failed; retry ${attempt + 1}`,
            );
            await delay(Math.min(backoffMs, remainingMs));
            backoffMs = Math.min(backoffMs * 2, 1_000);
        }
    }
}

function transientConnectionError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const code = (error as { code?: unknown }).code;
    const message = error instanceof Error ? error.message : '';
    if (
        typeof code === 'string' &&
        [
            'ECONNREFUSED',
            'ECONNRESET',
            'ETIMEDOUT',
            'EHOSTUNREACH',
            'ENETUNREACH',
            'EAI_AGAIN',
            'ENOTFOUND',
        ].includes(code)
    )
        return true;
    if (
        code === undefined &&
        [
            'Connection terminated due to connection timeout',
            'timeout expired',
        ].includes(message)
    )
        return true;
    return (
        code === '28000' &&
        /(?:no pg_hba\.conf entry|pg_hba\.conf rejects connection) for host/i.test(
            message,
        ) &&
        !/no encryption|SSL off|SSL disabled/i.test(message)
    );
}

export async function initializeMaintenanceDatabase(
    source: DataSource,
    now: () => number = () => Date.now(),
    wait: (milliseconds: number) => Promise<unknown> = delay,
): Promise<DataSource> {
    const deadline = now() + MAINTENANCE_CONNECTION_BUDGET_MS;
    let backoff = 1_000;
    let lastError: unknown;
    for (;;) {
        if (lastError !== undefined && deadline - now() <= 5_000) {
            throw new Error('Maintenance connection deadline exceeded', {
                cause: lastError,
            });
        }
        try {
            return await source.initialize();
        } catch (error) {
            lastError = error;
            if (!transientConnectionError(error)) throw error;
            const remaining = deadline - now();
            if (remaining <= 5_000) {
                throw new Error('Maintenance connection deadline exceeded', {
                    cause: error,
                });
            }
            new Logger('DatabaseMaintenance').warn(
                'Database network access unavailable; retrying within firewall propagation budget',
            );
            await wait(Math.min(backoff, remaining - 5_000));
            backoff = Math.min(backoff * 2, 5_000);
        }
    }
}

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { checkServerIdentity, ConnectionOptions } from 'node:tls';

import { ManagedIdentityCredential } from '@azure/identity';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

type Credential = Pick<ManagedIdentityCredential, 'getToken'>;
type ConnectCallback =
    | ((error: Error) => void)
    | ((error: null, client: Client) => void);

// pg removes failed connecting clients from its pool without closing a socket
// when an async password rejects. Close that socket so finite Jobs can exit.
class ClosingPostgresClient extends Client {
    connect(): Promise<Client>;
    connect(callback: ConnectCallback): void;
    connect(callback?: ConnectCallback): Promise<Client> | void {
        if (callback) {
            super.connect((error: Error | null) => {
                if (error) void this.end().catch(() => undefined);
                if (error) (callback as (error: Error) => void)(error);
                else
                    (callback as (error: null, client: Client) => void)(
                        null,
                        this,
                    );
            });
            return;
        }
        return super.connect().catch((error: unknown) => {
            void this.end().catch(() => undefined);
            throw error;
        });
    }
}

function integer(
    value: string | undefined,
    fallback: number,
    max: number,
): number {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
        throw new Error('Invalid PostgreSQL numeric connection setting');
    }
    return parsed;
}

export function databaseOptions(
    env: NodeJS.ProcessEnv = process.env,
    credential?: Credential,
): PostgresConnectionOptions {
    const auth = env.POSTGRES_AUTH_MODE ?? 'password';
    const tls = env.POSTGRES_SSL_MODE ?? 'disable';
    if (
        !['password', 'entra'].includes(auth) ||
        !['disable', 'verify-full'].includes(tls)
    ) {
        throw new Error('Invalid PostgreSQL authentication or TLS mode');
    }
    if (env.POSTGRES_SSL_CA_FILE && tls !== 'verify-full')
        throw new Error('CA file requires verify-full');
    let password: string | (() => Promise<string>) =
        env.POSTGRES_PASSWORD || 'changeme';
    if (auth === 'entra') {
        if (
            tls !== 'verify-full' ||
            !env.POSTGRES_HOST ||
            !env.POSTGRES_USER ||
            !env.POSTGRES_DB ||
            env.POSTGRES_PASSWORD ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                env.AZURE_CLIENT_ID ?? '',
            )
        ) {
            throw new Error(
                'Entra requires explicit host/user/database/UAMI, verify-full TLS and no password',
            );
        }
        const identity =
            credential ??
            new ManagedIdentityCredential({ clientId: env.AZURE_CLIENT_ID });
        password = async () => {
            const token = await identity.getToken(
                'https://ossrdbms-aad.database.windows.net/.default',
                { abortSignal: AbortSignal.timeout(5000) },
            );
            if (
                !token?.token ||
                !Number.isFinite(token.expiresOnTimestamp) ||
                token.expiresOnTimestamp <= Date.now() + 30000
            ) {
                throw new Error('PostgreSQL Entra token missing or expired');
            }
            return token.token;
        };
    }
    const ssl:
        | Pick<
              ConnectionOptions,
              'rejectUnauthorized' | 'checkServerIdentity' | 'ca'
          >
        | false =
        tls === 'verify-full'
            ? {
                  rejectUnauthorized: true,
                  // pg omits SNI for IP hosts. Verify the configured host explicitly.
                  checkServerIdentity: (_hostname, certificate) =>
                      checkServerIdentity(
                          env.POSTGRES_HOST || 'postgres',
                          certificate,
                      ),
                  ...(env.POSTGRES_SSL_CA_FILE
                      ? { ca: readFileSync(env.POSTGRES_SSL_CA_FILE, 'utf8') }
                      : {}),
              }
            : false;
    return {
        type: 'postgres',
        host: env.POSTGRES_HOST || 'postgres',
        port: integer(env.POSTGRES_PORT, 5432, 65535),
        username: env.POSTGRES_USER || 'username',
        database: env.POSTGRES_DB || 'myciridb',
        ...(typeof password === 'string' ? { password } : {}),
        ssl,
        poolSize: integer(env.POSTGRES_POOL_MAX, 5, 5),
        connectTimeoutMS: 5000,
        extra: {
            Client: ClosingPostgresClient,
            password,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            statement_timeout: 30000,
            query_timeout: 30000,
        },
        entities: [__dirname + '/../**/*.entity.{js,ts}'],
        synchronize: false,
        migrationsTableName: 'migrations',
    };
}

export async function initializeDatabase(
    source: DataSource,
    attempts = 5,
    delayMs = 1000,
): Promise<DataSource> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await source.initialize();
        } catch (error) {
            if (attempt === attempts) throw error;
            new Logger('Database').warn(
                `Initial database connection failed; retry ${attempt + 1}/${attempts}`,
            );
            await delay(delayMs);
        }
    }
    throw new Error('Database startup attempt budget exhausted');
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
    now: () => number = () => performance.now(),
    wait: (ms: number) => Promise<unknown> = delay,
): Promise<DataSource> {
    const deadline = now() + 300000;
    let backoff = 1000;
    for (;;) {
        try {
            return await source.initialize();
        } catch (error) {
            if (!transientConnectionError(error)) throw error;
            const remaining = deadline - now();
            // Reserve the driver's five-second connection timeout; never begin
            // a network attempt that could run past the propagation budget.
            if (remaining <= 5000)
                throw new Error('Maintenance connection deadline exceeded', {
                    cause: error,
                });
            new Logger('DatabaseMaintenance').warn(
                'Database network access unavailable; retrying within firewall propagation budget',
            );
            await wait(Math.min(backoff, remaining - 5000));
            backoff = Math.min(backoff * 2, 5000);
            if (now() + 5000 > deadline)
                throw new Error('Maintenance connection deadline exceeded', {
                    cause: error,
                });
        }
    }
}

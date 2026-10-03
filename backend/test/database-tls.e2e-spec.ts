import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { DataSource } from 'typeorm';

import { databaseOptions } from '../src/database/connection-options';

// The optional CA is a generated local test certificate for localhost. No Azure
// token or identity is simulated here: the seam returns the local test password.
const suite = process.env.AZURE_DB_TEST_CA ? describe : describe.skip;
suite('real TypeORM/pg TLS and connection password callback', () => {
    const env = {
        POSTGRES_HOST: 'localhost',
        POSTGRES_PORT: process.env.AZURE_DB_TEST_PORT ?? '55436',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'ciri-test',
        POSTGRES_DB: 'postgres',
        POSTGRES_SSL_MODE: 'verify-full',
        POSTGRES_SSL_CA_FILE: process.env.AZURE_DB_TEST_CA,
    };
    it('rejects an untrusted CA', async () => {
        const source = new DataSource(
            databaseOptions({ ...env, POSTGRES_SSL_CA_FILE: '' }),
        );
        await expect(source.initialize()).rejects.toThrow(
            /self-signed|certificate/i,
        );
    });
    it('terminates failed authentication without retaining a connecting socket', () => {
        const script = `const {databaseOptions}=require('./dist/database/connection-options'); const {DataSource}=require('typeorm'); const o=databaseOptions({POSTGRES_HOST:'127.0.0.1',POSTGRES_PORT:'${env.POSTGRES_PORT}',POSTGRES_USER:'postgres',POSTGRES_DB:'postgres',POSTGRES_PASSWORD:'ciri-test'}); o.extra.password=()=>Promise.reject(new Error('expired')); new DataSource(o).initialize().catch(()=>{process.exitCode=1});`;
        const child = spawnSync(process.execPath, ['-e', script], {
            cwd: resolve(__dirname, '..'),
            timeout: 5000,
            encoding: 'utf8',
        });
        expect(child.status).toBe(1);
    });
    it('exits the compiled CLI promptly on a wrong password rather than retrying for five minutes', () => {
        const child = spawnSync(
            process.execPath,
            ['dist/database/maintenance.js', 'show'],
            {
                cwd: resolve(__dirname, '..'),
                timeout: 5000,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    ...env,
                    POSTGRES_AUTH_MODE: 'password',
                    POSTGRES_PASSWORD: 'wrong-password',
                },
            },
        );
        expect(child.status).toBe(1);
    });
    it('rejects a certificate for the wrong hostname', async () => {
        const source = new DataSource(
            databaseOptions({ ...env, POSTGRES_HOST: '127.0.0.1' }),
        );
        try {
            await expect(source.initialize()).rejects.toThrow(
                /hostname|IP|altnames/i,
            );
        } finally {
            if (source.isInitialized) await source.destroy();
        }
    });
    it('gets a fresh password on actual pool reconnects and rejects expired credentials', async () => {
        let calls = 0;
        let expired = false;
        const credential = {
            getToken: () => {
                calls++;
                return Promise.resolve({
                    token: 'ciri-test',
                    expiresOnTimestamp: expired
                        ? Date.now() - 1
                        : Date.now() + 120000,
                });
            },
        };
        const options = databaseOptions(
            {
                ...env,
                POSTGRES_PASSWORD: '',
                POSTGRES_AUTH_MODE: 'entra',
                AZURE_CLIENT_ID: '11111111-1111-1111-1111-111111111111',
            },
            credential,
        );
        const source = new DataSource({
            ...options,
            extra: {
                ...(options.extra as Record<string, unknown>),
                maxLifetimeSeconds: 1,
            },
        });
        await source.initialize();
        try {
            const first = calls;
            await delay(1100);
            await source.query('SELECT 1');
            expect(calls).toBeGreaterThan(first);
            expired = true;
            await delay(1100);
            await expect(source.query('SELECT 1')).rejects.toThrow('expired');
        } finally {
            await source.destroy();
        }
    });
});

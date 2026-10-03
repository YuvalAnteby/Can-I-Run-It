import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { initializeMaintenanceDatabase } from './connection-options';

describe('maintenance firewall propagation connection budget', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    it('keeps retrying transient connections beyond the API startup budget', async () => {
        let elapsed = 0;
        let attempts = 0;
        const source = {
            initialize: () => {
                elapsed += 5000;
                attempts++;
                return elapsed < 180000
                    ? Promise.reject(
                          Object.assign(new Error('connect timeout'), {
                              code: 'ETIMEDOUT',
                          }),
                      )
                    : Promise.resolve(source);
            },
        } as unknown as DataSource;
        const result = await initializeMaintenanceDatabase(
            source,
            () => elapsed,
            (ms) => {
                elapsed += ms;
                return Promise.resolve();
            },
        );
        expect(result).toBe(source);
        expect(attempts).toBeGreaterThan(5);
        expect(elapsed).toBeGreaterThanOrEqual(180000);
        expect(elapsed).toBeLessThanOrEqual(300000);
    });
    it('stops within five minutes even when each network attempt consumes its timeout', async () => {
        let elapsed = 0;
        const starts: number[] = [];
        const source = {
            initialize: () => {
                starts.push(elapsed);
                elapsed += 5000;
                return Promise.reject(
                    Object.assign(new Error('offline'), {
                        code: 'ECONNREFUSED',
                    }),
                );
            },
        } as unknown as DataSource;
        await expect(
            initializeMaintenanceDatabase(
                source,
                () => elapsed,
                (ms) => {
                    elapsed += ms;
                    return Promise.resolve();
                },
            ),
        ).rejects.toThrow('deadline');
        expect(starts.length).toBeGreaterThan(5);
        expect(elapsed).toBeGreaterThanOrEqual(295000);
        expect(elapsed).toBeLessThanOrEqual(300000);
        expect(starts.every((start) => start <= 295000)).toBe(true);
    });
    it.each([
        { code: '28P01', message: 'password authentication failed' },
        { code: '28000', message: 'role has no Entra mapping' },
        {
            code: 'ERR_TLS_CERT_ALTNAME_INVALID',
            message: 'Hostname does not match',
        },
        {
            code: '28000',
            message: 'no pg_hba.conf entry for host, no encryption',
        },
        {
            code: undefined,
            message: 'PostgreSQL Entra token missing or expired',
        },
    ])(
        'fails immediately for credentials/TLS/configuration: %j',
        async ({ code, message }) => {
            let attempts = 0;
            let waits = 0;
            const error = Object.assign(new Error(message), { code });
            const source = {
                initialize: () => {
                    attempts++;
                    return Promise.reject(error);
                },
            } as unknown as DataSource;
            await expect(
                initializeMaintenanceDatabase(
                    source,
                    () => 0,
                    () => {
                        waits++;
                        return Promise.resolve();
                    },
                ),
            ).rejects.toBe(error);
            expect(attempts).toBe(1);
            expect(waits).toBe(0);
        },
    );
    it.each([
        {
            code: '28000',
            message: 'no pg_hba.conf entry for host, SSL encryption',
        },
        {
            code: '28000',
            message: 'pg_hba.conf rejects connection for host, SSL encryption',
        },
        {
            code: undefined,
            message: 'Connection terminated due to connection timeout',
        },
        { code: undefined, message: 'timeout expired' },
    ])(
        'retries firewall/network propagation denial: %j',
        async ({ code, message }) => {
            let attempts = 0;
            let elapsed = 0;
            const source = {
                initialize: () =>
                    ++attempts === 1
                        ? Promise.reject(
                              Object.assign(new Error(message), { code }),
                          )
                        : Promise.resolve(source),
            } as unknown as DataSource;
            expect(
                await initializeMaintenanceDatabase(
                    source,
                    () => elapsed,
                    (ms) => {
                        elapsed += ms;
                        return Promise.resolve();
                    },
                ),
            ).toBe(source);
            expect(attempts).toBe(2);
            expect(elapsed).toBe(1000);
        },
    );
});

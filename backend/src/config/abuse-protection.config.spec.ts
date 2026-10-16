import { validateAbuseProtectionConfig } from './abuse-protection.config';

describe('validateAbuseProtectionConfig', () => {
    it('defaults_and_valid_overrides', () => {
        expect(
            validateAbuseProtectionConfig({ GEMINI_API_KEY: 'secret' }),
        ).toMatchObject({
            GEMINI_API_KEY: 'secret',
            EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: 10,
            EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 100,
            GEMINI_REQUESTS_PER_MINUTE: 30,
            RAWG_REQUESTS_PER_MINUTE: 60,
            GEMINI_MAX_CONCURRENT: 2,
            RAWG_MAX_CONCURRENT: 4,
            GEMINI_TIMEOUT_MS: 8000,
            RAWG_TIMEOUT_MS: 3000,
            TRUST_PROXY: '0',
        });

        expect(
            validateAbuseProtectionConfig({
                EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: '11',
                EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 101,
                GEMINI_REQUESTS_PER_MINUTE: '31',
                RAWG_REQUESTS_PER_MINUTE: 61,
                GEMINI_MAX_CONCURRENT: '3',
                RAWG_MAX_CONCURRENT: 5,
                GEMINI_TIMEOUT_MS: '8010',
                RAWG_TIMEOUT_MS: 3010,
                TRUST_PROXY: '1',
                APP_SECRET: 'must survive validation',
            }),
        ).toMatchObject({
            EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: 11,
            EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 101,
            GEMINI_REQUESTS_PER_MINUTE: 31,
            RAWG_REQUESTS_PER_MINUTE: 61,
            GEMINI_MAX_CONCURRENT: 3,
            RAWG_MAX_CONCURRENT: 5,
            GEMINI_TIMEOUT_MS: 8010,
            RAWG_TIMEOUT_MS: 3010,
            TRUST_PROXY: '1',
            APP_SECRET: 'must survive validation',
        });

        expect(
            validateAbuseProtectionConfig({
                EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: 1,
                EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 10_000,
                GEMINI_REQUESTS_PER_MINUTE: 1_000,
                RAWG_REQUESTS_PER_MINUTE: 1_000,
                GEMINI_MAX_CONCURRENT: 16,
                RAWG_MAX_CONCURRENT: 16,
                GEMINI_TIMEOUT_MS: 100,
                RAWG_TIMEOUT_MS: 60_000,
                TRUST_PROXY: '0',
            }),
        ).toMatchObject({
            EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: 1,
            EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 10_000,
            GEMINI_REQUESTS_PER_MINUTE: 1_000,
            RAWG_REQUESTS_PER_MINUTE: 1_000,
            GEMINI_MAX_CONCURRENT: 16,
            RAWG_MAX_CONCURRENT: 16,
            GEMINI_TIMEOUT_MS: 100,
            RAWG_TIMEOUT_MS: 60_000,
            TRUST_PROXY: '0',
        });
    });

    it('rejects_invalid_explicit_limits_before_startup', () => {
        const invalidValues: Array<readonly [string, unknown]> = [
            ['blank', ''],
            ['whitespace', '   '],
            ['fractional string', '1.5'],
            ['fractional number', 1.5],
            ['negative string', '-1'],
            ['negative number', -1],
            ['zero string', '0'],
            ['zero number', 0],
            ['NaN', Number.NaN],
            ['Infinity', Number.POSITIVE_INFINITY],
            ['scientific notation', '1e2'],
            ['trailing garbage', '10requests'],
            ['boolean', true],
        ];
        const boundedKeys = [
            ['EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE', '1001'],
            ['EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE', '10001'],
            ['GEMINI_REQUESTS_PER_MINUTE', '1001'],
            ['RAWG_REQUESTS_PER_MINUTE', '1001'],
            ['GEMINI_MAX_CONCURRENT', '17'],
            ['RAWG_MAX_CONCURRENT', '17'],
            ['GEMINI_TIMEOUT_MS', '99'],
            ['RAWG_TIMEOUT_MS', '60001'],
        ] as const;

        for (const [key, value] of boundedKeys) {
            expect(() =>
                validateAbuseProtectionConfig({
                    [key]: value,
                    GEMINI_API_KEY: 'do-not-leak-this-secret',
                }),
            ).toThrow(new RegExp(key));
        }

        for (const [label, value] of invalidValues) {
            const key =
                label === 'boolean'
                    ? 'TRUST_PROXY'
                    : 'GEMINI_REQUESTS_PER_MINUTE';
            expect(() =>
                validateAbuseProtectionConfig({
                    [key]: value,
                    GEMINI_API_KEY: 'do-not-leak-this-secret',
                }),
            ).toThrow(new RegExp(key));
        }

        expect(() =>
            validateAbuseProtectionConfig({
                TRUST_PROXY: '2',
            }),
        ).toThrow(/TRUST_PROXY/);
        expect(() =>
            validateAbuseProtectionConfig({
                TRUST_PROXY: '',
            }),
        ).toThrow(/TRUST_PROXY/);
        expect(() =>
            validateAbuseProtectionConfig({
                EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: 100,
                EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: 99,
            }),
        ).toThrow(/EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE/);

        let message = '';
        try {
            validateAbuseProtectionConfig({
                GEMINI_REQUESTS_PER_MINUTE: 'not-a-number',
                GEMINI_API_KEY: 'do-not-leak-this-secret',
            });
        } catch (error) {
            message = String(error);
        }
        expect(message).toContain('GEMINI_REQUESTS_PER_MINUTE');
        expect(message).not.toContain('do-not-leak-this-secret');
    });
});

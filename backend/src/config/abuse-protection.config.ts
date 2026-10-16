const LIMITS = {
    EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE: {
        defaultValue: 10,
        min: 1,
        max: 1_000,
    },
    EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE: {
        defaultValue: 100,
        min: 1,
        max: 10_000,
    },
    GEMINI_REQUESTS_PER_MINUTE: {
        defaultValue: 30,
        min: 1,
        max: 1_000,
    },
    RAWG_REQUESTS_PER_MINUTE: {
        defaultValue: 60,
        min: 1,
        max: 1_000,
    },
    GEMINI_MAX_CONCURRENT: {
        defaultValue: 2,
        min: 1,
        max: 16,
    },
    RAWG_MAX_CONCURRENT: {
        defaultValue: 4,
        min: 1,
        max: 16,
    },
    GEMINI_TIMEOUT_MS: {
        defaultValue: 8_000,
        min: 100,
        max: 60_000,
    },
    RAWG_TIMEOUT_MS: {
        defaultValue: 3_000,
        min: 100,
        max: 60_000,
    },
} as const;

const parseInteger = (
    key: string,
    value: unknown,
    min: number,
    max: number,
): number => {
    const valid =
        (typeof value === 'number' && Number.isInteger(value)) ||
        (typeof value === 'string' && /^\d+$/.test(value));
    if (!valid) throw new Error(`${key} must be an integer`);

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${key} must be between ${min} and ${max}`);
    }
    return parsed;
};

export function validateAbuseProtectionConfig(
    env: Record<string, unknown>,
): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...env };
    for (const [key, rule] of Object.entries(LIMITS)) {
        normalized[key] = parseInteger(
            key,
            env[key] === undefined ? rule.defaultValue : env[key],
            rule.min,
            rule.max,
        );
    }

    const trustProxy = env.TRUST_PROXY === undefined ? '0' : env.TRUST_PROXY;
    if (trustProxy !== '0' && trustProxy !== '1') {
        throw new Error('TRUST_PROXY must be "0" or "1"');
    }
    normalized.TRUST_PROXY = trustProxy;

    if (
        (normalized.EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE as number) <
        (normalized.EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE as number)
    ) {
        throw new Error(
            'EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE must be at least EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE',
        );
    }
    for (const [budgetKey, concurrencyKey] of [
        ['GEMINI_REQUESTS_PER_MINUTE', 'GEMINI_MAX_CONCURRENT'],
        ['RAWG_REQUESTS_PER_MINUTE', 'RAWG_MAX_CONCURRENT'],
    ] as const) {
        if (
            (normalized[concurrencyKey] as number) >
            (normalized[budgetKey] as number)
        ) {
            throw new Error(`${concurrencyKey} cannot exceed ${budgetKey}`);
        }
    }

    return normalized;
}

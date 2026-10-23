// No imports: telemetry-bootstrap loads this before instrumentation starts.
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
export const ROUTE_PATTERN = /^\/[A-Za-z0-9_./:-]{0,159}$/;
export const PROBE_PATHS = new Set([
    '/api/health/live',
    '/api/health/ready',
    '/api/health/postgres',
]);

const containsUnsafeControl = (value: string): boolean => {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code <= 31 || code === 127) return true;
    }
    return false;
};

export const safeText = (
    value: unknown,
    maxLength = 128,
): string | undefined => {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    if (value.length > maxLength || containsUnsafeControl(value)) {
        return undefined;
    }
    return value;
};

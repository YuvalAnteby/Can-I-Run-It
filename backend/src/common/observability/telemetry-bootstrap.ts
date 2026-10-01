import {
    shutdownAzureMonitor,
    useAzureMonitor,
} from '@azure/monitor-opentelemetry';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { AggregationType } from '@opentelemetry/sdk-metrics';
import type {
    ReadableSpan,
    SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

export interface ObservabilityConfig {
    enabled: boolean;
    connectionString?: string;
    samplingRatio: number;
}

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const RATIO_PATTERN = /^(?:0|1|0\.\d+|1\.0+)$/;
let initialized = false;

const invalid = (setting: string): never => {
    throw new Error(`Invalid ${setting}`);
};

const readBoolean = (env: NodeJS.ProcessEnv): boolean => {
    const value = env.TELEMETRY_ENABLED;
    if (value === undefined) return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return invalid('TELEMETRY_ENABLED');
};

const readSamplingRatio = (env: NodeJS.ProcessEnv): number => {
    const raw = env.OTEL_TRACES_SAMPLER_ARG;
    if (raw === undefined) return 0.1;
    const value = raw.trim();
    if (!RATIO_PATTERN.test(value)) return invalid('OTEL_TRACES_SAMPLER_ARG');
    const ratio = Number(value);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        return invalid('OTEL_TRACES_SAMPLER_ARG');
    }
    return ratio;
};

export function readObservabilityConfig(
    env: NodeJS.ProcessEnv = process.env,
): ObservabilityConfig {
    const level = (env.LOG_LEVEL ?? 'info').trim();
    if (!LOG_LEVELS.has(level)) invalid('LOG_LEVEL');

    const enabled = readBoolean(env);
    const connectionString = env.APPLICATIONINSIGHTS_CONNECTION_STRING?.trim();
    if (enabled && !connectionString) {
        throw new Error(
            'APPLICATIONINSIGHTS_CONNECTION_STRING is required when TELEMETRY_ENABLED=true',
        );
    }

    return {
        enabled,
        ...(connectionString ? { connectionString } : {}),
        samplingRatio: readSamplingRatio(env),
    };
}

const isProbePath = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const path = value.split('?', 1)[0];
    return (
        path === '/api/health/live' ||
        path === '/api/health/ready' ||
        path === '/api/health/postgres'
    );
};

const containsUnsafeControl = (value: string): boolean => {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code <= 31 || code === 127) return true;
    }
    return false;
};

const safeText = (value: unknown, maxLength = 160): string | undefined => {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    if (value.length > maxLength || containsUnsafeControl(value)) {
        return undefined;
    }
    return value;
};

const safeAttribute = (key: string, value: unknown): unknown => {
    if (key === 'http.request.method' || key === 'http.method') {
        const method = safeText(value, 16)?.toUpperCase();
        return method && /^[A-Z]+$/.test(method) ? method : undefined;
    }
    if (key === 'http.route') {
        const route = safeText(value);
        return route && /^\/[A-Za-z0-9_./:-]{0,159}$/.test(route)
            ? route
            : 'unmatched';
    }
    if (key === 'http.response.status_code' || key === 'http.status_code') {
        return Number.isInteger(value) && (value as number) >= 100
            ? value
            : undefined;
    }
    if (key === 'db.system') {
        return value === 'postgresql' ? value : undefined;
    }
    if (key === 'microsoft.sample_rate') {
        return typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= 0 &&
            value <= 100
            ? value
            : undefined;
    }
    if (key === 'db.operation' || key === 'db.operation.name') {
        const operation = safeText(value, 32)?.toUpperCase();
        return operation && /^[A-Z_]+$/.test(operation) ? operation : undefined;
    }
    if (
        key === 'service.name' ||
        key === 'service.instance.id' ||
        key === 'deployment.environment.name'
    ) {
        return safeText(value);
    }
    if (key === 'ciri.request_id') {
        return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value)
            ? value
            : undefined;
    }
    if (
        key === 'ciri.stage' ||
        key === 'ciri.provider' ||
        key === 'ciri.outcome'
    ) {
        const label = safeText(value, 64);
        return label && /^[A-Za-z0-9_.:-]+$/.test(label) ? label : undefined;
    }
    if (key === 'ciri.duration_ms') {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0
            ? value
            : undefined;
    }
    return undefined;
};

const postgresOperationFromName = (name: string): string => {
    if (name === 'pg.connect') return 'CONNECT';
    if (name === 'pg-pool.connect') return 'POOL_CONNECT';
    if (name.startsWith('pg.query:')) {
        const operation = name.slice('pg.query:'.length).split(' ', 1)[0];
        if (/^[A-Za-z_]+$/.test(operation)) return operation.toUpperCase();
    }
    return 'QUERY';
};

export function sanitizeSpan(span: ReadableSpan): void {
    const attributes = span.attributes as Record<string, unknown>;
    if (
        attributes['db.system'] === undefined &&
        attributes['db.system.name'] === 'postgresql'
    ) {
        attributes['db.system'] = 'postgresql';
    }
    const allowed = new Set([
        'http.request.method',
        'http.method',
        'http.route',
        'http.response.status_code',
        'http.status_code',
        'db.system',
        'db.operation',
        'db.operation.name',
        'service.name',
        'service.instance.id',
        'deployment.environment.name',
        'ciri.request_id',
        'ciri.stage',
        'ciri.provider',
        'ciri.outcome',
        'ciri.duration_ms',
        'microsoft.sample_rate',
    ]);
    for (const key of Object.keys(attributes)) {
        if (!allowed.has(key)) {
            delete attributes[key];
            continue;
        }
        const value = safeAttribute(key, attributes[key]);
        if (value === undefined) delete attributes[key];
        else attributes[key] = value;
    }

    const spanWithMutableFields = span as unknown as {
        name?: unknown;
        events?: unknown[];
        status?: { code?: unknown };
    };
    const route =
        typeof attributes['http.route'] === 'string'
            ? attributes['http.route']
            : undefined;
    const method =
        typeof attributes['http.request.method'] === 'string'
            ? attributes['http.request.method']
            : typeof attributes['http.method'] === 'string'
              ? attributes['http.method']
              : undefined;
    const spanName =
        typeof spanWithMutableFields.name === 'string'
            ? spanWithMutableFields.name
            : '';
    if (spanName.startsWith('ciri.')) {
        spanWithMutableFields.name = spanName.replace(/[^A-Za-z0-9_.:-]/g, '_');
    } else if (route) {
        spanWithMutableFields.name = `${method ?? 'HTTP'} ${route}`;
    } else if (attributes['db.system'] === 'postgresql') {
        const operation =
            typeof attributes['db.operation'] === 'string'
                ? attributes['db.operation']
                : typeof attributes['db.operation.name'] === 'string'
                  ? attributes['db.operation.name']
                  : postgresOperationFromName(spanName);
        spanWithMutableFields.name = `postgresql.${operation}`;
    } else {
        spanWithMutableFields.name = 'unmatched';
    }
    spanWithMutableFields.events = [];
    const statusCode = spanWithMutableFields.status?.code;
    spanWithMutableFields.status = {
        code: typeof statusCode === 'number' ? statusCode : 0,
    };
}

const sanitizer: SpanProcessor = {
    onStart: () => undefined,
    onEnd: sanitizeSpan,
    shutdown: () => Promise.resolve(),
    forceFlush: () => Promise.resolve(),
};

const metricViews = [
    {
        meterName: '@opentelemetry/instrumentation-http',
        aggregation: { type: AggregationType.DROP },
    },
];

const startupEnvironment = (value: unknown): string => {
    return typeof value === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(value)
        ? value
        : 'unknown';
};

const reportInitializationFailure = (environment: unknown): void => {
    process.stdout.write(
        `${JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'ciri-backend',
            environment: startupEnvironment(environment),
            level: 'warn',
            event: 'telemetry.initialization.failed',
            context: 'Telemetry',
        })}\n`,
    );
};

export function initializeTelemetry(
    env: NodeJS.ProcessEnv = process.env,
): void {
    if (initialized) return;
    const config = readObservabilityConfig(env);
    if (!config.enabled) return;

    initialized = true;
    try {
        const instanceId = env.CONTAINER_APP_REVISION ?? env.HOSTNAME;
        const attributes: Record<string, string> = {
            'service.name': 'ciri-backend',
            'deployment.environment.name': env.NODE_ENV ?? 'production',
        };
        if (instanceId) attributes['service.instance.id'] = instanceId;

        process.env.APPLICATIONINSIGHTS_INSTRUMENTATION_LOGGING_LEVEL = 'NONE';
        const httpInstrumentationOptions = {
            enabled: true,
            ignoreIncomingRequestHook: (request: { url?: string }) =>
                isProbePath(request.url),
            ignoreOutgoingRequestHook: () => true,
        };
        const postgreSqlInstrumentationOptions = {
            enabled: true,
            enhancedDatabaseReporting: false,
            requireParentSpan: true,
        };
        useAzureMonitor({
            azureMonitorExporterOptions: {
                connectionString: config.connectionString,
                disableOfflineStorage: true,
            },
            resource: resourceFromAttributes(attributes),
            samplingRatio: config.samplingRatio,
            tracesPerSecond: 0,
            enableLiveMetrics: false,
            enableStandardMetrics: false,
            enablePerformanceCounters: false,
            enableTraceBasedSamplingForLogs: false,
            browserSdkLoaderOptions: { enabled: false },
            views: metricViews,
            instrumentationOptions: {
                http: httpInstrumentationOptions,
                postgreSql: postgreSqlInstrumentationOptions,
                azureSdk: { enabled: false },
                mongoDb: { enabled: false },
                mySql: { enabled: false },
                redis: { enabled: false },
                redis4: { enabled: false },
                console: { enabled: false },
                bunyan: { enabled: false },
                winston: { enabled: false },
            },
            spanProcessors: [sanitizer],
        });
    } catch {
        // Telemetry must never prevent the API from starting or serving traffic.
        reportInitializationFailure(env.NODE_ENV);
    }
}

export function shutdownTelemetry(): Promise<void> {
    return initialized ? shutdownAzureMonitor() : Promise.resolve();
}

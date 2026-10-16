jest.mock('@azure/monitor-opentelemetry', () => ({
    useAzureMonitor: jest.fn(),
}));

import {
    AggregationTemporality,
    AggregationType,
    InMemoryMetricExporter,
    MeterProvider,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';

type BootstrapModule = typeof import('./telemetry-bootstrap');

type AzureMonitorOptions = {
    azureMonitorExporterOptions: {
        connectionString: string;
        disableOfflineStorage: boolean;
    };
    enableLiveMetrics: boolean;
    enableStandardMetrics: boolean;
    enablePerformanceCounters: boolean;
    tracesPerSecond: number;
    samplingRatio: number;
    instrumentationOptions: {
        http: {
            enabled: boolean;
            ignoreIncomingRequestHook: (request: { url?: string }) => boolean;
            ignoreOutgoingRequestHook: () => boolean;
        };
        postgreSql: {
            enabled: boolean;
            enhancedDatabaseReporting: boolean;
            requireParentSpan: boolean;
        };
        console: { enabled: boolean };
        bunyan: { enabled: boolean };
        winston: { enabled: boolean };
    };
    views: Array<{
        meterName?: string;
        aggregation?: { type: AggregationType };
    }>;
};

type AzureMonitorMock = jest.MockedFunction<
    (options: AzureMonitorOptions) => void
>;

const loadBootstrap = (): BootstrapModule => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./telemetry-bootstrap') as BootstrapModule;
};

const azureMonitor = (): { useAzureMonitor: AzureMonitorMock } =>
    jest.requireMock('@azure/monitor-opentelemetry');

describe('telemetry bootstrap', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    it('defaults to disabled telemetry and ten percent sampling', () => {
        expect(loadBootstrap().readObservabilityConfig({})).toEqual({
            enabled: false,
            samplingRatio: 0.1,
        });
    });

    it('trims the connection string and accepts an explicit sampling ratio', () => {
        expect(
            loadBootstrap().readObservabilityConfig({
                TELEMETRY_ENABLED: 'true',
                APPLICATIONINSIGHTS_CONNECTION_STRING:
                    '  InstrumentationKey=x  ',
                OTEL_TRACES_SAMPLER_ARG: '0.25',
            }),
        ).toEqual({
            enabled: true,
            connectionString: 'InstrumentationKey=x',
            samplingRatio: 0.25,
        });
    });

    it.each([
        ['TELEMETRY_ENABLED', { TELEMETRY_ENABLED: 'yes' }],
        [
            'APPLICATIONINSIGHTS_CONNECTION_STRING',
            { TELEMETRY_ENABLED: 'true' },
        ],
        ['OTEL_TRACES_SAMPLER_ARG', { OTEL_TRACES_SAMPLER_ARG: '1.1' }],
        ['OTEL_TRACES_SAMPLER_ARG', { OTEL_TRACES_SAMPLER_ARG: 'NaN' }],
        ['LOG_LEVEL', { LOG_LEVEL: 'verbose' }],
    ])('rejects invalid %s without leaking values', (setting, env) => {
        expect(() => loadBootstrap().readObservabilityConfig(env)).toThrow(
            setting,
        );
        expect(() => loadBootstrap().readObservabilityConfig(env)).not.toThrow(
            JSON.stringify(env),
        );
    });

    it('initializes the Azure SDK once with safe instrumentation settings', async () => {
        const bootstrap = loadBootstrap();
        bootstrap.initializeTelemetry({
            TELEMETRY_ENABLED: 'true',
            APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=x',
            OTEL_TRACES_SAMPLER_ARG: '0.1',
            LOG_LEVEL: 'info',
        });
        bootstrap.initializeTelemetry({
            TELEMETRY_ENABLED: 'true',
            APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=x',
            OTEL_TRACES_SAMPLER_ARG: '0.1',
            LOG_LEVEL: 'info',
        });

        const calls = azureMonitor().useAzureMonitor;
        expect(calls).toHaveBeenCalledTimes(1);
        const options = calls.mock.calls[0]?.[0];
        expect(options).toBeDefined();
        if (options === undefined)
            throw new Error('Azure options were not captured');

        expect(options.azureMonitorExporterOptions).toEqual({
            connectionString: 'InstrumentationKey=x',
            disableOfflineStorage: true,
        });
        expect(options).toMatchObject({
            enableLiveMetrics: false,
            enableStandardMetrics: false,
            enablePerformanceCounters: false,
            tracesPerSecond: 0,
            samplingRatio: 0.1,
            instrumentationOptions: {
                http: { enabled: true },
                postgreSql: {
                    enabled: true,
                    enhancedDatabaseReporting: false,
                    requireParentSpan: true,
                },
                console: { enabled: false },
                bunyan: { enabled: false },
                winston: { enabled: false },
            },
        });
        expect(
            options.instrumentationOptions.http.ignoreIncomingRequestHook({
                url: '/api/health/live',
            }),
        ).toBe(true);
        expect(
            options.instrumentationOptions.http.ignoreIncomingRequestHook({
                url: '/api/v1/check',
            }),
        ).toBe(false);
        expect(
            options.instrumentationOptions.http.ignoreOutgoingRequestHook(),
        ).toBe(true);
        expect(options.views).toEqual([
            {
                meterName: '@opentelemetry/instrumentation-http',
                aggregation: { type: AggregationType.DROP },
            },
        ]);

        const exporter = new InMemoryMetricExporter(
            AggregationTemporality.CUMULATIVE,
        );
        const reader = new PeriodicExportingMetricReader({ exporter });
        const meterProvider = new MeterProvider({
            views: options.views,
            readers: [reader],
        });
        try {
            meterProvider
                .getMeter('ciri-backend')
                .createCounter('ciri.http.requests')
                .add(1);
            meterProvider
                .getMeter('@opentelemetry/instrumentation-http')
                .createHistogram('http.server.duration')
                .record(1);
            await meterProvider.forceFlush();

            const metricNames = exporter
                .getMetrics()
                .flatMap(({ scopeMetrics }) =>
                    scopeMetrics.flatMap(({ metrics }) =>
                        metrics.map(({ descriptor }) => descriptor.name),
                    ),
                );
            expect(metricNames).toContain('ciri.http.requests');
            expect(metricNames).not.toContain('http.server.duration');
        } finally {
            await meterProvider.shutdown();
        }
    });

    it('removes SQL, URLs, exception events, and status messages from spans', () => {
        const span = {
            name: 'HTTP POST https://example.test/api/v1/check?token=secret',
            attributes: {
                'http.method': 'POST',
                'http.route': '/api/v1/check',
                'http.url': 'https://example.test/api/v1/check?token=secret',
                'db.system': 'postgresql',
                'db.statement': 'SELECT password FROM users',
                'url.full': 'https://user:secret@example.test/',
                'ciri.request_id': 'request-123',
                unknown: 'drop-me',
            },
            events: [
                {
                    name: 'exception',
                    attributes: { 'exception.message': 'secret stack' },
                },
            ],
            status: { code: 2, message: 'secret status' },
        };

        loadBootstrap().sanitizeSpan(span as never);

        expect(span.attributes).toEqual(
            expect.objectContaining({
                'http.method': 'POST',
                'http.route': '/api/v1/check',
                'db.system': 'postgresql',
                'ciri.request_id': 'request-123',
            }),
        );
        expect(span.attributes).not.toHaveProperty('http.url');
        expect(span.attributes).not.toHaveProperty('url.full');
        expect(span.attributes).not.toHaveProperty('db.statement');
        expect(span.attributes).not.toHaveProperty('unknown');
        expect(span.events).toEqual([]);
        expect(span.status).toEqual({ code: 2 });
        expect(span.name).not.toContain('https://');
        expect(span.name).not.toContain('token=secret');
    });

    it('canonicalizes PostgreSQL attributes and keeps only safe sampler values', () => {
        const span = {
            name: 'database query',
            attributes: {
                'db.system.name': 'postgresql',
                'db.operation.name': 'SELECT',
                'microsoft.sample_rate': 10,
                'microsoft.sample_rate.invalid': Number.POSITIVE_INFINITY,
            },
            events: [],
            status: { code: 0, message: 'remove this' },
        };

        loadBootstrap().sanitizeSpan(span as never);

        expect(span.attributes).toEqual(
            expect.objectContaining({
                'db.system': 'postgresql',
                'db.operation.name': 'SELECT',
                'microsoft.sample_rate': 10,
            }),
        );
        expect(span.attributes).not.toHaveProperty('db.system.name');
        expect(span.attributes).not.toHaveProperty(
            'microsoft.sample_rate.invalid',
        );
        expect(span.name).toBe('postgresql.SELECT');
    });
});

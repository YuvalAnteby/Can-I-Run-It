import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { context as otelContext, trace } from '@opentelemetry/api';

import { requestContext } from './request-context';

const LOG_LEVELS: Record<string, LogLevel[]> = {
    debug: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'],
    info: ['log', 'error', 'warn', 'fatal'],
    warn: ['warn', 'error', 'fatal'],
    error: ['error', 'fatal'],
};

const CONTEXT_FIELDS = new Set([
    'requestId',
    'traceId',
    'spanId',
    'route',
    'method',
    'statusCode',
    'durationMs',
    'provider',
    'stage',
    'outcome',
    'count',
    'errorType',
]);

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const containsUnsafeControl = (value: string): boolean => {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code <= 31 || code === 127) return true;
    }
    return false;
};

const safeText = (value: unknown, maxLength = 128): string | undefined => {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    if (value.length > maxLength || containsUnsafeControl(value)) {
        return undefined;
    }
    return value;
};

const safeEvent = (value: unknown): string => {
    const event = safeText(value, 80);
    return event && /^[A-Za-z0-9_.:-]+$/.test(event) ? event : 'log';
};

const safeNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const correlationFields = (): RecordValue => {
    const fields: RecordValue = {};
    const requestId = requestContext.getStore()?.requestId;
    if (
        typeof requestId === 'string' &&
        /^[A-Za-z0-9._-]{1,64}$/.test(requestId)
    ) {
        fields.requestId = requestId;
    }
    const span = trace.getSpan(otelContext.active());
    if (span) {
        const spanContext = span.spanContext();
        if (/^[0-9a-f]{32}$/i.test(spanContext.traceId)) {
            fields.traceId = spanContext.traceId;
        }
        if (/^[0-9a-f]{16}$/i.test(spanContext.spanId)) {
            fields.spanId = spanContext.spanId;
        }
    }
    return fields;
};

const safeContextValue = (key: string, value: unknown): unknown => {
    if (!CONTEXT_FIELDS.has(key)) return undefined;
    if (key === 'statusCode' || key === 'count') {
        return Number.isInteger(value) && (value as number) >= 0
            ? value
            : undefined;
    }
    if (key === 'durationMs') {
        const duration = safeNumber(value);
        return duration !== undefined && duration >= 0 ? duration : undefined;
    }
    if (key === 'route') {
        const route = safeText(value, 160);
        return route && route.startsWith('/') && !route.includes('?')
            ? route
            : route === 'unmatched'
              ? route
              : undefined;
    }
    if (key === 'method') {
        const method = safeText(value, 16)?.toUpperCase();
        return method && /^[A-Z]+$/.test(method) ? method : undefined;
    }
    return safeText(value);
};

const logContext = (
    message: unknown,
    context: string | undefined,
): RecordValue => {
    const fields: RecordValue = {};
    const sources = [
        isRecord(message) ? message : undefined,
        isRecord(message) && isRecord(message.context)
            ? message.context
            : undefined,
    ];
    for (const source of sources) {
        if (!source) continue;
        for (const [key, value] of Object.entries(source)) {
            const safeValue = safeContextValue(key, value);
            if (safeValue !== undefined) fields[key] = safeValue;
        }
    }
    if (isRecord(message) && typeof message.context === 'string') {
        const nestedContext = safeText(message.context, 80);
        if (nestedContext && !context) fields.context = nestedContext;
    }
    return fields;
};

const errorType = (messages: unknown[]): string | undefined => {
    const error = messages.find(
        (message): message is Error => message instanceof Error,
    );
    return error ? safeText(error.name, 80) : undefined;
};

const readableValue = (value: unknown): string | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    return safeText(value);
};

const readableMessage = (messages: unknown[], context?: string): string => {
    const message = messages.find((item) => isRecord(item));
    const fields = logContext(message, context);
    for (const [key, value] of Object.entries(correlationFields())) {
        if (fields[key] === undefined) fields[key] = value;
    }
    const type = errorType(messages);
    if (type) fields.errorType = type;

    const structuredEvent = isRecord(message)
        ? safeEvent(message.event)
        : undefined;
    const parts: string[] = [];
    if (structuredEvent) parts.push(`event=${structuredEvent}`);
    for (const [key, value] of Object.entries(fields)) {
        if (key === 'context') continue;
        const safeValue = readableValue(value);
        if (safeValue !== undefined) parts.push(`${key}=${safeValue}`);
    }
    if (parts.length > 0) return parts.join(' ');

    const text = messages.find((item): item is string => {
        return typeof item === 'string' && safeText(item, 512) !== undefined;
    });
    return text === undefined
        ? 'event=log'
        : (safeText(text, 512) ?? 'event=log');
};

export class ObservabilityLogger extends ConsoleLogger {
    private readonly environment: string;
    private readonly production: boolean;

    constructor(
        environment = process.env.NODE_ENV ?? 'development',
        level = process.env.LOG_LEVEL ?? 'info',
    ) {
        const normalizedLevel = level.trim().toLowerCase();
        super({
            colors: false,
            compact: true,
            logLevels: LOG_LEVELS[normalizedLevel] ?? LOG_LEVELS.info,
        });
        this.environment = environment.trim() || 'development';
        this.production = this.environment === 'production';
    }

    protected override printMessages(
        messages: unknown[],
        context?: string,
        logLevel: LogLevel = 'log',
        _writeStreamType?: 'stdout' | 'stderr',
        errorStack?: unknown,
    ): void {
        if (!this.production) {
            const stream = _writeStreamType;
            void errorStack;
            super.printMessages(
                [readableMessage(messages, context)],
                safeText(context, 80) ?? 'Nest',
                logLevel,
                stream,
            );
            return;
        }

        const message = messages.find((item) => isRecord(item)) ?? messages[0];
        const structured = isRecord(message) ? message : undefined;
        const entry: RecordValue = {
            timestamp: new Date().toISOString(),
            service: 'ciri-backend',
            environment: this.environment,
            level: logLevel === 'log' ? 'info' : logLevel,
            event: safeEvent(structured?.event),
            context:
                safeText(context, 80) ??
                (typeof structured?.context === 'string'
                    ? safeText(structured.context, 80)
                    : undefined) ??
                'Nest',
        };
        const fields = logContext(message, context);
        for (const [key, value] of Object.entries(correlationFields())) {
            if (fields[key] === undefined) fields[key] = value;
        }
        for (const [key, value] of Object.entries(fields)) {
            if (key !== 'context') entry[key] = value;
        }
        const type = errorType(messages);
        if (type) entry.errorType = type;
        process.stdout.write(`${JSON.stringify(entry)}\n`);
    }

    protected override printStackTrace(_stack: string): void {
        // Error messages and stacks may contain provider payloads or credentials.
    }
}

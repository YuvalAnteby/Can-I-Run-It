import { performance } from 'node:perf_hooks';

import { Logger } from '@nestjs/common';
import { metrics, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

import type { AbuseEvent } from '../abuse-protection/abuse-protection.service';
import { requestContext } from './request-context';

export type StageName =
    | 'check.inputs'
    | 'check.db_lookup'
    | 'check.gemini'
    | 'check.fallback'
    | 'check.persistence'
    | 'rawg.search'
    | 'rawg.detail'
    | 'rawg.persistence';

type ProviderName = 'gemini' | 'rawg';
export type MetricAttributes = Record<string, string | number>;

const logger = new Logger('Telemetry');
const meter = metrics.getMeter('ciri-backend');
const httpRequests = meter.createCounter('ciri.http.requests');
const httpErrors = meter.createCounter('ciri.http.errors');
const httpDuration = meter.createHistogram('ciri.http.duration', {
    unit: 'ms',
});
const providerCalls = meter.createCounter('ciri.provider.calls');
const providerFailures = meter.createCounter('ciri.provider.failures');
const providerTimeouts = meter.createCounter('ciri.provider.timeouts');
const providerRejections = meter.createCounter('ciri.provider.rejections');
const rateLimitRejections = meter.createCounter('ciri.rate_limit.rejections');

const HTTP_METHODS = new Set([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'HEAD',
]);

export const normalizeHttpMethod = (method: unknown): string => {
    const value = typeof method === 'string' ? method.toUpperCase() : '';
    return HTTP_METHODS.has(value) ? value : 'OTHER';
};

const validRequestId = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);

const correlationAttributes = (): MetricAttributes => {
    const requestId = requestContext.getStore()?.requestId;
    return validRequestId(requestId) ? { 'ciri.request_id': requestId } : {};
};

const spanOutcome = (value: unknown): 'success' | 'unavailable' =>
    value === null ? 'unavailable' : 'success';

const stageLog = (
    stage: StageName,
    outcome: string,
    durationMs: number,
): void => {
    logger.log({
        event: 'stage.completed',
        stage,
        outcome,
        durationMs: Math.max(0, Math.round(durationMs)),
    });
};

const providerLog = (
    provider: ProviderName,
    outcome: string,
    durationMs: number,
): void => {
    logger.log({
        event: 'provider.completed',
        provider,
        outcome,
        durationMs: Math.max(0, Math.round(durationMs)),
    });
};

export async function observeStage<T>(
    stage: StageName,
    operation: () => T | Promise<T>,
): Promise<T> {
    const tracer = trace.getTracer('ciri-backend');
    const startedAt = performance.now();
    return tracer.startActiveSpan(
        `ciri.stage.${stage}`,
        {
            kind: SpanKind.INTERNAL,
            attributes: {
                'ciri.stage': stage,
                ...correlationAttributes(),
            },
        },
        async (span) => {
            let outcome = 'success';
            try {
                const result = await operation();
                outcome = spanOutcome(result);
                return result;
            } catch (error) {
                outcome = 'error';
                span.setStatus({ code: SpanStatusCode.ERROR });
                throw error;
            } finally {
                const durationMs = performance.now() - startedAt;
                span.setAttribute('ciri.outcome', outcome);
                span.setAttribute('ciri.duration_ms', durationMs);
                span.end();
                stageLog(stage, outcome, durationMs);
            }
        },
    );
}

export async function observeProvider<T>(
    provider: ProviderName,
    operation: () => Promise<T>,
): Promise<T> {
    const tracer = trace.getTracer('ciri-backend');
    const startedAt = performance.now();
    return tracer.startActiveSpan(
        `ciri.provider.${provider}`,
        {
            kind: SpanKind.CLIENT,
            attributes: {
                'ciri.provider': provider,
                ...correlationAttributes(),
            },
        },
        async (span) => {
            providerCalls.add(1, { provider });
            let outcome = 'success';
            try {
                const result = await operation();
                outcome = spanOutcome(result);
                if (result === null) {
                    span.setStatus({ code: SpanStatusCode.ERROR });
                }
                return result;
            } catch (error) {
                outcome = 'error';
                span.setStatus({ code: SpanStatusCode.ERROR });
                throw error;
            } finally {
                const durationMs = performance.now() - startedAt;
                span.setAttribute('ciri.outcome', outcome);
                span.setAttribute('ciri.duration_ms', durationMs);
                span.end();
                providerLog(provider, outcome, durationMs);
            }
        },
    );
}

export function recordTelemetryEvent(event: AbuseEvent): void {
    const parts = event.split('.');
    if (parts[0] === 'rate_limit') {
        const scope = parts[1];
        if (scope === 'ip' || scope === 'global') {
            rateLimitRejections.add(1, { scope });
        }
        return;
    }

    const provider = parts[1];
    const reason = parts[2];
    if (provider !== 'gemini' && provider !== 'rawg') return;
    if (reason === 'failure') {
        providerFailures.add(1, { provider });
    } else if (reason === 'timeout') {
        providerTimeouts.add(1, { provider });
    } else if (reason === 'budget' || reason === 'concurrency') {
        providerRejections.add(1, { provider, reason });
    }
}

export function recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
): void {
    const attributes: MetricAttributes = {
        method: normalizeHttpMethod(method),
        route,
        statusCode,
    };
    httpRequests.add(1, attributes);
    if (statusCode >= 500) httpErrors.add(1, attributes);
    httpDuration.record(Math.max(0, durationMs), attributes);
}

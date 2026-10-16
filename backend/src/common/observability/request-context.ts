import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { Logger } from '@nestjs/common';
import { context as otelContext, trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';

import {
    type MetricAttributes,
    normalizeHttpMethod,
    recordHttpRequest,
} from './telemetry';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const PROBE_PATHS = new Set([
    '/api/health/live',
    '/api/health/ready',
    '/api/health/postgres',
]);
const logger = new Logger('HTTP');

export function getRequestId(value: unknown): string {
    return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
        ? value
        : randomUUID();
}

const requestPath = (request: Request): string => {
    const path = request.path;
    if (typeof path === 'string' && path.length > 0) return path;
    const url = request.url;
    return typeof url === 'string' ? url.split('?', 1)[0] : '';
};

const isProbe = (request: Request): boolean =>
    PROBE_PATHS.has(requestPath(request));

const routeLabel = (request: Request): string => {
    const route = (request as unknown as { route?: { path?: unknown } }).route;
    const routePath = route && typeof route.path === 'string' ? route.path : '';
    const baseUrl = typeof request.baseUrl === 'string' ? request.baseUrl : '';
    const label = `${baseUrl}${routePath}`;
    return routePath && /^\/[A-Za-z0-9_./:-]{0,159}$/.test(label)
        ? label
        : 'unmatched';
};

const activeSpanContext = (): {
    traceId?: string;
    spanId?: string;
} => {
    const span = trace.getSpan(otelContext.active());
    if (!span) return {};
    const spanContext = span.spanContext();
    return {
        traceId: /^[0-9a-f]{32}$/i.test(spanContext.traceId)
            ? spanContext.traceId
            : undefined,
        spanId: /^[0-9a-f]{16}$/i.test(spanContext.spanId)
            ? spanContext.spanId
            : undefined,
    };
};

export function requestContextMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
): void {
    const requestId = getRequestId(request.headers?.['x-request-id']);
    response.setHeader('X-Request-ID', requestId);
    const probe = isProbe(request);
    const startedAt = performance.now();
    const initialSpan = trace.getSpan(otelContext.active());
    initialSpan?.setAttribute('ciri.request_id', requestId);
    const initialSpanContext = activeSpanContext();
    let completed = false;

    const complete = (aborted: boolean): void => {
        if (completed) return;
        completed = true;
        const statusCode = Number.isInteger(response.statusCode)
            ? response.statusCode
            : 500;
        const durationMs = Math.max(0, performance.now() - startedAt);
        const outcome = aborted
            ? 'aborted'
            : statusCode >= 500
              ? 'error'
              : 'ok';
        const route = routeLabel(request);
        const method = normalizeHttpMethod(request.method);
        const rootSpan = initialSpan ?? trace.getSpan(otelContext.active());
        rootSpan?.setAttribute('http.route', route);
        rootSpan?.setAttribute('http.request.method', method);
        rootSpan?.setAttribute('http.response.status_code', statusCode);
        rootSpan?.setAttribute('ciri.outcome', outcome);
        rootSpan?.updateName(`${method} ${route}`);
        const currentSpanContext = activeSpanContext();
        const fields: MetricAttributes & {
            event: string;
            requestId: string;
            route: string;
            outcome: string;
        } = {
            event: 'http.request.completed',
            requestId,
            route,
            method,
            statusCode,
            durationMs,
            outcome,
        };
        if (currentSpanContext.traceId ?? initialSpanContext.traceId) {
            fields.traceId =
                currentSpanContext.traceId ?? initialSpanContext.traceId!;
        }
        if (currentSpanContext.spanId ?? initialSpanContext.spanId) {
            fields.spanId =
                currentSpanContext.spanId ?? initialSpanContext.spanId!;
        }

        const successfulProbe = probe && !aborted && statusCode < 400;
        if (!successfulProbe) {
            recordHttpRequest(request.method, route, statusCode, durationMs);
            if (aborted || statusCode >= 500) logger.error(fields);
            else if (statusCode >= 400) logger.warn(fields);
            else logger.log(fields);
        }
    };

    response.once('finish', () => complete(false));
    response.once('close', () => complete(!response.writableFinished));

    requestContext.run({ requestId }, () => {
        try {
            next();
        } catch (error) {
            if (response.statusCode < 400) response.statusCode = 500;
            complete(false);
            throw error;
        }
    });
}

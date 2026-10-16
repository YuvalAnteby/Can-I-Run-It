import { EventEmitter } from 'node:events';

import { ConsoleLogger, Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';

import { ObservabilityLogger } from './observability.logger';
import {
    getRequestId,
    requestContext,
    requestContextMiddleware,
} from './request-context';

type TestResponse = Response & EventEmitter & { setHeader: jest.Mock };
type JsonObject = Record<string, unknown>;

const parseJson = (value: unknown): JsonObject =>
    JSON.parse(String(value)) as JsonObject;

const makeRequest = (requestId: string | string[] | undefined): Request =>
    ({
        headers: { 'x-request-id': requestId },
        method: 'GET',
        baseUrl: '/api',
        route: { path: '/v1/check' },
        url: '/api/v1/check?secret=should-not-be-logged',
    }) as unknown as Request;

const makeResponse = (statusCode = 200): TestResponse =>
    Object.assign(new EventEmitter(), {
        setHeader: jest.fn(),
        statusCode,
    }) as unknown as TestResponse;

describe('request context', () => {
    afterEach(() => jest.restoreAllMocks());

    it.each(['request-123', 'A._-z9', 'x'.repeat(64)])(
        'preserves a valid request ID: %s',
        (requestId) => {
            expect(getRequestId(requestId)).toBe(requestId);
        },
    );

    it.each([
        undefined,
        null,
        '',
        'x'.repeat(65),
        'has spaces',
        'has/slash',
        'line\nbreak',
        ['request-123'],
    ])('replaces unsafe request IDs with a generated ID: %p', (requestId) => {
        const generated = getRequestId(requestId);
        expect(generated).not.toBe(requestId);
        expect(generated).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    });

    it('sets X-Request-ID and keeps concurrent request stores isolated', async () => {
        const run = (requestId: string): Promise<string> =>
            new Promise((resolve) => {
                const request = makeRequest(requestId);
                const response = makeResponse();
                requestContextMiddleware(request, response, (() => {
                    setImmediate(() =>
                        resolve(requestContext.getStore()?.requestId ?? ''),
                    );
                }) as NextFunction);
                expect(response.setHeader).toHaveBeenCalledWith(
                    'X-Request-ID',
                    requestId,
                );
            });

        await expect(
            Promise.all([run('first'), run('second')]),
        ).resolves.toEqual(['first', 'second']);
    });

    it('completes once on finish or close and records the route without the raw URL', () => {
        const response = makeResponse(429);
        const span = {
            setAttribute: jest.fn(),
            updateName: jest.fn(),
            spanContext: jest.fn(() => ({
                traceId: 'a'.repeat(32),
                spanId: 'b'.repeat(16),
            })),
        };
        jest.spyOn(trace, 'getSpan').mockReturnValue(span as never);
        const output = jest
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        Logger.overrideLogger(new ObservabilityLogger('production', 'info'));

        try {
            requestContextMiddleware(
                makeRequest('request-123'),
                response,
                (() => undefined) as NextFunction,
            );
            response.emit('finish');
            response.emit('close');

            const lines = output.mock.calls.map(([chunk]) => String(chunk));
            expect(lines).toHaveLength(1);
            const entry = parseJson(lines[0]);
            expect(entry).toMatchObject({
                event: 'http.request.completed',
                requestId: 'request-123',
                route: '/api/v1/check',
                method: 'GET',
                statusCode: 429,
                traceId: 'a'.repeat(32),
                spanId: 'b'.repeat(16),
            });
            expect(lines[0]).not.toContain('secret=');
            expect(span.setAttribute).toHaveBeenCalledWith(
                'ciri.request_id',
                'request-123',
            );
        } finally {
            Logger.overrideLogger(new ConsoleLogger());
            output.mockRestore();
        }
    });

    it('records a 500 aborted close once with an aborted outcome', () => {
        const logger = new ObservabilityLogger('production', 'info');
        Logger.overrideLogger(logger);
        const output = jest
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);

        try {
            const response = makeResponse(500);
            requestContextMiddleware(
                makeRequest('aborted-request'),
                response,
                (() => undefined) as NextFunction,
            );
            response.emit('close');
            response.emit('finish');

            expect(output.mock.calls).toHaveLength(1);
            expect(parseJson(output.mock.calls[0]?.[0])).toMatchObject({
                event: 'http.request.completed',
                method: 'GET',
                statusCode: 500,
                outcome: 'aborted',
            });
        } finally {
            Logger.overrideLogger(new ConsoleLogger());
            output.mockRestore();
        }
    });

    it('suppresses successful health probes but keeps failed readiness visible', () => {
        const logger = new ObservabilityLogger('production', 'info');
        Logger.overrideLogger(logger);
        const output = jest
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);

        try {
            const healthy = makeRequest('healthy');
            healthy.baseUrl = '/api/health';
            healthy.route = { path: '/ready' } as never;
            healthy.url = '/api/health/ready';
            const healthyResponse = makeResponse(200);
            requestContextMiddleware(
                healthy,
                healthyResponse,
                (() => undefined) as NextFunction,
            );
            healthyResponse.emit('finish');
            expect(output.mock.calls).toHaveLength(0);

            const failed = makeRequest('failed');
            failed.baseUrl = '/api/health';
            failed.route = { path: '/ready' } as never;
            failed.url = '/api/health/ready';
            const failedResponse = makeResponse(503);
            requestContextMiddleware(
                failed,
                failedResponse,
                (() => undefined) as NextFunction,
            );
            failedResponse.emit('finish');

            expect(output.mock.calls).toHaveLength(1);
            expect(parseJson(output.mock.calls[0]?.[0])).toMatchObject({
                event: 'http.request.completed',
                route: '/api/health/ready',
                statusCode: 503,
            });
        } finally {
            Logger.overrideLogger(new ConsoleLogger());
            output.mockRestore();
        }
    });

    it('uses unmatched when an Express route template is unavailable', () => {
        const logger = new ObservabilityLogger('production', 'info');
        Logger.overrideLogger(logger);
        const output = jest
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);

        try {
            const request = makeRequest('request-123');
            request.route = undefined;
            const response = makeResponse(404);
            requestContextMiddleware(
                request,
                response,
                (() => undefined) as NextFunction,
            );
            response.emit('finish');

            expect(parseJson(output.mock.calls[0]?.[0])).toMatchObject({
                route: 'unmatched',
                statusCode: 404,
            });
            expect(String(output.mock.calls[0]?.[0])).not.toContain('secret=');
        } finally {
            Logger.overrideLogger(new ConsoleLogger());
            output.mockRestore();
        }
    });
});

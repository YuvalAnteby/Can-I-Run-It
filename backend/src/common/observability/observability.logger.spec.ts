import { ObservabilityLogger } from './observability.logger';
import { requestContext } from './request-context';

type JsonLogEntry = Record<string, unknown>;

const capture = (stream: 'stdout' | 'stderr', action: () => void): string => {
    const write = jest
        .spyOn(process[stream], 'write')
        .mockImplementation(() => true);
    try {
        action();
        return write.mock.calls.map(([chunk]) => String(chunk)).join('');
    } finally {
        write.mockRestore();
    }
};

describe('ObservabilityLogger', () => {
    it('writes production events as JSON with only bounded context fields', () => {
        const logger = new ObservabilityLogger('production', 'info');
        const output = capture('stdout', () =>
            logger.log(
                {
                    event: 'request.completed',
                    requestId: 'request-123',
                    route: '/api/v1/check',
                    method: 'GET',
                    statusCode: 200,
                    durationMs: 12,
                    password: 'secret-password',
                    url: 'https://user:password@example.test/private',
                },
                'RequestContext',
            ),
        );
        const entry = JSON.parse(output) as JsonLogEntry;

        expect(entry).toMatchObject({
            service: 'ciri-backend',
            environment: 'production',
            level: 'info',
            event: 'request.completed',
            context: 'RequestContext',
            requestId: 'request-123',
            route: '/api/v1/check',
            method: 'GET',
            statusCode: 200,
            durationMs: 12,
        });
        expect(entry.timestamp).toEqual(expect.any(String));
        expect(output).not.toContain('secret-password');
        expect(output).not.toContain('example.test');
    });

    it('keeps production errors bounded while development output remains useful', () => {
        const production = new ObservabilityLogger('production', 'error');
        const development = new ObservabilityLogger('development', 'error');
        const error = new Error('provider secret response body');
        const stack =
            'Error: provider secret response body\n    at secret-file.ts:1:1';

        const productionOutput = capture('stdout', () =>
            production.error(error, stack),
        );
        const developmentStdout = jest
            .spyOn(process.stdout, 'write')
            .mockImplementation(() => true);
        const developmentStderr = jest
            .spyOn(process.stderr, 'write')
            .mockImplementation(() => true);
        let developmentOutput = '';
        try {
            development.error(error, stack);
            developmentOutput = developmentStdout.mock.calls
                .concat(developmentStderr.mock.calls)
                .map(([chunk]) => String(chunk))
                .join('');
        } finally {
            developmentStdout.mockRestore();
            developmentStderr.mockRestore();
        }

        const productionEntry = JSON.parse(productionOutput) as JsonLogEntry;
        expect(productionEntry).toMatchObject({
            level: 'error',
            errorType: 'Error',
        });
        expect(productionOutput).not.toContain('provider secret response body');
        expect(productionOutput).not.toContain('secret-file.ts');
        expect(developmentOutput).toContain('ERROR');
        expect(developmentOutput).toContain('[Nest]');
        expect(developmentOutput).toContain('errorType=Error');
        expect(developmentOutput).not.toContain(
            'provider secret response body',
        );
        expect(developmentOutput).not.toContain('secret-file.ts');
    });

    it('adds the active request ID to downstream structured logs', () => {
        const logger = new ObservabilityLogger('production', 'info');
        const output = capture('stdout', () =>
            requestContext.run({ requestId: 'abc' }, () =>
                logger.log({ event: 'stage.completed' }),
            ),
        );
        const entry = JSON.parse(output) as JsonLogEntry;

        expect(entry).toMatchObject({
            event: 'stage.completed',
            requestId: 'abc',
        });
    });

    it('honors the configured log level', () => {
        const logger = new ObservabilityLogger('development', 'warn');
        const output = capture('stdout', () => logger.debug('hidden'));

        expect(output).toBe('');
    });
});

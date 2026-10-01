import { INestApplication } from '@nestjs/common';

type NestCreate = (
    module: unknown,
    options: { logger: unknown },
) => Promise<INestApplication>;

describe('bootstrap', () => {
    it.each([undefined, '0', '1'])(
        'trusts one proxy only with validated configuration %s',
        async (trustProxy) => {
            const previous = process.env.TRUST_PROXY;
            // Keep process.env deliberately different; bootstrap must read the
            // validated ConfigService value from the Nest application.
            process.env.TRUST_PROXY = '1';
            const set = jest.fn();
            const config = {
                get: jest.fn().mockReturnValue(trustProxy ?? '0'),
            };
            const enableShutdownHooks = jest.fn();
            const app = {
                enableShutdownHooks,
                get: jest.fn().mockReturnValue(config),
                set,
                use: jest.fn(),
                useLogger: jest.fn(),
                setGlobalPrefix: jest.fn(),
                enableCors: jest.fn(),
                enableVersioning: jest.fn(),
                useGlobalPipes: jest.fn(),
                listen: jest.fn().mockResolvedValue(undefined),
            } as unknown as INestApplication;

            jest.resetModules();
            jest.doMock('@nestjs/core', () => ({
                NestFactory: {
                    create: jest.fn().mockResolvedValue(app),
                },
            }));
            jest.doMock('@nestjs/swagger', () => ({
                DocumentBuilder: class {
                    setTitle(): this {
                        return this;
                    }

                    setDescription(): this {
                        return this;
                    }

                    setVersion(): this {
                        return this;
                    }

                    build(): Record<string, never> {
                        return {};
                    }
                },
                SwaggerModule: {
                    createDocument: jest.fn(),
                    setup: jest.fn(),
                },
            }));
            jest.doMock('./app.module', () => ({ AppModule: class {} }));

            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require('./main');
            await new Promise((resolve) => setImmediate(resolve));

            if (previous === undefined) delete process.env.TRUST_PROXY;
            else process.env.TRUST_PROXY = previous;
            expect(enableShutdownHooks.mock.calls).toHaveLength(1);
            if (trustProxy === '1')
                expect(set).toHaveBeenCalledWith('trust proxy', 1);
            else expect(set).not.toHaveBeenCalled();
        },
    );

    it('initializes telemetry early, installs request context, and exposes its response header', async () => {
        const set = jest.fn();
        const use = jest.fn();
        const enableCors = jest.fn();
        const requestContextMiddleware = jest.fn();
        const initializeTelemetry = jest.fn();
        const config = {
            get: jest.fn().mockReturnValue('0'),
        };
        const app = {
            enableShutdownHooks: jest.fn(),
            get: jest.fn().mockReturnValue(config),
            set,
            use,
            useLogger: jest.fn(),
            setGlobalPrefix: jest.fn(),
            enableCors,
            enableVersioning: jest.fn(),
            useGlobalPipes: jest.fn(),
            listen: jest.fn().mockResolvedValue(undefined),
        } as unknown as INestApplication;
        const create: jest.MockedFunction<NestCreate> = jest
            .fn()
            .mockResolvedValue(app);

        jest.resetModules();
        jest.doMock('@nestjs/core', () => ({
            NestFactory: {
                create,
            },
        }));
        jest.doMock('@nestjs/swagger', () => ({
            DocumentBuilder: class {
                setTitle(): this {
                    return this;
                }

                setDescription(): this {
                    return this;
                }

                setVersion(): this {
                    return this;
                }

                build(): Record<string, never> {
                    return {};
                }
            },
            SwaggerModule: {
                createDocument: jest.fn(),
                setup: jest.fn(),
            },
        }));
        jest.doMock('./app.module', () => ({ AppModule: class {} }));
        jest.doMock('./common/observability/request-context', () => ({
            requestContextMiddleware,
        }));
        jest.doMock('./common/observability/telemetry-bootstrap', () => ({
            initializeTelemetry,
        }));

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./main');
        await new Promise((resolve) => setImmediate(resolve));

        expect(initializeTelemetry).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(1);
        const createOptions = create.mock.calls[0]?.[1];
        expect(createOptions).toBeDefined();
        if (createOptions === undefined)
            throw new Error('Nest options missing');
        expect(createOptions.logger).toBeDefined();
        expect(use).toHaveBeenCalledWith(requestContextMiddleware);
        expect(enableCors).toHaveBeenCalledWith(
            expect.objectContaining({
                exposedHeaders: ['X-Request-ID'],
            }),
        );
    });
});

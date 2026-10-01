import { INestApplication } from '@nestjs/common';

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
});

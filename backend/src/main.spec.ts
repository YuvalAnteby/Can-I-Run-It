import { INestApplication } from '@nestjs/common';

describe('bootstrap', () => {
    it('enables Nest shutdown hooks once', async () => {
        const enableShutdownHooks = jest.fn();
        const app = {
            enableShutdownHooks,
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

        expect(enableShutdownHooks.mock.calls).toHaveLength(1);
    });
});

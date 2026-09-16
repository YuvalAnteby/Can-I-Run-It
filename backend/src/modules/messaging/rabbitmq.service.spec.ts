import { EventEmitter } from 'node:events';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
    AmqpConnectionManager,
    ChannelWrapper,
} from 'amqp-connection-manager';
import { connect } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

import { RabbitMqService } from './rabbitmq.service';

jest.mock('amqp-connection-manager', () => ({
    connect: jest.fn(),
}));

type ManagerMock = {
    isConnected: jest.Mock;
    createChannel: jest.Mock;
    on: jest.Mock;
    close: jest.Mock;
    handlers: Map<string, (event: unknown) => void>;
};

const connectMock = jest.mocked(connect);

const createManager = (): ManagerMock => {
    const handlers = new Map<string, (event: unknown) => void>();
    const manager = {} as ManagerMock;
    manager.isConnected = jest.fn().mockReturnValue(false);
    manager.createChannel = jest.fn();
    manager.on = jest.fn(
        (event: string, listener: (event: unknown) => void): ManagerMock => {
            handlers.set(event, listener);
            return manager;
        },
    );
    manager.close = jest.fn().mockResolvedValue(undefined);
    manager.handlers = handlers;

    return manager;
};

describe('RabbitMqService', () => {
    let config: { get: jest.Mock };
    let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
    let manager: ManagerMock;

    beforeEach(() => {
        config = {
            get: jest
                .fn()
                .mockReturnValue('amqp://ciri:secret@rabbitmq:5672/ciri'),
        };
        logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
        manager = createManager();
        connectMock.mockReset();
        connectMock.mockReturnValue(
            manager as unknown as AmqpConnectionManager,
        );
    });

    it('rejects missing or malformed RABBITMQ_URL without exposing its value', () => {
        config.get.mockReturnValue(undefined);
        expect(
            () =>
                new RabbitMqService(
                    config as unknown as ConfigService,
                    logger as unknown as Logger,
                ),
        ).toThrow('RABBITMQ_URL is required');

        const malformedUrl = 'https://ciri:secret@rabbitmq:5672/ciri';
        config.get.mockReturnValue(malformedUrl);
        expect(
            () =>
                new RabbitMqService(
                    config as unknown as ConfigService,
                    logger as unknown as Logger,
                ),
        ).toThrow('RABBITMQ_URL must use amqp: or amqps:');
        expect(logger.error.mock.calls.flat()).not.toContain(malformedUrl);
    });

    it('starts without waiting for an unavailable broker', () => {
        const service = new RabbitMqService(
            config as unknown as ConfigService,
            logger as unknown as Logger,
        );

        expect(service.isConnected()).toBe(false);
        expect(connectMock).toHaveBeenCalledWith(
            ['amqp://ciri:secret@rabbitmq:5672/ciri'],
            {
                heartbeatIntervalInSeconds: 5,
                reconnectTimeInSeconds: 5,
                connectionOptions: { timeout: 5_000 },
            },
        );
    });

    it('reflects manager connection and disconnection state in health', () => {
        const service = new RabbitMqService(
            config as unknown as ConfigService,
            logger as unknown as Logger,
        );

        expect(service.isConnected()).toBe(false);
        manager.isConnected.mockReturnValue(true);
        expect(service.isConnected()).toBe(true);
        manager.isConnected.mockReturnValue(false);
        expect(service.isConnected()).toBe(false);
    });

    it('creates tracked confirm JSON channels with the supplied setup', () => {
        const once = jest.fn();
        const wrapper = {
            on: jest.fn(),
            once,
            close: jest.fn().mockResolvedValue(undefined),
        } as unknown as ChannelWrapper;
        const setup = (_channel: ConfirmChannel): Promise<unknown> =>
            Promise.resolve(undefined);
        manager.createChannel.mockReturnValue(wrapper);
        const service = new RabbitMqService(
            config as unknown as ConfigService,
            logger as unknown as Logger,
        );

        expect(service.createConfirmChannel(setup)).toBe(wrapper);
        expect(manager.createChannel).toHaveBeenCalledWith({
            confirm: true,
            json: true,
            setup,
        });
        expect(once).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('handles ChannelWrapper setup errors without crashing or leaking credentials', () => {
        const wrapper = Object.assign(new EventEmitter(), {
            close: jest.fn().mockResolvedValue(undefined),
        }) as unknown as ChannelWrapper;
        manager.createChannel.mockReturnValue(wrapper);
        const service = new RabbitMqService(
            config as unknown as ConfigService,
            logger as unknown as Logger,
        );

        service.createConfirmChannel(() => Promise.resolve(undefined));

        expect(() =>
            wrapper.emit(
                'error',
                new Error(
                    'amqp://ciri:secret@rabbitmq:5672/ciri setup rejected',
                ),
                { name: 'foundation-test' },
            ),
        ).not.toThrow();
        expect(logger.warn).toHaveBeenCalledWith(
            'RabbitMQ channel error; channel will recover on reconnect',
        );
        expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret');
    });

    it('logs connection failures without the broker URL', () => {
        new RabbitMqService(
            config as unknown as ConfigService,
            logger as unknown as Logger,
        );
        const handler = manager.handlers.get('connectFailed') as
            | ((event: { err: Error }) => void)
            | undefined;
        expect(handler).toBeDefined();
        handler?.({
            err: new Error(
                'amqp://ciri:secret@rabbitmq:5672/ciri ACCESS-REFUSED',
            ),
        });

        expect(logger.warn).toHaveBeenCalledWith(
            'RabbitMQ connection failed; broker remains unavailable',
        );
        expect(logger.warn.mock.calls.flat()).not.toContain('secret');
    });

    it('closes created channels before the manager and only once', async () => {
        const firstClose = jest.fn().mockResolvedValue(undefined);
        const firstWrapper = {
            on: jest.fn(),
            once: jest.fn(),
            close: firstClose,
        } as unknown as ChannelWrapper;
        const secondClose = jest.fn().mockResolvedValue(undefined);
        const secondWrapper = {
            on: jest.fn(),
            once: jest.fn(),
            close: secondClose,
        } as unknown as ChannelWrapper;
        manager.createChannel
            .mockReturnValueOnce(firstWrapper)
            .mockReturnValueOnce(secondWrapper);
        const service = new RabbitMqService(
            config as unknown as ConfigService,
            logger as unknown as Logger,
        );
        service.createConfirmChannel(() => Promise.resolve(undefined));
        service.createConfirmChannel(() => Promise.resolve(undefined));

        await service.onApplicationShutdown();
        await service.onApplicationShutdown();

        expect(firstClose).toHaveBeenCalledTimes(1);
        expect(secondClose).toHaveBeenCalledTimes(1);
        expect(manager.close).toHaveBeenCalledTimes(1);
        expect(firstClose.mock.invocationCallOrder[0]).toBeLessThan(
            manager.close.mock.invocationCallOrder[0],
        );
    });
});

import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
    AmqpConnectionManager,
    ChannelWrapper,
    SetupFunc,
} from 'amqp-connection-manager';
import { connect } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

const validateRabbitMqUrl = (value: string | undefined): string => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('RABBITMQ_URL is required');
    }

    const rabbitMqUrl = value.trim();
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(rabbitMqUrl);
    } catch {
        throw new Error(
            'RABBITMQ_URL must use amqp: or amqps: and include credentials',
        );
    }

    if (!['amqp:', 'amqps:'].includes(parsedUrl.protocol)) {
        throw new Error('RABBITMQ_URL must use amqp: or amqps:');
    }

    if (!parsedUrl.hostname) {
        throw new Error('RABBITMQ_URL must include a hostname');
    }

    if (!parsedUrl.username || !parsedUrl.password) {
        throw new Error('RABBITMQ_URL must include credentials');
    }

    return rabbitMqUrl;
};

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
    private readonly connectionManager: AmqpConnectionManager;
    private readonly channels = new Set<ChannelWrapper>();
    private shutdownPromise: Promise<void> | undefined;

    constructor(
        private readonly config: ConfigService,
        private readonly logger: Logger,
    ) {
        const rabbitMqUrl = validateRabbitMqUrl(
            this.config.get<string>('RABBITMQ_URL'),
        );
        this.connectionManager = connect([rabbitMqUrl], {
            heartbeatIntervalInSeconds: 5,
            reconnectTimeInSeconds: 5,
            connectionOptions: { timeout: 5_000 },
        });

        this.connectionManager.on('connect', () =>
            this.logger.log('RabbitMQ connected'),
        );
        this.connectionManager.on('connectFailed', () =>
            this.logger.warn(
                'RabbitMQ connection failed; broker remains unavailable',
            ),
        );
        this.connectionManager.on('disconnect', () =>
            this.logger.warn('RabbitMQ disconnected; reconnecting'),
        );
    }

    isConnected(): boolean {
        return this.connectionManager.isConnected();
    }

    createConfirmChannel(
        setup: (channel: ConfirmChannel) => Promise<unknown>,
    ): ChannelWrapper {
        const channel = this.connectionManager.createChannel({
            confirm: true,
            json: true,
            setup: setup as SetupFunc,
        });
        this.channels.add(channel);
        channel.on('error', () =>
            this.logger.warn(
                'RabbitMQ channel error; channel will recover on reconnect',
            ),
        );
        channel.once('close', () => this.channels.delete(channel));
        return channel;
    }

    async onApplicationShutdown(): Promise<void> {
        if (!this.shutdownPromise) {
            this.shutdownPromise = this.closeResources();
        }

        await this.shutdownPromise;
    }

    private async closeResources(): Promise<void> {
        await Promise.allSettled(
            [...this.channels].map(async (channel) => channel.close()),
        );
        this.channels.clear();

        try {
            await this.connectionManager.close();
        } catch {
            this.logger.warn('RabbitMQ shutdown cleanup completed with errors');
        }
    }
}

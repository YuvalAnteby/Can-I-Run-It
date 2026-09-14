import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import type { ChannelWrapper } from 'amqp-connection-manager';

import { AppModule } from '../src/app.module';
import { RabbitMqService } from '../src/modules/messaging/rabbitmq.service';

const sleep = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = async <T>(promise: Promise<T>, milliseconds: number) =>
    Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error('timed out waiting for RabbitMQ')),
                milliseconds,
            ),
        ),
    ]);

async function run(): Promise<void> {
    const app = await NestFactory.createApplicationContext(AppModule);
    const service = app.get(RabbitMqService);
    const queue = `ciri.foundation-restart.${randomUUID()}`;
    let channel: ChannelWrapper | undefined;

    try {
        channel = service.createConfirmChannel(async (amqpChannel) => {
            await amqpChannel.assertQueue(queue, { durable: true });
        });
        await withTimeout(channel.waitForConnect(), 10_000);
        await channel.sendToQueue(
            queue,
            { probe: 'restart' },
            { persistent: true, timeout: 5_000 },
        );

        console.log(`RABBITMQ_RESTART_PROBE_READY queue=${queue}`);
        const deadline = Date.now() + 60_000;
        let sawDisconnect = false;
        while (Date.now() < deadline) {
            const connected = service.isConnected();
            sawDisconnect ||= !connected;
            if (sawDisconnect && connected) {
                break;
            }
            await sleep(250);
        }

        if (!sawDisconnect || !service.isConnected()) {
            throw new Error('RabbitMQ did not complete a disconnect/reconnect');
        }

        const message = await channel.get(queue, { noAck: false });
        if (message === false) {
            throw new Error('persistent restart probe message is missing');
        }
        const payload = JSON.parse(message.content.toString()) as {
            probe?: unknown;
        };
        if (payload.probe !== 'restart') {
            throw new Error('restart probe payload did not round-trip');
        }
        channel.ack(message);
        console.log('RabbitMQ restart probe passed');
    } finally {
        if (channel) {
            await channel.deleteQueue(queue).catch(() => undefined);
            await channel.close().catch(() => undefined);
        }
        await app.close();
    }
}

void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`RabbitMQ restart probe failed: ${message}`);
    process.exitCode = 1;
});

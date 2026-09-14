import { randomUUID } from 'node:crypto';
import type { Server } from 'node:net';

import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { ChannelWrapper } from 'amqp-connection-manager';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { RabbitMqService } from '../src/modules/messaging/rabbitmq.service';

describe('RabbitMQ foundation (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let channel: ChannelWrapper | undefined;
    const queue = `ciri.foundation-test.${randomUUID()}`;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('api');
        app.enableVersioning({
            type: VersioningType.URI,
            defaultVersion: '1',
        });
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                transformOptions: { enableImplicitConversion: true },
            }),
        );
        await app.init();
        dataSource = app.get<DataSource>('DATA_SOURCE');
    });

    afterAll(async () => {
        if (channel) {
            await channel.deleteQueue(queue).catch(() => undefined);
            await channel.close().catch(() => undefined);
        }
        await app.close();
        await dataSource.destroy();
    });

    it('confirms and reads a persistent JSON message from a durable queue', async () => {
        const service = app.get(RabbitMqService);
        channel = service.createConfirmChannel(async (amqpChannel) => {
            await amqpChannel.assertQueue(queue, { durable: true });
        });

        await channel.waitForConnect();
        await channel.sendToQueue(
            queue,
            { probe: 'persisted' },
            { persistent: true, timeout: 5_000 },
        );

        const message = await channel.get(queue, { noAck: false });
        expect(message).not.toBe(false);
        if (message === false) {
            throw new Error('confirmed message was not available');
        }

        expect(JSON.parse(message.content.toString())).toEqual({
            probe: 'persisted',
        });
        channel.ack(message);
    });

    it('keeps PostgreSQL health independent from broker health reporting', async () => {
        await request(app.getHttpServer() as Server)
            .get('/api/health/postgres')
            .expect(200);
        await request(app.getHttpServer() as Server)
            .get('/api/health/rabbitmq')
            .expect(200);
    });
});

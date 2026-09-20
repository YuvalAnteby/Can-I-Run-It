import { Test, TestingModule } from '@nestjs/testing';

import { RabbitMqService } from '../messaging/rabbitmq.service';
import { EnrichmentPublisher } from './enrichment-publisher.service';
import { GameEnrichmentJob } from './entities/game-enrichment-job.entity';
import {
    assertGameEnrichmentTopology,
    GAME_ENRICHMENT_QUEUE,
} from './game-lifecycle.contract';

const queuedJob = (
    id: number,
    gameId: number,
    attempts = 0,
): GameEnrichmentJob =>
    ({
        id,
        game: { id: gameId },
        status: 'queued',
        attempts,
    }) as unknown as GameEnrichmentJob;

describe('EnrichmentPublisher', () => {
    let service: EnrichmentPublisher;
    let jobsRepository: Record<string, jest.Mock>;
    let rabbitMq: { createConfirmChannel: jest.Mock };
    let channel: {
        sendToQueue: jest.Mock;
        waitForConnect: jest.Mock;
        close: jest.Mock;
    };
    let dataSource: { getRepository: jest.Mock };

    const callReplay = () =>
        (
            service as unknown as {
                replayQueued(): Promise<void>;
            }
        ).replayQueued();

    const callPublish = (job: GameEnrichmentJob) =>
        (
            service as unknown as {
                publishInitial(job: GameEnrichmentJob): Promise<void>;
            }
        ).publishInitial(job);

    beforeEach(async () => {
        jobsRepository = {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn(),
            update: jest.fn(),
        };
        channel = {
            sendToQueue: jest.fn().mockResolvedValue(undefined),
            waitForConnect: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
        };
        rabbitMq = {
            createConfirmChannel: jest.fn().mockReturnValue(channel),
        };
        dataSource = {
            getRepository: jest.fn(() => jobsRepository),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EnrichmentPublisher,
                { provide: 'DATA_SOURCE', useValue: dataSource },
                { provide: RabbitMqService, useValue: rabbitMq },
            ],
        }).compile();
        service = module.get(EnrichmentPublisher);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('uses the shared topology callback and sends only never-claimed queued jobs', async () => {
        jobsRepository.find.mockResolvedValue([
            queuedJob(1, 101, 0),
            queuedJob(2, 102, 1),
            queuedJob(3, 103, 2),
            { ...queuedJob(4, 104, 0), status: 'processing' },
        ]);

        await callReplay();

        expect(rabbitMq.createConfirmChannel).toHaveBeenCalledWith(
            assertGameEnrichmentTopology,
        );
        expect(jobsRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status: 'queued', attempts: 0 },
                take: 100,
                order: { id: 'ASC' },
            }),
        );
        expect(channel.sendToQueue).toHaveBeenCalledTimes(1);
        expect(channel.sendToQueue).toHaveBeenCalledWith(
            GAME_ENRICHMENT_QUEUE,
            { gameId: 101 },
            { persistent: true, timeout: 5_000 },
        );
        expect(jobsRepository.save).not.toHaveBeenCalled();
        expect(jobsRepository.update).not.toHaveBeenCalled();
    });

    it('does not resolve before the broker confirms the persistent send', async () => {
        const job = queuedJob(10, 410, 0);
        let confirmSend = (): void => {
            throw new Error('send confirmation was not registered');
        };
        channel.sendToQueue.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    confirmSend = resolve;
                }),
        );

        let publishResolved = false;
        const publish = callPublish(job).then(() => {
            publishResolved = true;
        });

        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(channel.sendToQueue).toHaveBeenCalledWith(
            GAME_ENRICHMENT_QUEUE,
            { gameId: 410 },
            { persistent: true, timeout: 5_000 },
        );
        expect(publishResolved).toBe(false);

        confirmSend();
        await publish;
        expect(publishResolved).toBe(true);
    });

    it('does not publish the same game concurrently and permits one replay after a fresh publisher instance', async () => {
        const job = queuedJob(11, 411, 0);

        await Promise.all([callPublish(job), callPublish(job)]);
        expect(channel.sendToQueue).toHaveBeenCalledTimes(1);

        const freshModule: TestingModule = await Test.createTestingModule({
            providers: [
                EnrichmentPublisher,
                { provide: 'DATA_SOURCE', useValue: dataSource },
                { provide: RabbitMqService, useValue: rabbitMq },
            ],
        }).compile();
        const restarted = freshModule.get(EnrichmentPublisher);
        await restarted.publishInitial(job);

        expect(channel.sendToQueue).toHaveBeenCalledTimes(2);
        expect(jobsRepository.save).not.toHaveBeenCalled();
    });

    it('keeps a queued job durable when broker publication fails', async () => {
        channel.sendToQueue.mockRejectedValueOnce(new Error('broker down'));

        await expect(callPublish(queuedJob(12, 412))).resolves.toBeUndefined();

        expect(jobsRepository.save).not.toHaveBeenCalled();
        expect(jobsRepository.update).not.toHaveBeenCalled();
    });

    it('bounds replay to one hundred jobs and clears its channel and timer on shutdown', async () => {
        jest.useFakeTimers();
        jobsRepository.find.mockResolvedValue(
            Array.from({ length: 101 }, (_, index) =>
                queuedJob(index + 1, index + 1),
            ),
        );

        await callReplay();
        expect(jobsRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({ take: 100 }),
        );

        await (
            service as unknown as {
                onApplicationShutdown(): Promise<void>;
            }
        ).onApplicationShutdown();
        expect(channel.close).toHaveBeenCalledTimes(1);
    });
});

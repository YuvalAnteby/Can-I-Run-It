import {
    Inject,
    Injectable,
    Logger,
    OnApplicationShutdown,
    OnModuleInit,
} from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { DataSource, Repository } from 'typeorm';

import { RabbitMqService } from '../messaging/rabbitmq.service';
import { GameEnrichmentJob } from './entities/game-enrichment-job.entity';
import {
    assertGameEnrichmentTopology,
    GAME_ENRICHMENT_QUEUE,
} from './game-lifecycle.contract';

@Injectable()
export class EnrichmentPublisher
    implements OnModuleInit, OnApplicationShutdown
{
    private readonly logger = new Logger(EnrichmentPublisher.name);
    private readonly jobs: Repository<GameEnrichmentJob>;
    private readonly confirmed = new Set<number>();
    private readonly inFlight = new Set<number>();
    private channel: ChannelWrapper | undefined;
    private replayTimer: ReturnType<typeof setInterval> | undefined;

    constructor(
        @Inject('DATA_SOURCE') dataSource: DataSource,
        private readonly rabbitMq: RabbitMqService,
    ) {
        this.jobs = dataSource.getRepository(GameEnrichmentJob);
    }

    onModuleInit(): void {
        this.replayTimer = setInterval(() => {
            void this.replayQueued();
        }, 15_000);
        void this.replayQueued();
    }

    async publishInitial(job: GameEnrichmentJob): Promise<void> {
        const gameId = job.game?.id;
        if (
            !gameId ||
            job.status !== 'queued' ||
            job.attempts !== 0 ||
            this.confirmed.has(gameId) ||
            this.inFlight.has(gameId)
        ) {
            return;
        }

        this.inFlight.add(gameId);
        try {
            const channel = this.getChannel();
            await channel.sendToQueue(
                GAME_ENRICHMENT_QUEUE,
                { gameId },
                { persistent: true, timeout: 5_000 },
            );
            this.confirmed.add(gameId);
        } catch {
            this.logger.warn('Initial enrichment publication unavailable');
        } finally {
            this.inFlight.delete(gameId);
        }
    }

    async replayQueued(): Promise<void> {
        try {
            const jobs = await this.jobs.find({
                where: { status: 'queued', attempts: 0 },
                relations: ['game'],
                take: 100,
                order: { id: 'ASC' },
            });

            for (const job of jobs) {
                await this.publishInitial(job);
            }
        } catch {
            this.logger.warn('Queued enrichment replay unavailable');
        }
    }

    async onApplicationShutdown(): Promise<void> {
        if (this.replayTimer) clearInterval(this.replayTimer);
        this.replayTimer = undefined;

        if (this.channel) {
            await this.channel.close().catch(() => undefined);
            this.channel = undefined;
        }
    }

    private getChannel(): ChannelWrapper {
        if (!this.channel) {
            this.channel = this.rabbitMq.createConfirmChannel(
                assertGameEnrichmentTopology,
            );
        }
        return this.channel;
    }
}

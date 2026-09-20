import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, Message } from 'amqplib';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { GeminiRequirementsService } from '../src/modules/game-enrichment/gemini-requirements.service';
import {
    PcGamingWikiProviderError,
    PcGamingWikiService,
} from '../src/modules/game-enrichment/pcgamingwiki.service';
import {
    assertGameEnrichmentTopology,
    GAME_ENRICHMENT_DEAD_QUEUE,
    GAME_ENRICHMENT_QUEUE,
    GAME_ENRICHMENT_RETRY_QUEUE,
} from '../src/modules/games/game-lifecycle.contract';
import { MessagingModule } from '../src/modules/messaging/messaging.module';
import { RabbitMqService } from '../src/modules/messaging/rabbitmq.service';

type JobRow = {
    status: string;
    attempts: number;
    missing_fields: string[];
    warnings: string[];
    error: string | null;
};

type GameRow = {
    status: string;
    publisher: string | null;
    metadata_provenance: Record<string, Record<string, unknown>>;
};

type RequirementRow = {
    tier: string;
    ram_gb: number;
    cpu_id: number | null;
    gpu_id: number | null;
    notes: string | null;
};

type FixtureOptions = {
    name?: string;
    rawgPayload?: Record<string, unknown>;
    metadataProvenance?: Record<string, Record<string, unknown>>;
};

type WikiResult = {
    kind: 'unmatched' | 'matched';
    warning?: string;
    url?: string;
    metadata?: Record<string, string>;
    minimum?: string;
    recommended?: string;
    warnings?: string[];
};

const sleep = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = async <T>(
    promise: Promise<T>,
    milliseconds: number,
): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error('timed out waiting for enrichment')),
                    milliseconds,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
};

describe('Game enrichment worker (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let rabbitMq: RabbitMqService;
    let wiki: PcGamingWikiService;
    let gemini: GeminiRequirementsService;
    let wikiFindExact: jest.SpyInstance;
    let geminiInterpret: jest.SpyInstance;
    const fixtureIds: number[] = [];
    let fixtureNumber = 0;

    const startApp = async (): Promise<void> => {
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
        rabbitMq = app.get(RabbitMqService);
        wiki = app.get(PcGamingWikiService);
        gemini = app.get(GeminiRequirementsService);
        wikiFindExact = jest.spyOn(wiki, 'findExact');
        geminiInterpret = jest.spyOn(gemini, 'interpret');
    };

    const insertFixture = async (
        options: FixtureOptions = {},
    ): Promise<number> => {
        fixtureNumber += 1;
        const name = options.name ?? `Enrichment fixture ${fixtureNumber}`;
        const rawgId =
            1_500_000_000 + (process.pid % 100_000) * 10 + fixtureNumber;
        const slug = `enrichment-fixture-${process.pid}-${fixtureNumber}`;
        const rawgPayload = options.rawgPayload ?? { id: rawgId, name };
        const [game] = await dataSource.query<{ id: number }[]>(
            `INSERT INTO games
                (slug, name, status, rawg_id, rawg_payload, metadata_provenance)
             VALUES ($1, $2, 'pending_approval', $3, $4::jsonb, $5::jsonb)
             RETURNING id`,
            [
                slug,
                name,
                rawgId,
                JSON.stringify(rawgPayload),
                JSON.stringify(options.metadataProvenance ?? {}),
            ],
        );
        fixtureIds.push(game.id);
        await dataSource.query(
            'INSERT INTO game_enrichment_jobs (game_id) VALUES ($1)',
            [game.id],
        );
        return game.id;
    };

    const queryJob = async (gameId: number): Promise<JobRow> => {
        const [job] = await dataSource.query<JobRow[]>(
            `SELECT status, attempts, missing_fields, warnings, error
             FROM game_enrichment_jobs
             WHERE game_id = $1`,
            [gameId],
        );
        return job;
    };

    const queryGame = async (gameId: number): Promise<GameRow> => {
        const [game] = await dataSource.query<GameRow[]>(
            `SELECT status, publisher, metadata_provenance
             FROM games
             WHERE id = $1`,
            [gameId],
        );
        return game;
    };

    const queryRequirements = async (
        gameId: number,
    ): Promise<RequirementRow[]> =>
        dataSource.query<RequirementRow[]>(
            `SELECT tier, ram_gb, cpu_id, gpu_id, notes
             FROM game_requirements
             WHERE game_id = $1
             ORDER BY tier`,
            [gameId],
        );

    const waitForJob = async (
        gameId: number,
        predicate: (job: JobRow) => boolean,
    ): Promise<JobRow> => {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            const job = await queryJob(gameId);
            if (job && predicate(job)) return job;
            await sleep(50);
        }
        throw new Error(`job ${gameId} did not reach the expected state`);
    };

    const openTopologyChannel = async (): Promise<ChannelWrapper> => {
        const channel = rabbitMq.createConfirmChannel(
            assertGameEnrichmentTopology,
        );
        await withTimeout(channel.waitForConnect(), 10_000);
        return channel;
    };

    const publishJob = async (gameId: number): Promise<ChannelWrapper> => {
        const channel = await openTopologyChannel();
        await channel.sendToQueue(
            GAME_ENRICHMENT_QUEUE,
            { gameId },
            { persistent: true, timeout: 5_000 },
        );
        return channel;
    };

    const getOne = async (
        channel: ChannelWrapper,
        queue: string,
    ): Promise<Message | false> =>
        withTimeout(channel.get(queue, { noAck: false }), 5_000);

    const cleanupFixtures = async (): Promise<void> => {
        if (!dataSource?.isInitialized || fixtureIds.length === 0) return;
        await dataSource.query(
            'DELETE FROM game_enrichment_jobs WHERE game_id = ANY($1::int[])',
            [fixtureIds],
        );
        await dataSource.query('DELETE FROM games WHERE id = ANY($1::int[])', [
            fixtureIds,
        ]);
        fixtureIds.length = 0;
    };

    beforeAll(async () => {
        await startApp();
    });

    beforeEach(() => {
        wikiFindExact.mockReset().mockResolvedValue({
            kind: 'matched',
            url: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
            metadata: {
                publisher: 'Bandai Namco Entertainment',
                developer: 'FromSoftware',
            },
            minimum:
                'RAM: 8 GB\nCPU: Intel Core i5-8400\nGPU: NVIDIA GeForce GTX 1060',
            warnings: [],
        } satisfies WikiResult);
        geminiInterpret.mockReset().mockResolvedValue({});
    });

    afterAll(async () => {
        await cleanupFixtures();
        if (app) await app.close();
        if (dataSource?.isInitialized) await dataSource.destroy();
    });

    it('has a warnings column with an empty default in the fresh schema', async () => {
        const [column] = await dataSource.query<
            { data_type: string; column_default: string }[]
        >(`
            SELECT data_type, column_default
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'game_enrichment_jobs'
              AND column_name = 'warnings'
        `);
        expect(column).toEqual(
            expect.objectContaining({
                data_type: 'ARRAY',
                column_default: "'{}'::text[]",
            }),
        );

        const gameId = await insertFixture();
        const [job] = await dataSource.query<{ warnings: string[] }[]>(
            'SELECT warnings FROM game_enrichment_jobs WHERE game_id = $1',
            [gameId],
        );
        expect(job.warnings).toEqual([]);
    });

    it('upgrades a V1 enrichment table without changing attempts or status', async () => {
        const runner = dataSource.createQueryRunner();
        const schema = `enrichment_warning_upgrade_${process.pid}_${fixtureNumber}`;
        let connected = false;
        try {
            await runner.connect();
            connected = true;
            await runner.query(`CREATE SCHEMA "${schema}"`);
            await runner.query(`SET search_path TO "${schema}"`);
            await runner.query(`
                CREATE TABLE game_enrichment_jobs (
                    id SERIAL PRIMARY KEY,
                    status VARCHAR(20) NOT NULL DEFAULT 'queued',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    missing_fields TEXT[] NOT NULL DEFAULT '{}'::text[],
                    error TEXT,
                    claim_token UUID,
                    claimed_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `);
            await runner.query(
                `INSERT INTO game_enrichment_jobs (status, attempts)
                 VALUES ('processing', 2)`,
            );

            const migrationPath = path.resolve(
                __dirname,
                '../../infra/migrations/002-v2-enrichment-warnings.sql',
            );
            await runner.query(fs.readFileSync(migrationPath, 'utf8'));

            const [column] = (await runner.query(
                `SELECT data_type, column_default
                 FROM information_schema.columns
                 WHERE table_schema = $1
                   AND table_name = 'game_enrichment_jobs'
                   AND column_name = 'warnings'`,
                [schema],
            )) as { data_type: string; column_default: string }[];
            expect(column).toEqual(
                expect.objectContaining({
                    data_type: 'ARRAY',
                    column_default: "'{}'::text[]",
                }),
            );
            const [row] = (await runner.query(
                'SELECT status, attempts, warnings FROM game_enrichment_jobs',
            )) as { status: string; attempts: number; warnings: string[] }[];
            expect(row).toEqual({
                status: 'processing',
                attempts: 2,
                warnings: [],
            });
        } finally {
            if (connected) {
                await runner.query('SET search_path TO public');
                await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
                await runner.release();
            }
        }
    });

    it('enriches a pending game once, persists provenance and requirements, and ACKs after commit', async () => {
        const gameId = await insertFixture({
            name: 'Full enrichment fixture',
        });
        const channel = await publishJob(gameId);
        const job = await waitForJob(
            gameId,
            (row) => row.status === 'completed',
        );
        const game = await queryGame(gameId);
        const requirements = await queryRequirements(gameId);

        expect(job.attempts).toBe(1);
        expect(job.error).toBeNull();
        expect(game.status).toBe('pending_approval');
        expect(game.publisher).toBe('Bandai Namco Entertainment');
        expect(game.metadata_provenance.publisher).toMatchObject({
            source: 'pcgamingwiki',
            sourceUrl: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
        });
        expect(requirements).toEqual([
            expect.objectContaining({ tier: 'minimum', ram_gb: 8 }),
        ]);
        expect(requirements).toHaveLength(1);
        await channel.close();
    });

    it.each([
        [
            'no page',
            { kind: 'unmatched', warning: 'PCGamingWiki page not found' },
        ],
        [
            'ambiguous page',
            { kind: 'unmatched', warning: 'PCGamingWiki title is ambiguous' },
        ],
        [
            'mismatched title',
            { kind: 'unmatched', warning: 'PCGamingWiki title did not match' },
        ],
        [
            'missing Windows template',
            {
                kind: 'matched',
                url: 'https://www.pcgamingwiki.com/wiki/Example',
                metadata: { developer: 'Known developer' },
                warnings: ['PCGamingWiki Windows requirements missing'],
            },
        ],
    ] as Array<[string, WikiResult]>)(
        'partially completes the %s fixture without fabricated requirements',
        async (_caseName, result) => {
            wikiFindExact.mockResolvedValueOnce(result);
            const gameId = await insertFixture({
                name: `Partial ${String(_caseName)}`,
            });
            const channel = await publishJob(gameId);
            const job = await waitForJob(
                gameId,
                (row) => row.status === 'completed',
            );
            const game = await queryGame(gameId);
            const requirements = await queryRequirements(gameId);

            expect(job.warnings).toEqual([
                result.warning ?? result.warnings?.[0],
            ]);
            expect(job.missing_fields).toEqual([...job.missing_fields].sort());
            expect(job.missing_fields).toEqual(
                expect.arrayContaining([
                    'requirements.minimum.ramGb',
                    'requirements.minimum.cpu',
                    'requirements.minimum.gpu',
                ]),
            );
            expect(requirements).toEqual([]);
            expect(game.status).toBe('pending_approval');
            await channel.close();
        },
    );

    it('persists Gemini-assisted requirement provenance and preserves an admin edit', async () => {
        wikiFindExact.mockResolvedValueOnce({
            kind: 'matched',
            url: 'https://www.pcgamingwiki.com/wiki/Example',
            metadata: { publisher: 'Wiki publisher' },
            minimum: 'Minimum RAM: eight gigabytes',
            warnings: [],
        } satisfies WikiResult);
        geminiInterpret.mockResolvedValueOnce({
            'requirements.minimum.ramGb': {
                value: 8,
                source: 'pcgamingwiki',
                sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example',
                extractedBy: 'gemini',
            },
        });
        const gameId = await insertFixture({
            name: 'Admin race fixture',
            metadataProvenance: {
                publisher: {
                    source: 'admin',
                    sourceUrl: null,
                    extractedBy: null,
                },
            },
        });
        await dataSource.query(
            'UPDATE games SET publisher = $1 WHERE id = $2',
            ['Admin publisher', gameId],
        );
        const channel = await publishJob(gameId);
        await waitForJob(gameId, (row) => row.status === 'completed');
        const game = await queryGame(gameId);
        const requirements = await queryRequirements(gameId);

        expect(geminiInterpret).toHaveBeenCalledWith(
            'Minimum RAM: eight gigabytes',
            expect.arrayContaining(['requirements.minimum.ramGb']),
            'pcgamingwiki',
            'https://www.pcgamingwiki.com/wiki/Example',
        );
        expect(game.publisher).toBe('Admin publisher');
        expect(game.metadata_provenance.publisher.source).toBe('admin');
        expect(requirements).toEqual([
            expect.objectContaining({ tier: 'minimum', ram_gb: 8 }),
        ]);
        await channel.close();
    });

    it.each([
        ['403', 'http_403'],
        ['429', 'http_429'],
        ['5xx', 'http_5xx'],
        ['timeout', 'timeout'],
        ['oversized response', 'response_too_large'],
    ])(
        'moves a %s provider failure to the durable retry queue',
        async (_name, code) => {
            const gameId = await insertFixture({
                name: `Retry ${String(_name)}`,
            });
            wikiFindExact.mockRejectedValueOnce(
                new PcGamingWikiProviderError(
                    code as
                        | 'http_403'
                        | 'http_429'
                        | 'http_5xx'
                        | 'timeout'
                        | 'response_too_large',
                    'sanitized provider failure',
                ),
            );
            const channel = await publishJob(gameId);
            const job = await waitForJob(
                gameId,
                (row) => row.status === 'queued' && row.attempts === 1,
            );
            const retryMessage = await getOne(
                channel,
                GAME_ENRICHMENT_RETRY_QUEUE,
            );

            expect(job.error).toBe('sanitized provider failure');
            expect(retryMessage).not.toBe(false);
            if (retryMessage !== false) {
                expect(JSON.parse(retryMessage.content.toString())).toEqual({
                    gameId,
                });
                channel.ack(retryMessage);
            }
            await channel.close();
        },
    );

    it('keeps retry ownership with #64 after the first claim and recovers only stale work', async () => {
        const untouchedGameId = await insertFixture({
            name: 'Producer-owned untouched fixture',
        });
        const claimedGameId = await insertFixture({
            name: 'Worker-owned retry fixture',
        });
        wikiFindExact.mockRejectedValueOnce(
            new PcGamingWikiProviderError('http_429', 'retryable failure'),
        );
        const channel = await publishJob(claimedGameId);
        await waitForJob(
            claimedGameId,
            (row) => row.status === 'queued' && row.attempts === 1,
        );
        const retryMessage = await getOne(channel, GAME_ENRICHMENT_RETRY_QUEUE);
        expect(retryMessage).not.toBe(false);
        if (retryMessage !== false) channel.ack(retryMessage);

        const producerEligible = await dataSource.query<{ game_id: number }[]>(
            `SELECT game_id
             FROM game_enrichment_jobs
             WHERE game_id = ANY($1::int[])
               AND status = 'queued'
               AND attempts = 0
             ORDER BY game_id`,
            [[untouchedGameId, claimedGameId]],
        );
        expect(producerEligible.map(({ game_id }) => game_id)).toEqual([
            untouchedGameId,
        ]);

        await dataSource.query(
            `UPDATE game_enrichment_jobs
             SET updated_at = NOW() - INTERVAL '61 seconds'
             WHERE game_id = $1`,
            [claimedGameId],
        );
        await app.close();
        if (dataSource.isInitialized) await dataSource.destroy();
        await startApp();
        wikiFindExact.mockResolvedValue({
            kind: 'matched',
            url: 'https://www.pcgamingwiki.com/wiki/Example',
            metadata: {},
            minimum: 'RAM: 8 GB\nCPU: Intel Core i5-8400\nGPU: GTX 1060',
            warnings: [],
        } satisfies WikiResult);

        const recovered = await waitForJob(
            claimedGameId,
            (row) => row.status === 'completed',
        );
        expect(recovered.attempts).toBe(2);
        expect((await queryJob(untouchedGameId)).attempts).toBe(0);
        expect(await queryRequirements(claimedGameId)).toHaveLength(1);
        await channel.close().catch(() => undefined);
    });

    it('exhausts three claims and retains exactly one message in the dead queue', async () => {
        const gameId = await insertFixture({ name: 'Exhaustion fixture' });
        wikiFindExact.mockRejectedValue(
            new PcGamingWikiProviderError('http_5xx', 'retryable failure'),
        );
        const channel = await publishJob(gameId);

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const job = await waitForJob(
                gameId,
                (row) => row.attempts === attempt,
            );
            if (attempt < 3) {
                const retryMessage = await getOne(
                    channel,
                    GAME_ENRICHMENT_RETRY_QUEUE,
                );
                expect(retryMessage).not.toBe(false);
                if (retryMessage !== false) {
                    channel.ack(retryMessage);
                    await channel.sendToQueue(
                        GAME_ENRICHMENT_QUEUE,
                        JSON.parse(retryMessage.content.toString()) as {
                            gameId: number;
                        },
                        { persistent: true, timeout: 5_000 },
                    );
                }
            } else {
                expect(job.status).toBe('failed');
            }
        }

        const deadMessage = await getOne(channel, GAME_ENRICHMENT_DEAD_QUEUE);
        expect(deadMessage).not.toBe(false);
        if (deadMessage !== false) channel.ack(deadMessage);
        expect((await queryJob(gameId)).attempts).toBe(3);
        expect(wikiFindExact).toHaveBeenCalledTimes(3);
        await channel.close();
    });

    it('dead-letters malformed payloads and does not create a job', async () => {
        const channel = await openTopologyChannel();
        await channel.sendToQueue(
            GAME_ENRICHMENT_QUEUE,
            { gameId: 0 },
            { persistent: true, timeout: 5_000 },
        );
        const deadMessage = await getOne(channel, GAME_ENRICHMENT_DEAD_QUEUE);

        expect(deadMessage).not.toBe(false);
        if (deadMessage !== false) {
            expect(JSON.parse(deadMessage.content.toString())).toEqual({
                gameId: 0,
            });
            channel.ack(deadMessage);
        }
        await channel.close();
    });

    it('deduplicates exact replay delivery and does not duplicate requirement tiers', async () => {
        const gameId = await insertFixture({ name: 'Replay fixture' });
        const firstChannel = await publishJob(gameId);
        const secondChannel = await publishJob(gameId);
        await waitForJob(gameId, (row) => row.status === 'completed');
        await sleep(250);

        expect(wikiFindExact).toHaveBeenCalledTimes(1);
        expect(await queryRequirements(gameId)).toHaveLength(1);
        const [jobCount] = await dataSource.query<{ count: number }[]>(
            'SELECT COUNT(*)::int AS count FROM game_enrichment_jobs WHERE game_id = $1',
            [gameId],
        );
        expect(jobCount.count).toBe(1);
        await firstChannel.close();
        await secondChannel.close();
    });

    it('recovers an expired processing claim after application restart', async () => {
        const gameId = await insertFixture({ name: 'Recovery fixture' });
        await dataSource.query(
            `UPDATE game_enrichment_jobs
             SET status = 'processing', attempts = 1,
                 claim_token = $1, claimed_at = NOW() - INTERVAL '3 minutes'
             WHERE game_id = $2`,
            [randomUUID(), gameId],
        );
        await app.close();
        if (dataSource.isInitialized) await dataSource.destroy();

        await startApp();
        wikiFindExact.mockResolvedValue({
            kind: 'matched',
            url: 'https://www.pcgamingwiki.com/wiki/Example',
            metadata: {},
            minimum: 'RAM: 8 GB\nCPU: Intel Core i5-8400\nGPU: GTX 1060',
            warnings: [],
        } satisfies WikiResult);
        await waitForJob(gameId, (row) => row.status === 'completed');
        expect((await queryJob(gameId)).attempts).toBe(2);
    });

    it.each(['producer-first', 'worker-first'])(
        'retains and delivers a confirmed message when topology initializes %s',
        async (order) => {
            if (dataSource?.isInitialized) {
                await cleanupFixtures();
                await app.close();
                if (dataSource.isInitialized) await dataSource.destroy();
            }
            const moduleFixture = await Test.createTestingModule({
                imports: [ConfigModule.forRoot(), MessagingModule],
            }).compile();
            const service = moduleFixture.get(RabbitMqService);
            let workerChannel: ChannelWrapper | undefined;
            let receivedMessage: Message | undefined;
            let resolveReceived!: (message: Message) => void;
            const received = new Promise<Message>((resolve) => {
                resolveReceived = resolve;
            });
            const workerSetup = async (
                channel: ConfirmChannel,
            ): Promise<void> => {
                await assertGameEnrichmentTopology(channel);
                await channel.prefetch(1);
                await channel.consume(GAME_ENRICHMENT_QUEUE, (message) => {
                    if (!message || receivedMessage) return;
                    receivedMessage = message;
                    resolveReceived(message);
                });
            };
            const producerSetup = async (
                channel: ConfirmChannel,
            ): Promise<void> => {
                await assertGameEnrichmentTopology(channel);
            };
            let producer: ChannelWrapper;
            if (order === 'worker-first') {
                workerChannel = service.createConfirmChannel(workerSetup);
                await withTimeout(workerChannel.waitForConnect(), 10_000);
                producer = service.createConfirmChannel(producerSetup);
                await withTimeout(producer.waitForConnect(), 10_000);
            } else {
                producer = service.createConfirmChannel(producerSetup);
                await withTimeout(producer.waitForConnect(), 10_000);
            }
            const gameId = 1_900_000_000 + (process.pid % 100_000);
            await producer.sendToQueue(
                GAME_ENRICHMENT_QUEUE,
                { gameId },
                { persistent: true, timeout: 5_000 },
            );
            if (order === 'producer-first') {
                workerChannel = service.createConfirmChannel(workerSetup);
                await withTimeout(workerChannel.waitForConnect(), 10_000);
            }

            const message = await withTimeout(received, 10_000);
            expect(JSON.parse(message.content.toString())).toEqual({ gameId });
            expect(receivedMessage).toBe(message);
            workerChannel?.ack(message);
            await producer.purgeQueue(GAME_ENRICHMENT_QUEUE);
            await producer.purgeQueue(GAME_ENRICHMENT_RETRY_QUEUE);
            await producer.purgeQueue(GAME_ENRICHMENT_DEAD_QUEUE);
            await workerChannel?.close();
            await producer.close();
            await moduleFixture.close();
        },
    );
});

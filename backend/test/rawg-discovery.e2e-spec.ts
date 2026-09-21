import type { Server } from 'node:net';

import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { CheckResponseDto } from '../src/modules/check/dto/check-response.dto';
import { EnrichmentPublisher } from '../src/modules/games/enrichment-publisher.service';
import {
    assertGameEnrichmentTopology,
    GAME_ENRICHMENT_QUEUE,
} from '../src/modules/games/game-lifecycle.contract';
import { RawgService } from '../src/modules/games/rawg.service';
import { GeminiService } from '../src/modules/gemini/gemini.service';
import { RabbitMqService } from '../src/modules/messaging/rabbitmq.service';

type RawgDetail = {
    id: number;
    name: string;
    slug: string;
    background_image: string | null;
    released: string | null;
    description_raw: string | null;
    developers: unknown[];
    publishers: unknown[];
    genres: unknown[];
    tags: unknown[];
    platforms: unknown[];
};

type DiscoveryBody = {
    rawgAvailable: boolean;
    data: Array<Record<string, unknown>>;
};

type SelectionBody = {
    id: number;
    slug: string;
    status: string;
};

type GameBody = {
    id: number;
    slug: string;
    status: string;
    tags: string[];
    requirements: unknown[];
    attributions?: Array<Record<string, string>>;
};

type ListBody = {
    meta: { total: number };
};

const bodyOf = <T>(response: { body: unknown }): T => response.body as T;

const rawgDetail = (id: number, name: string, slug: string): RawgDetail => ({
    id,
    name,
    slug,
    background_image: null,
    released: null,
    description_raw: null,
    developers: [],
    publishers: [],
    genres: [],
    tags: [],
    platforms: [],
});

const hardwareCheck = {
    hardware: { cpuId: 4, gpuId: 20, ramGb: 16, isSsd: true },
    settings: {
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        tier: 'minimum',
        preset: 'high',
        targetFps: 60,
        upscaler: 'off',
    },
};

describe('RAWG discovery and pending game flow (isolated e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let rawg: { search: jest.Mock; getById: jest.Mock };
    let localFixtureId: number;
    const selectedRawgIds: number[] = [];
    const prefix = `ciri-issue-66-${Date.now()}`;
    let selectionRequestIp = 1;

    const api = () => request(app.getHttpServer() as Server);

    const select = async (rawgId: number) =>
        api()
            .post(`/api/v2/games/rawg/${rawgId}/select`)
            .set('X-Forwarded-For', `198.51.100.${selectionRequestIp++}`)
            .expect((response) => {
                expect([200, 201]).toContain(response.status);
            });

    const drainMainQueue = async (): Promise<Array<{ gameId: number }>> => {
        const rabbitMq = app.get(RabbitMqService);
        const channel = rabbitMq.createConfirmChannel(
            assertGameEnrichmentTopology,
        );
        await channel.waitForConnect();
        const messages: Array<{ gameId: number }> = [];
        for (;;) {
            const message = await channel.get(GAME_ENRICHMENT_QUEUE, {
                noAck: false,
            });
            if (message === false) break;
            messages.push(
                JSON.parse(message.content.toString()) as { gameId: number },
            );
            channel.ack(message);
        }
        await channel.close();
        return messages;
    };

    beforeAll(async () => {
        rawg = {
            search: jest.fn(),
            getById: jest.fn(),
        };

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(RawgService)
            .useValue(rawg)
            .compile();

        app = moduleFixture.createNestApplication();
        const expressApp = app.getHttpAdapter().getInstance() as {
            set(setting: string, value: boolean): void;
        };
        expressApp.set('trust proxy', true);
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

        const [fixture] = await dataSource.query<{ id: number }[]>(
            `INSERT INTO games (slug, name, status, cover_image_url)
             VALUES ($1, $2, 'published', NULL)
             RETURNING id`,
            [`${prefix}-local`, 'Issue 66 Local Fixture'],
        );
        localFixtureId = fixture.id;
    });

    afterAll(async () => {
        if (dataSource?.isInitialized) {
            await dataSource.query(
                `DELETE FROM performance_records
                 WHERE game_id IN (
                   SELECT id FROM games
                   WHERE slug LIKE $1 OR rawg_id = ANY($2::int[])
                 )`,
                [`${prefix}%`, selectedRawgIds],
            );
            await dataSource.query(
                `DELETE FROM game_enrichment_jobs
                 WHERE game_id IN (
                   SELECT id FROM games
                   WHERE slug LIKE $1 OR rawg_id = ANY($2::int[])
                 )`,
                [`${prefix}%`, selectedRawgIds],
            );
            await dataSource.query(
                `DELETE FROM games
                 WHERE slug LIKE $1 OR rawg_id = ANY($2::int[])`,
                [`${prefix}%`, selectedRawgIds],
            );
        }
        await app?.close();
        if (dataSource?.isInitialized) await dataSource.destroy();
    });

    beforeEach(() => {
        rawg.search.mockReset();
        rawg.getById.mockReset();
    });

    it('returns local results when RAWG is unavailable and keeps discovery read-only', async () => {
        rawg.search.mockResolvedValue({ available: false, results: [] });
        const [{ gamesBefore, jobsBefore }] = await dataSource.query<
            { gamesBefore: number; jobsBefore: number }[]
        >(
            `SELECT
                (SELECT COUNT(*)::int FROM games) AS "gamesBefore",
                (SELECT COUNT(*)::int FROM game_enrichment_jobs) AS "jobsBefore"`,
        );

        const response = await api()
            .get('/api/v2/games/discover')
            .query({ q: '  Issue 66 Local  ' })
            .expect(200);

        const body = bodyOf<DiscoveryBody>(response);
        expect(body).toMatchObject({ rawgAvailable: false });
        expect(body.data).toEqual([
            expect.objectContaining({
                source: 'local',
                id: localFixtureId,
                slug: `${prefix}-local`,
            }),
        ]);

        const [{ gamesAfter, jobsAfter }] = await dataSource.query<
            { gamesAfter: number; jobsAfter: number }[]
        >(
            `SELECT
                (SELECT COUNT(*)::int FROM games) AS "gamesAfter",
                (SELECT COUNT(*)::int FROM game_enrichment_jobs) AS "jobsAfter"`,
        );
        expect({ gamesAfter, jobsAfter }).toEqual({
            gamesAfter: gamesBefore,
            jobsAfter: jobsBefore,
        });
    });

    it('returns mixed source-tagged results with an active RAWG link and validates query limits', async () => {
        rawg.search.mockResolvedValue({
            available: true,
            results: [
                {
                    rawgId: 910001,
                    name: 'Issue 66 RAWG Game',
                    coverImageUrl: null,
                    rawgUrl: 'https://rawg.io/games/issue-66-rawg-game',
                },
            ],
        });

        const response = await api()
            .get('/api/v2/games/discover')
            .query({ q: 'Issue 66' })
            .expect(200);

        const body = bodyOf<DiscoveryBody>(response);
        expect(body.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ source: 'local' }),
                expect.objectContaining({
                    source: 'rawg',
                    rawgId: 910001,
                    rawgUrl: 'https://rawg.io/games/issue-66-rawg-game',
                }),
            ]),
        );
        expect(
            body.data.every((row: Record<string, unknown>) => row.source),
        ).toBe(true);
        await api().get('/api/v2/games/discover').query({ q: '' }).expect(400);
        await api()
            .get('/api/v2/games/discover')
            .query({ q: 'x'.repeat(101) })
            .expect(400);
    });

    it('selects one RAWG identity idempotently under concurrency and persists one initial queued job', async () => {
        const rawgId = 910002;
        selectedRawgIds.push(rawgId);
        rawg.getById.mockResolvedValue(
            rawgDetail(rawgId, 'Issue 66 Selected Game', 'issue-66-selected'),
        );

        const responses = await Promise.all(
            Array.from({ length: 3 }, () => select(rawgId)),
        );
        const ids = responses.map(
            (response) => bodyOf<SelectionBody>(response).id,
        );
        expect(new Set(ids).size).toBe(1);
        const selectedBody = bodyOf<SelectionBody>(responses[0]);
        expect(selectedBody.id).toBe(ids[0]);
        expect(typeof selectedBody.slug).toBe('string');
        expect(selectedBody.status).toBe('pending_approval');

        const [counts] = await dataSource.query<
            { games: number; jobs: number; attempts: number; status: string }[]
        >(
            `SELECT
                (SELECT COUNT(*)::int FROM games WHERE rawg_id = $1) AS games,
                (SELECT COUNT(*)::int FROM game_enrichment_jobs WHERE game_id = $2) AS jobs,
                (SELECT attempts FROM game_enrichment_jobs WHERE game_id = $2) AS attempts,
                (SELECT status FROM games WHERE id = $2) AS status`,
            [rawgId, ids[0]],
        );
        expect(counts).toEqual({
            games: 1,
            jobs: 1,
            attempts: 0,
            status: 'pending_approval',
        });

        const [stored] = await dataSource.query<Record<string, unknown>[]>(
            'SELECT rawg_payload, metadata_provenance FROM games WHERE id = $1',
            [ids[0]],
        );
        expect(stored.rawg_payload).toMatchObject({
            id: rawgId,
            name: 'Issue 66 Selected Game',
        });
        expect(stored).not.toHaveProperty('private_provider_field');
        expect(await drainMainQueue()).toEqual(
            expect.arrayContaining([{ gameId: ids[0] }]),
        );
    });

    it('does not merge a same-title different RAWG id, and rejected identities remain reserved', async () => {
        const firstId = 910003;
        const secondId = 910004;
        rawg.getById.mockImplementation((id: number) =>
            rawgDetail(id, 'Same Title', 'same-title'),
        );

        const first = await select(firstId);
        const second = await select(secondId);
        const selectedIds = [
            bodyOf<SelectionBody>(first).id,
            bodyOf<SelectionBody>(second).id,
        ];
        expect(new Set(selectedIds).size).toBe(2);
        selectedRawgIds.push(firstId, secondId);

        await dataSource.query(
            `UPDATE games SET status = 'rejected', rejection_reason = 'moderation'
             WHERE id = $1`,
            [selectedIds[1]],
        );
        await api().post(`/api/v2/games/rawg/${secondId}/select`).expect(409);
        const [{ status }] = await dataSource.query<{ status: string }[]>(
            'SELECT status FROM games WHERE id = $1',
            [selectedIds[1]],
        );
        expect(status).toBe('rejected');
    });

    it('returns the selected game while broker publication is unavailable and leaves the job queued', async () => {
        const rawgId = 910005;
        const publisher = app.get(EnrichmentPublisher);
        const send = jest
            .spyOn(publisher, 'publishInitial')
            .mockRejectedValueOnce(new Error('broker unavailable'));
        rawg.getById.mockResolvedValue(
            rawgDetail(rawgId, 'Issue 66 Broker Down', 'issue-66-broker-down'),
        );

        await select(rawgId);
        selectedRawgIds.push(rawgId);
        const [job] = await dataSource.query<
            { status: string; attempts: number }[]
        >(
            `SELECT j.status, j.attempts
             FROM game_enrichment_jobs j
             JOIN games g ON g.id = j.game_id
             WHERE g.rawg_id = $1`,
            [rawgId],
        );
        expect(job).toEqual({ status: 'queued', attempts: 0 });
        send.mockRestore();
    });

    it('keeps persistent messages across shared-topology channel initialization orders', async () => {
        await drainMainQueue();
        const rabbitMq = app.get(RabbitMqService);
        const producerFirst = rabbitMq.createConfirmChannel(
            assertGameEnrichmentTopology,
        );
        await producerFirst.waitForConnect();
        await producerFirst.sendToQueue(
            GAME_ENRICHMENT_QUEUE,
            { gameId: localFixtureId },
            { persistent: true, timeout: 5_000 },
        );
        const queueState = await producerFirst.checkQueue(
            GAME_ENRICHMENT_QUEUE,
        );
        expect(queueState.messageCount).toBeGreaterThan(0);

        const consumerAfterProducer = rabbitMq.createConfirmChannel(
            assertGameEnrichmentTopology,
        );
        await consumerAfterProducer.waitForConnect();
        const firstMessage = await consumerAfterProducer.get(
            GAME_ENRICHMENT_QUEUE,
            {
                noAck: false,
            },
        );
        expect(firstMessage).not.toBe(false);
        if (firstMessage !== false) {
            expect(JSON.parse(firstMessage.content.toString())).toEqual({
                gameId: localFixtureId,
            });
            consumerAfterProducer.ack(firstMessage);
        }
        await producerFirst.close();
        await consumerAfterProducer.close();

        await drainMainQueue();
        const consumerFirst = rabbitMq.createConfirmChannel(
            assertGameEnrichmentTopology,
        );
        const producerAfterConsumer = rabbitMq.createConfirmChannel(
            assertGameEnrichmentTopology,
        );
        await Promise.all([
            consumerFirst.waitForConnect(),
            producerAfterConsumer.waitForConnect(),
        ]);
        await producerAfterConsumer.sendToQueue(
            GAME_ENRICHMENT_QUEUE,
            { gameId: localFixtureId },
            { persistent: true, timeout: 5_000 },
        );
        const secondMessage = await consumerFirst.get(GAME_ENRICHMENT_QUEUE, {
            noAck: false,
        });
        expect(secondMessage).not.toBe(false);
        if (secondMessage !== false) consumerFirst.ack(secondMessage);
        await consumerFirst.close();
        await producerAfterConsumer.close();
    });

    it('publishes only queued attempts=0 and leaves claimed retry-owned jobs untouched', async () => {
        const publisher = app.get(EnrichmentPublisher);
        const jobs = await dataSource.query<{ game_id: number }[]>(
            `INSERT INTO games (slug, name, status, rawg_id)
             VALUES
               ($1, 'Issue 66 job zero', 'pending_approval', $2),
               ($3, 'Issue 66 job one', 'pending_approval', $4),
               ($5, 'Issue 66 job two', 'pending_approval', $6)
             RETURNING id AS game_id`,
            [
                `${prefix}-job-zero`,
                910006,
                `${prefix}-job-one`,
                910007,
                `${prefix}-job-two`,
                910008,
            ],
        );
        selectedRawgIds.push(910006, 910007, 910008);
        await dataSource.query(
            `INSERT INTO game_enrichment_jobs (game_id, status, attempts)
             VALUES ($1, 'queued', 0), ($2, 'queued', 1), ($3, 'queued', 2)`,
            [jobs[0].game_id, jobs[1].game_id, jobs[2].game_id],
        );

        await publisher.replayQueued();
        const delivered = await drainMainQueue();
        expect(delivered).toContainEqual({ gameId: jobs[0].game_id });
        expect(delivered).not.toContainEqual({ gameId: jobs[1].game_id });
        expect(delivered).not.toContainEqual({ gameId: jobs[2].game_id });

        const stored = await dataSource.query<
            { attempts: number; status: string }[]
        >(
            `SELECT attempts, status FROM game_enrichment_jobs
             WHERE game_id = ANY($1::int[]) ORDER BY game_id`,
            [jobs.map(({ game_id }) => game_id)],
        );
        expect(stored).toEqual([
            { attempts: 0, status: 'queued' },
            { attempts: 1, status: 'queued' },
            { attempts: 2, status: 'queued' },
        ]);
    });

    it('keeps pending data hidden, serves the ID page, links attribution, and redirects after approval', async () => {
        const rawgId = 910009;
        rawg.getById.mockResolvedValue(
            rawgDetail(rawgId, 'Issue 66 Visibility', 'issue-66-visibility'),
        );
        const selected = await select(rawgId);
        const selectedBody = bodyOf<SelectionBody>(selected);
        const gameId = selectedBody.id;
        selectedRawgIds.push(rawgId);
        await drainMainQueue();

        const pending = await api()
            .get(`/api/v2/games/pending/${gameId}`)
            .expect(200);
        const pendingBody = bodyOf<GameBody>(pending);
        expect(pendingBody).toMatchObject({
            id: gameId,
            status: 'pending_approval',
            tags: [],
            requirements: [],
        });
        expect(pendingBody.attributions).toEqual([
            {
                source: 'rawg',
                label: 'RAWG',
                url: 'https://rawg.io/games/issue-66-visibility',
            },
        ]);
        expect(pendingBody).not.toHaveProperty('rawgPayload');
        expect(pendingBody).not.toHaveProperty('metadataProvenance');
        expect(pendingBody).not.toHaveProperty('rejectionReason');

        await api().get(`/api/v2/games/${selectedBody.slug}`).expect(404);
        await api()
            .get('/api/v2/games')
            .query({ search: 'Issue 66 Visibility' })
            .expect((response) => {
                expect(bodyOf<ListBody>(response).meta.total).toBe(0);
            });
        await api()
            .post('/api/v1/check')
            .send({ ...hardwareCheck, gameSlug: selectedBody.slug })
            .expect(404);

        const gemini = app.get(GeminiService);
        const estimate = jest.spyOn(gemini, 'estimate').mockResolvedValue({
            fps: { low: 80, med: 70, high: 60, ultra: 45 },
            note: null,
        });
        const pendingCheck = await api()
            .post(`/api/v2/check/pending/${gameId}`)
            .send(hardwareCheck)
            .expect(200);
        expect(bodyOf<Partial<CheckResponseDto>>(pendingCheck)).toMatchObject({
            source: 'ai',
            provider: 'gemini',
        });
        expect(estimate).toHaveBeenCalledTimes(1);
        const [cached] = await dataSource.query<
            {
                game_id: number;
                source: string;
                fps_1_percent_low: number | null;
            }[]
        >(
            `SELECT game_id, source, fps_1_percent_low
             FROM performance_records
             WHERE game_id = $1
             ORDER BY created_at DESC LIMIT 1`,
            [gameId],
        );
        expect(cached).toEqual({
            game_id: gameId,
            source: 'gemini',
            fps_1_percent_low: null,
        });

        await dataSource.query(
            `UPDATE games
             SET status = 'published', slug = $2,
                 description = 'PCGamingWiki displayed text',
                 metadata_provenance = $3::jsonb
             WHERE id = $1`,
            [
                gameId,
                `${prefix}-visibility-published`,
                JSON.stringify({
                    description: {
                        source: 'pcgamingwiki',
                        sourceUrl:
                            'https://www.pcgamingwiki.com/wiki/Issue_66_Visibility?tab=history#x',
                        extractedBy: 'gemini',
                    },
                }),
            ],
        );

        const approvedPending = await api()
            .get(`/api/v2/games/pending/${gameId}`)
            .expect(200);
        const approvedBody = bodyOf<GameBody>(approvedPending);
        expect(approvedBody).toMatchObject({
            status: 'published',
            slug: `${prefix}-visibility-published`,
        });
        expect(approvedBody.attributions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ source: 'rawg' }),
                {
                    source: 'pcgamingwiki',
                    label: 'PCGamingWiki',
                    url: 'https://www.pcgamingwiki.com/wiki/Issue_66_Visibility',
                },
            ]),
        );
        await api()
            .get(`/api/v2/games/${prefix}-visibility-published`)
            .expect(200);
        await api()
            .post(`/api/v1/check`)
            .send({
                ...hardwareCheck,
                gameSlug: `${prefix}-visibility-published`,
            })
            .expect(200);
        const seeded = await api()
            .get('/api/v2/games/cyberpunk-2077')
            .expect(200);
        expect(bodyOf<Record<string, unknown>>(seeded)).not.toHaveProperty(
            'attributions',
        );
        estimate.mockRestore();
    });
});

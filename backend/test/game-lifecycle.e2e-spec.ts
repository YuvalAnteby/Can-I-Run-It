import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'net';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';

interface GamesListResponse {
    data: Array<{ slug: string }>;
    meta: { total: number };
}

describe('Game lifecycle (e2e)', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    const fixtureIds: number[] = [];
    const rawgId = 1_400_000_000 + (process.pid % 100_000);

    const insertGame = async ({
        slug = `lifecycle-fixture-${fixtureIds.length + 1}`,
        name = 'Lifecycle fixture',
        status = 'pending_approval',
        rawgId: gameRawgId = null,
        rejectionReason = null,
    }: {
        slug?: string;
        name?: string;
        status?: string;
        rawgId?: number | null;
        rejectionReason?: string | null;
    } = {}): Promise<number> => {
        const [row] = await dataSource.query<{ id: number }[]>(
            `INSERT INTO games (slug, name, status, rawg_id, rejection_reason)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [slug, name, status, gameRawgId, rejectionReason],
        );
        fixtureIds.push(row.id);
        return row.id;
    };

    const queryErrorCode = async (
        query: string,
        parameters: unknown[],
    ): Promise<string | undefined> => {
        const error = await dataSource.query(query, parameters).then(
            () => null,
            (caughtError: { code?: string }) => caughtError,
        );
        return error?.code;
    };

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

        await insertGame({
            slug: 'lifecycle-pending-game',
            name: 'Lifecycle pending game',
        });
        await insertGame({
            slug: 'lifecycle-rejected-game',
            name: 'Lifecycle rejected game',
            status: 'rejected',
            rejectionReason: 'Not enough PC requirements evidence',
        });
    });

    afterAll(async () => {
        if (!dataSource) return;
        if (fixtureIds.length > 0) {
            await dataSource.query(
                'DELETE FROM game_enrichment_jobs WHERE game_id = ANY($1::int[])',
                [fixtureIds],
            );
            await dataSource.query(
                'DELETE FROM games WHERE id = ANY($1::int[])',
                [fixtureIds],
            );
        }
        await app.close();
        await dataSource.destroy();
    });

    it('keeps seeded games published and retains existing performance data and foreign keys', async () => {
        const [statusCounts] = await dataSource.query<
            {
                published: number;
                pending: number;
                rejected: number;
            }[]
        >(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'published')::int AS published,
                COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
            FROM games
        `);
        expect(statusCounts.published).toBe(10);
        expect(statusCounts.pending).toBe(1);
        expect(statusCounts.rejected).toBe(1);

        const [performanceCounts] = await dataSource.query<
            {
                total: number;
                measured: number;
                ai: number;
            }[]
        >(`
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE source = 'measured')::int AS measured,
                COUNT(*) FILTER (WHERE source = 'gemini')::int AS ai
            FROM performance_records
        `);
        expect(performanceCounts.total).toBeGreaterThan(0);
        expect(performanceCounts.measured).toBe(performanceCounts.total);
        expect(performanceCounts.ai).toBe(0);

        const foreignKeys = await dataSource.query<{ conname: string }[]>(`
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'performance_records'::regclass
              AND contype = 'f'
              AND pg_get_constraintdef(oid) LIKE '%(game_id)%'
        `);
        expect(foreignKeys.map(({ conname }) => conname)).toContain(
            'performance_records_game_id_fkey',
        );
    });

    it('defaults new games to pending and permits multiple NULL RAWG identities', async () => {
        const [row] = await dataSource.query<{ id: number; status: string }[]>(
            `INSERT INTO games (slug, name) VALUES ($1, $2) RETURNING id, status`,
            ['lifecycle-default-game', 'Lifecycle default game'],
        );
        fixtureIds.push(row.id);
        expect(row.status).toBe('pending_approval');

        const firstNullId = await insertGame({
            slug: 'lifecycle-null-rawg-one',
        });
        const secondNullId = await insertGame({
            slug: 'lifecycle-null-rawg-two',
        });
        expect(secondNullId).not.toBe(firstNullId);
    });

    it('rejects duplicate RAWG identities even when the existing row is rejected', async () => {
        await insertGame({
            slug: 'lifecycle-rejected-rawg',
            name: 'Rejected RAWG fixture',
            status: 'rejected',
            rawgId,
            rejectionReason: 'Rejected for testing',
        });

        await expect(
            queryErrorCode(
                `INSERT INTO games (slug, name, status, rawg_id, rejection_reason)
                 VALUES ($1, $2, 'rejected', $3, 'Duplicate identity')`,
                ['lifecycle-duplicate-rawg', 'Duplicate RAWG fixture', rawgId],
            ),
        ).resolves.toBe('23505');
    });

    it('rejects invalid statuses and rejection-reason combinations', async () => {
        await expect(
            queryErrorCode(
                `INSERT INTO games (slug, name, status) VALUES ($1, $2, 'draft')`,
                ['lifecycle-invalid-status', 'Invalid status fixture'],
            ),
        ).resolves.toBe('23514');

        await expect(
            queryErrorCode(
                `INSERT INTO games (slug, name, status, rejection_reason)
                 VALUES ($1, $2, 'rejected', NULL)`,
                ['lifecycle-missing-reason', 'Missing reason fixture'],
            ),
        ).resolves.toBe('23514');

        await expect(
            queryErrorCode(
                `INSERT INTO games (slug, name, status, rejection_reason)
                 VALUES ($1, $2, 'published', 'should be null')`,
                ['lifecycle-published-reason', 'Published reason fixture'],
            ),
        ).resolves.toBe('23514');
    });

    it('allows one current enrichment job per game', async () => {
        const gameId = await insertGame({ slug: 'lifecycle-job-game' });
        await dataSource.query(
            'INSERT INTO game_enrichment_jobs (game_id) VALUES ($1)',
            [gameId],
        );

        await expect(
            queryErrorCode(
                'INSERT INTO game_enrichment_jobs (game_id) VALUES ($1)',
                [gameId],
            ),
        ).resolves.toBe('23505');
    });

    it('does not expose pending or rejected games through public listing, search, detail, or check', async () => {
        const list = await request(app.getHttpServer() as Server)
            .get('/api/v2/games')
            .query({ limit: 100 })
            .expect(200);
        const listBody = list.body as GamesListResponse;
        expect(listBody.meta.total).toBe(10);
        expect(listBody.data).toEqual(
            expect.not.arrayContaining([
                expect.objectContaining({ slug: 'lifecycle-pending-game' }),
                expect.objectContaining({ slug: 'lifecycle-rejected-game' }),
            ]),
        );

        const search = await request(app.getHttpServer() as Server)
            .get('/api/v2/games')
            .query({ search: 'Lifecycle' })
            .expect(200);
        const searchBody = search.body as GamesListResponse;
        expect(searchBody.meta.total).toBe(0);
        expect(searchBody.data).toEqual([]);

        await request(app.getHttpServer() as Server)
            .get('/api/v2/games/lifecycle-pending-game')
            .expect(404);
        await request(app.getHttpServer() as Server)
            .get('/api/v2/games/lifecycle-rejected-game')
            .expect(404);

        const [{ id: cpuId }] = await dataSource.query<{ id: number }[]>(
            `SELECT id FROM cpus WHERE slug = 'intel-core-i7-13700k'`,
        );
        const [{ id: gpuId }] = await dataSource.query<{ id: number }[]>(
            `SELECT id FROM gpus WHERE slug = 'nvidia-rtx-3080'`,
        );
        const checkRequest = {
            hardware: { cpuId, gpuId, ramGb: 32, isSsd: true },
            settings: {
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                tier: 'minimum',
                preset: 'high',
                targetFps: 60,
            },
        };

        await request(app.getHttpServer() as Server)
            .post('/api/v1/check')
            .send({ ...checkRequest, gameSlug: 'lifecycle-pending-game' })
            .expect(404);
        await request(app.getHttpServer() as Server)
            .post('/api/v1/check')
            .send({ ...checkRequest, gameSlug: 'lifecycle-rejected-game' })
            .expect(404);
    });
});

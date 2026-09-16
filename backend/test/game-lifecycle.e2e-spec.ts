import {
    INestApplication,
    ValidationPipe,
    VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { Server } from 'net';
import * as path from 'path';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Game } from '../src/modules/games/entities/game.entity';
import { GameEnrichmentJob } from '../src/modules/games/entities/game-enrichment-job.entity';

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

    it('saves and reloads missing fields through the SQL column', async () => {
        const gameId = await insertGame({
            slug: 'lifecycle-missing-fields-game',
        });
        const game = await dataSource
            .getRepository(Game)
            .findOneByOrFail({ id: gameId });
        const jobs = dataSource.getRepository(GameEnrichmentJob);
        const missingFields = ['name', 'requirements.minimum.ramGb'];

        const savedJob = await jobs.save(jobs.create({ game, missingFields }));
        const reloadedJob = await jobs.findOne({
            where: { id: savedJob.id },
            relations: ['game'],
        });

        expect(reloadedJob?.missingFields).toEqual(missingFields);
        expect(reloadedJob?.game.id).toBe(gameId);
    });

    it('keeps the enrichment job game relation nonnullable in TypeORM and SQL', async () => {
        const relation = dataSource
            .getMetadata(GameEnrichmentJob)
            .relations.find(({ propertyName }) => propertyName === 'game');
        expect(relation?.isNullable).toBe(false);

        const [column] = await dataSource.query<{ is_nullable: string }[]>(`
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'game_enrichment_jobs'
              AND column_name = 'game_id'
        `);
        expect(column.is_nullable).toBe('NO');
    });

    it('rejects blank, tab, and newline-only rejection reasons', async () => {
        const rejectionCheck = dataSource
            .getMetadata(Game)
            .checks.find(({ name }) => name === 'games_rejection_reason_check');
        expect(String(rejectionCheck?.expression)).toContain(
            "regexp_replace(rejection_reason, '[[:space:]]', '', 'g')",
        );

        const reasons = ['', '   ', '\t', '\n', '\r\n \t'];

        for (const [index, reason] of reasons.entries()) {
            await expect(
                queryErrorCode(
                    `INSERT INTO games (slug, name, status, rejection_reason)
                     VALUES ($1, $2, 'rejected', $3)`,
                    [
                        `lifecycle-whitespace-reason-${index}`,
                        'Whitespace reason fixture',
                        reason,
                    ],
                ),
            ).resolves.toBe('23514');
        }
    });

    it('upgrades a V1 schema while preserving game IDs, performance rows, and constraints', async () => {
        const runner = dataSource.createQueryRunner();
        const schema = `lifecycle_upgrade_${process.pid}`;
        let connected = false;
        let migrationStarted = false;
        let migrationCommitted = false;

        try {
            await runner.connect();
            connected = true;
            await runner.query(`CREATE SCHEMA "${schema}"`);
            await runner.query(`SET search_path TO "${schema}"`);
            await runner.query(`
                CREATE TABLE games (
                    id SERIAL PRIMARY KEY,
                    slug VARCHAR(100) UNIQUE NOT NULL,
                    name VARCHAR(200) NOT NULL
                )
            `);
            await runner.query(`
                CREATE TABLE performance_records (
                    id SERIAL PRIMARY KEY,
                    game_id INTEGER NOT NULL REFERENCES games(id),
                    fps_avg INTEGER NOT NULL
                )
            `);
            const insertedGames = (
                (await runner.query(
                    `INSERT INTO games (slug, name) VALUES
                    ('upgrade-game-one', 'Upgrade Game One'),
                    ('upgrade-game-two', 'Upgrade Game Two')
                 RETURNING id`,
                )) as { id: number }[]
            ).sort(({ id: firstId }, { id: secondId }) => firstId - secondId);
            await runner.query(
                'INSERT INTO performance_records (game_id, fps_avg) VALUES ($1, $2)',
                [insertedGames[0].id, 60],
            );

            const migrationPath = path.resolve(
                __dirname,
                '../../infra/migrations/001-v2-game-lifecycle.sql',
            );
            migrationStarted = true;
            await runner.query(fs.readFileSync(migrationPath, 'utf8'));
            migrationCommitted = true;

            const upgradedGames = (await runner.query(
                'SELECT id, status FROM games ORDER BY id',
            )) as { id: number; status: string }[];
            expect(upgradedGames).toEqual(
                insertedGames.map(({ id }) => ({ id, status: 'published' })),
            );

            const [performanceCount] = (await runner.query(
                'SELECT COUNT(*)::int AS count FROM performance_records',
            )) as { count: number }[];
            expect(performanceCount.count).toBe(1);

            const foreignKeys = (await runner.query(`
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'performance_records'::regclass
                  AND contype = 'f'
                  AND conname = 'performance_records_game_id_fkey'
            `)) as { conname: string }[];
            expect(foreignKeys).toHaveLength(1);

            const [gameIdColumn] = (await runner.query(`
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'game_enrichment_jobs'
                  AND column_name = 'game_id'
            `)) as { is_nullable: string }[];
            expect(gameIdColumn.is_nullable).toBe('NO');

            for (const [index, reason] of [
                '',
                '   ',
                '\t',
                '\n',
                '\r\n \t',
            ].entries()) {
                await expect(
                    runner.query(
                        `INSERT INTO games (slug, name, status, rejection_reason)
                         VALUES ($1, $2, 'rejected', $3)`,
                        [
                            `upgrade-whitespace-reason-${index}`,
                            'Upgrade whitespace reason fixture',
                            reason,
                        ],
                    ),
                ).rejects.toMatchObject({ code: '23514' });
            }
        } finally {
            if (connected) {
                if (migrationStarted && !migrationCommitted) {
                    await runner.query('ROLLBACK').catch(() => undefined);
                }
                await runner.query('SET search_path TO public');
                await runner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
                await runner.release();
            }
        }
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

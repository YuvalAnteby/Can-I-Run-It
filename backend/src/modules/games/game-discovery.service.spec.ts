import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { EnrichmentPublisher } from './enrichment-publisher.service';
import { Game } from './entities/game.entity';
import { GameEnrichmentJob } from './entities/game-enrichment-job.entity';
import { GameDiscoveryService } from './game-discovery.service';
import { RawgService } from './rawg.service';

const localGame = (overrides: Partial<Game> = {}): Game =>
    ({
        id: 7,
        slug: 'cyberpunk-2077',
        name: 'Cyberpunk 2077',
        status: 'published',
        rawgId: null,
        coverImageUrl: 'https://img.example/cyberpunk.jpg',
        tags: ['open-world'],
        requirements: [],
        ...overrides,
    }) as Game;

const rawgResult = (overrides: Record<string, unknown> = {}) => ({
    source: 'rawg' as const,
    rawgId: 3498,
    name: 'Cyberpunk 2077',
    coverImageUrl: null,
    rawgUrl: 'https://rawg.io/games/cyberpunk-2077',
    ...overrides,
});

const rawgDetail = (overrides: Record<string, unknown> = {}) => ({
    id: 3498,
    name: 'Cyberpunk 2077',
    slug: 'cyberpunk-2077',
    background_image: null,
    released: '2020-12-10',
    description_raw: null,
    developers: [],
    publishers: [],
    genres: [],
    tags: [],
    platforms: [],
    ...overrides,
});

describe('GameDiscoveryService', () => {
    let service: GameDiscoveryService;
    let gamesRepository: Record<string, jest.Mock>;
    let rawgService: { search: jest.Mock; getById: jest.Mock };
    let publisher: { publishInitial: jest.Mock; replayQueued: jest.Mock };
    let dataSource: {
        transaction: jest.Mock;
        getRepository: jest.Mock;
    };
    let transactionManager: Record<string, jest.Mock>;

    const callDiscover = (query: string) =>
        (
            service as unknown as {
                discover(query: string): Promise<unknown>;
            }
        ).discover(query);

    const callSelect = (rawgId: number) =>
        (
            service as unknown as {
                selectRawgGame(rawgId: number): Promise<unknown>;
            }
        ).selectRawgGame(rawgId);

    beforeEach(async () => {
        gamesRepository = {
            findAll: jest.fn(),
            findByRawgId: jest.fn(),
            findByRawgIds: jest.fn(),
            save: jest.fn(),
            insert: jest.fn(),
        };
        rawgService = {
            search: jest.fn(),
            getById: jest.fn(),
        };
        publisher = {
            publishInitial: jest.fn().mockResolvedValue(undefined),
            replayQueued: jest.fn().mockResolvedValue(undefined),
        };
        transactionManager = {
            findOne: jest.fn(),
            save: jest.fn((entity: unknown) => Promise.resolve(entity)),
            getRepository: jest.fn(() => gamesRepository),
        };
        dataSource = {
            transaction: jest.fn((work: (manager: unknown) => unknown) =>
                work(transactionManager),
            ),
            getRepository: jest.fn(() => gamesRepository),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GameDiscoveryService,
                { provide: 'IGamesRepository', useValue: gamesRepository },
                { provide: RawgService, useValue: rawgService },
                { provide: EnrichmentPublisher, useValue: publisher },
                { provide: 'DATA_SOURCE', useValue: dataSource },
            ],
        }).compile();

        service = module.get(GameDiscoveryService);
    });

    it('keeps local published results when RAWG is unavailable without writing or publishing', async () => {
        gamesRepository.findAll.mockResolvedValue([[localGame()], 1]);
        rawgService.search.mockResolvedValue({ available: false, results: [] });

        const result = await callDiscover('  Cyberpunk 2077  ');

        expect(result).toEqual({
            data: [
                {
                    source: 'local',
                    id: 7,
                    slug: 'cyberpunk-2077',
                    name: 'Cyberpunk 2077',
                    coverImageUrl: 'https://img.example/cyberpunk.jpg',
                },
            ],
            rawgAvailable: false,
        });
        expect(gamesRepository.findAll).toHaveBeenCalledWith({
            search: 'Cyberpunk 2077',
            limit: 8,
            page: 1,
        });
        expect(gamesRepository.save).not.toHaveBeenCalled();
        expect(gamesRepository.insert).not.toHaveBeenCalled();
        expect(publisher.publishInitial).not.toHaveBeenCalled();
    });

    it('marks every mixed discovery row with its source and preserves RAWG links', async () => {
        gamesRepository.findAll.mockResolvedValue([[localGame()], 1]);
        rawgService.search.mockResolvedValue({
            available: true,
            results: [rawgResult({ rawgId: 1234, name: 'Elden Ring' })],
        });
        gamesRepository.findByRawgIds.mockResolvedValue([]);

        const result = await callDiscover('games');

        expect(result).toEqual({
            data: [
                expect.objectContaining({ source: 'local', id: 7 }),
                expect.objectContaining({
                    source: 'rawg',
                    rawgId: 1234,
                    rawgUrl: 'https://rawg.io/games/cyberpunk-2077',
                }),
            ],
            rawgAvailable: true,
        });
        expect(JSON.stringify(result)).not.toContain('rawgPayload');
        expect(JSON.stringify(result)).not.toContain('metadataProvenance');
    });

    it('carries a sanitized RAWG attribution for imported local results', async () => {
        gamesRepository.findAll.mockResolvedValue([
            [
                localGame({
                    rawgId: 3498,
                    rawgPayload: {
                        id: 3498,
                        slug: 'cyberpunk-2077',
                        private_field: 'must not leak',
                    },
                    metadataProvenance: {
                        name: {
                            source: 'rawg',
                            sourceUrl: 'https://rawg.io/games/cyberpunk-2077',
                            extractedBy: null,
                        },
                    },
                }),
            ],
            1,
        ]);
        rawgService.search.mockResolvedValue({
            available: false,
            results: [],
        });

        const result = (await callDiscover('cyberpunk')) as {
            data: Array<Record<string, unknown>>;
        };

        expect(result.data[0]).toEqual({
            source: 'local',
            id: 7,
            slug: 'cyberpunk-2077',
            name: 'Cyberpunk 2077',
            coverImageUrl: 'https://img.example/cyberpunk.jpg',
            attributions: [
                {
                    source: 'rawg',
                    label: 'RAWG',
                    url: 'https://rawg.io/games/cyberpunk-2077',
                },
            ],
        });
        expect(JSON.stringify(result)).not.toContain('private_field');
        expect(JSON.stringify(result)).not.toContain('metadataProvenance');
    });

    it('does not attach a RAWG hit to a published or rejected local identity', async () => {
        gamesRepository.findAll.mockResolvedValue([[localGame()], 1]);
        rawgService.search.mockResolvedValue({
            available: true,
            results: [
                rawgResult({ rawgId: 3498 }),
                rawgResult({
                    rawgId: 7777,
                    name: 'Same title, different identity',
                }),
            ],
        });
        gamesRepository.findByRawgIds.mockResolvedValue([
            localGame({ rawgId: 3498, status: 'published' }),
            localGame({
                id: 8,
                rawgId: 7777,
                status: 'rejected',
                rejectionReason: 'moderation decision',
            }),
        ]);

        const result = (await callDiscover('cyberpunk')) as {
            data: Array<Record<string, unknown>>;
        };

        expect(result.data).toEqual([
            expect.objectContaining({ source: 'local', id: 7 }),
        ]);
    });

    it('rejects invalid or missing RAWG detail before opening a write transaction', async () => {
        rawgService.getById.mockResolvedValue(null);

        await expect(callSelect(3498)).rejects.toThrow(NotFoundException);

        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(gamesRepository.save).not.toHaveBeenCalled();
        expect(publisher.publishInitial).not.toHaveBeenCalled();
    });

    it('returns an existing pending selection without changing metadata or job state', async () => {
        const existing = localGame({
            id: 41,
            slug: 'cyberpunk-2077-rawg-3498',
            status: 'pending_approval',
            rawgId: 3498,
        });
        gamesRepository.findByRawgId.mockResolvedValue(existing);

        await expect(callSelect(3498)).resolves.toMatchObject({
            id: 41,
            slug: 'cyberpunk-2077-rawg-3498',
            status: 'pending_approval',
        });

        expect(rawgService.getById).not.toHaveBeenCalled();
        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(gamesRepository.save).not.toHaveBeenCalled();
        expect(publisher.publishInitial).not.toHaveBeenCalled();
    });

    it('returns an existing published selection and rejects an existing rejected selection', async () => {
        gamesRepository.findByRawgId.mockResolvedValue(
            localGame({
                id: 52,
                slug: 'cyberpunk-2077',
                status: 'published',
                rawgId: 3498,
            }),
        );

        await expect(callSelect(3498)).resolves.toEqual({
            id: 52,
            slug: 'cyberpunk-2077',
            status: 'published',
        });

        gamesRepository.findByRawgId.mockResolvedValue(
            localGame({
                id: 53,
                status: 'rejected',
                rawgId: 3498,
                rejectionReason: 'moderation decision',
            }),
        );

        await expect(callSelect(3498)).rejects.toThrow(ConflictException);
        expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('converges concurrent selection on one game and one queued job', async () => {
        const createdGame = localGame({
            id: 61,
            slug: 'cyberpunk-2077-rawg-3498',
            status: 'pending_approval',
            rawgId: 3498,
        });
        const createdJob = {
            id: 91,
            game: createdGame,
            status: 'queued',
            attempts: 0,
        } as unknown as GameEnrichmentJob;
        let transactionCount = 0;

        gamesRepository.findByRawgId
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValue(createdGame);
        rawgService.getById.mockResolvedValue(rawgDetail());
        transactionManager.findOne.mockResolvedValue(null);
        transactionManager.save
            .mockResolvedValueOnce(createdGame)
            .mockResolvedValueOnce(createdJob);
        dataSource.transaction.mockImplementation(
            (work: (manager: unknown) => unknown) => {
                transactionCount += 1;
                if (transactionCount === 2) {
                    throw Object.assign(new Error('duplicate rawg_id'), {
                        code: '23505',
                    });
                }
                return work(transactionManager);
            },
        );

        const results = await Promise.all([callSelect(3498), callSelect(3498)]);

        expect(results).toEqual([
            {
                id: 61,
                slug: 'cyberpunk-2077-rawg-3498',
                status: 'pending_approval',
            },
            {
                id: 61,
                slug: 'cyberpunk-2077-rawg-3498',
                status: 'pending_approval',
            },
        ]);
        expect(transactionManager.save).toHaveBeenCalledTimes(2);
        expect(publisher.publishInitial).toHaveBeenCalledTimes(1);
    });
});

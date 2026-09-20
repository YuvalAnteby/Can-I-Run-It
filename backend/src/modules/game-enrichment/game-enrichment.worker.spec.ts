import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Message } from 'amqplib';
import { DataSource } from 'typeorm';

import { Game } from '../games/entities/game.entity';
import { GameEnrichmentJob } from '../games/entities/game-enrichment-job.entity';
import { GameRequirement } from '../games/entities/game-requirement.entity';
import * as lifecycleContract from '../games/game-lifecycle.contract';
import {
    GAME_ENRICHMENT_QUEUE,
    GAME_ENRICHMENT_RETRY_QUEUE,
} from '../games/game-lifecycle.contract';
import { RabbitMqService } from '../messaging/rabbitmq.service';
import { GameEnrichmentWorker } from './game-enrichment.worker';
import { GeminiRequirementsService } from './gemini-requirements.service';
import {
    PcGamingWikiProviderError,
    PcGamingWikiService,
} from './pcgamingwiki.service';

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
};

type FakeMessageHandler = (message: Message | null) => Promise<void> | void;

type FakeChannel = {
    assertQueue: jest.Mock;
    prefetch: jest.Mock;
    consume: jest.Mock;
    ack: jest.Mock;
    nack: jest.Mock;
    sendToQueue: jest.Mock;
    close: jest.Mock;
};

type WorkerStore = {
    game?: Game;
    job?: GameEnrichmentJob;
    requirementRows: GameRequirement[];
};

type HarnessOptions = {
    completionGate?: Deferred<void>;
    deliveryChannel?: FakeChannel;
    jobOverrides?: Partial<GameEnrichmentJob>;
};

type WorkerHarness = {
    worker: GameEnrichmentWorker;
    module: TestingModule;
    store: WorkerStore;
    channel: FakeChannel;
    deliveryChannel: FakeChannel;
    wiki: { findExact: jest.Mock };
    gemini: { interpret: jest.Mock };
    dataSource: DataSource;
    callOrder: string[];
    getMessageHandler: () => FakeMessageHandler;
    deliver: (body: unknown) => Promise<void>;
};

const activeModules = new Set<TestingModule>();

const deferred = <T>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

const matchedLookup = {
    kind: 'matched',
    url: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
    metadata: { publisher: 'Bandai Namco Entertainment' },
    minimum: 'RAM: 8 GB\nCPU: Intel Core i5-8400',
    warnings: [],
};

const makeGame = (overrides: Partial<Game> = {}): Game =>
    Object.assign(new Game(), {
        id: 42,
        slug: 'elden-ring',
        name: 'Elden Ring',
        status: 'pending_approval',
        rawgId: 12,
        rawgPayload: { id: 12, name: 'Elden Ring' },
        metadataProvenance: {},
        publisher: null,
        developer: null,
        releaseDate: null,
        genre: null,
        description: null,
        tags: null,
        supportsRayTracing: false,
        supportsDlss: false,
        supportsFsr: false,
        supportsXeSS: false,
        coverImageUrl: null,
        requirements: [],
        rejectionReason: null,
        ...overrides,
    });

const makeJob = (
    game: Game,
    overrides: Partial<GameEnrichmentJob> = {},
): GameEnrichmentJob =>
    Object.assign(new GameEnrichmentJob(), {
        id: 7,
        game,
        status: 'queued',
        missingFields: [],
        error: null,
        attempts: 0,
        claimToken: null,
        claimedAt: null,
        ...overrides,
    });

const messageFrom = (body: unknown): Message =>
    ({
        content: Buffer.from(JSON.stringify(body)),
        fields: {},
        properties: {},
    }) as unknown as Message;

const makeRepository = (
    store: WorkerStore,
    kind: 'game' | 'job' | 'requirement' | 'other',
    callOrder: string[],
): Record<string, jest.Mock> => {
    const whereOf = (options: unknown): Record<string, unknown> => {
        if (typeof options !== 'object' || options === null) return {};
        if ('where' in options) {
            const where = options.where;
            return typeof where === 'object' && where !== null
                ? (where as Record<string, unknown>)
                : {};
        }
        return options as Record<string, unknown>;
    };

    const findOne = jest.fn().mockImplementation((options: unknown) => {
        callOrder.push(`${kind}.findOne`);
        const where = whereOf(options);
        if (kind === 'game') {
            if (!store.game) return null;
            if (typeof where.id === 'number' && where.id !== store.game.id) {
                return null;
            }
            return store.game;
        }
        if (kind === 'job') {
            if (!store.job) return null;
            if (typeof where.id === 'number' && where.id !== store.job.id) {
                return null;
            }
            const gameWhere = where.game;
            if (
                typeof gameWhere === 'object' &&
                gameWhere !== null &&
                'id' in gameWhere &&
                gameWhere.id !== store.job.game.id
            ) {
                return null;
            }
            return store.job;
        }
        if (kind === 'requirement') {
            const tier =
                typeof where.tier === 'string' ? where.tier : undefined;
            return (
                store.requirementRows.find((row) => row.tier === tier) ?? null
            );
        }
        return null;
    });

    const find = jest.fn().mockImplementation(() => {
        callOrder.push(`${kind}.find`);
        if (kind === 'job') return store.job ? [store.job] : [];
        if (kind === 'requirement') return store.requirementRows;
        return [];
    });

    const save = jest.fn().mockImplementation((entity: unknown) => {
        callOrder.push(`${kind}.save`);
        if (
            kind === 'requirement' &&
            entity instanceof GameRequirement &&
            !store.requirementRows.includes(entity)
        ) {
            store.requirementRows.push(entity);
        }
        return entity;
    });

    const upsert = jest.fn().mockImplementation(() => {
        callOrder.push(`${kind}.upsert`);
        return { identifiers: [] };
    });

    return { findOne, find, save, upsert };
};

const makeFakeChannel = (): FakeChannel => ({
    assertQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    sendToQueue: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(undefined),
});

const createHarness = async (
    options: HarnessOptions = {},
): Promise<WorkerHarness> => {
    const game = makeGame();
    const store: WorkerStore = {
        game,
        job: makeJob(game, options.jobOverrides),
        requirementRows: [],
    };
    const callOrder: string[] = [];
    const repositories = new Map<unknown, Record<string, jest.Mock>>([
        [Game, makeRepository(store, 'game', callOrder)],
        [GameEnrichmentJob, makeRepository(store, 'job', callOrder)],
        [GameRequirement, makeRepository(store, 'requirement', callOrder)],
    ]);
    const fallbackRepository = makeRepository(store, 'other', callOrder);
    const tx = {
        getRepository: jest.fn(
            (entity: unknown) => repositories.get(entity) ?? fallbackRepository,
        ),
    };
    let transactionCount = 0;
    const dataSource = {
        transaction: jest.fn(
            async (callback: (manager: unknown) => Promise<unknown>) => {
                transactionCount += 1;
                if (transactionCount === 2 && options.completionGate) {
                    await options.completionGate.promise;
                }
                return callback(tx);
            },
        ),
        getRepository: tx.getRepository,
    } as unknown as DataSource;

    const channel = makeFakeChannel();
    const deliveryChannel = options.deliveryChannel ?? channel;
    let messageHandler: FakeMessageHandler | undefined;
    let setupPromise: Promise<unknown> | undefined;
    deliveryChannel.consume.mockImplementation(
        (_queue: string, handler: FakeMessageHandler) => {
            messageHandler = handler;
            return Promise.resolve({ consumerTag: 'enrichment-test' });
        },
    );

    const rabbitMq = {
        createConfirmChannel: jest
            .fn()
            .mockImplementation(
                (setup: (amqpChannel: unknown) => Promise<unknown>) => {
                    setupPromise = setup(deliveryChannel);
                    return channel;
                },
            ),
    };
    const wiki = {
        findExact: jest.fn().mockResolvedValue(matchedLookup),
    };
    const gemini = {
        interpret: jest.fn().mockResolvedValue({}),
    };
    const logger = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
        providers: [
            GameEnrichmentWorker,
            { provide: 'DATA_SOURCE', useValue: dataSource },
            { provide: DataSource, useValue: dataSource },
            { provide: RabbitMqService, useValue: rabbitMq },
            { provide: PcGamingWikiService, useValue: wiki },
            { provide: GeminiRequirementsService, useValue: gemini },
            { provide: Logger, useValue: logger },
        ],
    }).compile();

    const worker = module.get(GameEnrichmentWorker);
    activeModules.add(module);
    const lifecycle = worker as unknown as {
        onModuleInit?: () => Promise<void> | void;
        onApplicationBootstrap?: () => Promise<void> | void;
    };
    if (lifecycle.onModuleInit) {
        await lifecycle.onModuleInit();
    } else if (lifecycle.onApplicationBootstrap) {
        await lifecycle.onApplicationBootstrap();
    }
    if (setupPromise) await setupPromise;

    const getMessageHandler = (): FakeMessageHandler => {
        if (!messageHandler)
            throw new Error('worker did not register a consumer');
        return messageHandler;
    };
    const deliver = async (body: unknown): Promise<void> => {
        await Promise.resolve(getMessageHandler()(messageFrom(body)));
    };

    return {
        worker,
        module,
        store,
        channel,
        deliveryChannel,
        wiki,
        gemini,
        dataSource,
        callOrder,
        getMessageHandler,
        deliver,
    };
};

describe('GameEnrichmentWorker', () => {
    afterEach(async () => {
        await Promise.all(
            [...activeModules].map((activeModule) => activeModule.close()),
        );
        activeModules.clear();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('uses the shared topology before prefetching and consuming one message at a time', async () => {
        const topology = jest
            .spyOn(lifecycleContract, 'assertGameEnrichmentTopology')
            .mockResolvedValue(undefined);
        const harness = await createHarness();

        expect(topology).toHaveBeenCalledWith(harness.channel);
        expect(harness.channel.prefetch).toHaveBeenCalledWith(1);
        expect(harness.channel.consume).toHaveBeenCalledWith(
            GAME_ENRICHMENT_QUEUE,
            expect.any(Function),
        );
        expect(topology.mock.invocationCallOrder[0]).toBeLessThan(
            harness.channel.prefetch.mock.invocationCallOrder[0],
        );
        expect(
            harness.channel.prefetch.mock.invocationCallOrder[0],
        ).toBeLessThan(harness.channel.consume.mock.invocationCallOrder[0]);
    });

    it('settles delivery on the originating channel and never on a replacement after close', async () => {
        const deliveryChannel = makeFakeChannel();
        const harness = await createHarness({ deliveryChannel });
        let closedDuringWork = false;
        deliveryChannel.ack.mockImplementation(() => {
            if (closedDuringWork) throw new Error('originating channel closed');
        });
        harness.wiki.findExact.mockImplementation(() => {
            closedDuringWork = true;
            return matchedLookup;
        });

        await harness.deliver({ gameId: 42 });

        expect(deliveryChannel.ack).toHaveBeenCalledTimes(1);
        expect(harness.channel.ack).not.toHaveBeenCalled();
        expect(harness.channel.nack).not.toHaveBeenCalled();
    });

    it.each([
        [
            'an expired processing claim',
            {
                status: 'processing',
                attempts: 1,
                claimedAt: new Date(Date.now() - 121_000),
            },
        ],
        [
            'a stale queued retry claim',
            {
                status: 'queued',
                attempts: 1,
                updatedAt: new Date(Date.now() - 61_000),
            },
        ],
    ] as Array<[string, Partial<GameEnrichmentJob>]>)(
        'recovers %s without resetting ownership or attempts',
        async (_name, jobOverrides) => {
            const harness = await createHarness({ jobOverrides });
            await new Promise<void>((resolve) => setImmediate(resolve));

            expect(harness.channel.sendToQueue).toHaveBeenCalledWith(
                GAME_ENRICHMENT_QUEUE,
                { gameId: 42 },
                expect.objectContaining({ persistent: true }),
            );
            expect(harness.store.job?.attempts).toBe(1);
            expect(harness.store.job?.status).toBe(jobOverrides.status);
        },
    );

    it('does not recover an untouched queued job that still belongs to the producer', async () => {
        const harness = await createHarness();
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(harness.channel.sendToQueue).not.toHaveBeenCalled();
        expect(harness.store.job?.attempts).toBe(0);
        expect(harness.store.job?.status).toBe('queued');
    });

    it.each([
        ['not-json', 'invalid JSON'],
        [JSON.stringify({ gameId: 0 }), 'zero game id'],
        [JSON.stringify({ gameId: -1 }), 'negative game id'],
        [JSON.stringify({ gameId: 1.5 }), 'fractional game id'],
        [JSON.stringify({ gameId: '42' }), 'string game id'],
    ])('dead-letters %s without calling providers (%s)', async (body) => {
        const harness = await createHarness();
        const message = {
            content: Buffer.from(body),
            fields: {},
            properties: {},
        } as unknown as Message;

        await Promise.resolve(harness.getMessageHandler()(message));

        expect(harness.wiki.findExact).not.toHaveBeenCalled();
        expect(harness.gemini.interpret).not.toHaveBeenCalled();
        expect(harness.channel.nack).toHaveBeenCalledWith(
            message,
            false,
            false,
        );
    });

    it.each([
        ['missing game', { game: undefined }],
        ['missing job', { job: undefined }],
    ])(
        'dead-letters a %s without external provider calls',
        async (_name, override) => {
            const harness = await createHarness();
            Object.assign(harness.store, override);

            await harness.deliver({ gameId: 42 });

            expect(harness.wiki.findExact).not.toHaveBeenCalled();
            expect(harness.gemini.interpret).not.toHaveBeenCalled();
            expect(harness.channel.nack).toHaveBeenCalledWith(
                expect.anything(),
                false,
                false,
            );
        },
    );

    it.each([
        ['completed replay', { status: 'completed' }],
        ['published game', { game: makeGame({ status: 'published' }) }],
        ['rejected game', { game: makeGame({ status: 'rejected' }) }],
    ])('ACKs a %s without calling providers', async (_name, override) => {
        const harness = await createHarness();
        if ('game' in override) {
            harness.store.game = override.game;
            if (harness.store.job) harness.store.job.game = override.game;
        } else if (harness.store.job) {
            Object.assign(harness.store.job, override);
        }

        await harness.deliver({ gameId: 42 });

        expect(harness.wiki.findExact).not.toHaveBeenCalled();
        expect(harness.gemini.interpret).not.toHaveBeenCalled();
        expect(harness.channel.ack).toHaveBeenCalledTimes(1);
        expect(harness.channel.nack).not.toHaveBeenCalled();
    });

    it('locks the game before the job while claiming a queued delivery', async () => {
        const harness = await createHarness();

        await harness.deliver({ gameId: 42 });

        expect(harness.callOrder.slice(0, 2)).toEqual([
            'game.findOne',
            'job.findOne',
        ]);
        expect(harness.store.job?.status).toBe('completed');
    });

    it('calls providers outside the claim transaction and persists one completion', async () => {
        const harness = await createHarness();
        let transactionActive = false;
        const transaction = Reflect.get(
            harness.dataSource,
            'transaction',
        ) as jest.Mock;
        transaction.mockImplementation(
            async (callback: (manager: unknown) => Promise<unknown>) => {
                transactionActive = true;
                const result = await callback({
                    getRepository: jest.fn((entity: unknown) => {
                        if (entity === Game) {
                            return {
                                findOne: jest
                                    .fn()
                                    .mockResolvedValue(harness.store.game),
                                save: jest
                                    .fn()
                                    .mockResolvedValue(harness.store.game),
                            };
                        }
                        if (entity === GameEnrichmentJob) {
                            return {
                                findOne: jest
                                    .fn()
                                    .mockResolvedValue(harness.store.job),
                                save: jest
                                    .fn()
                                    .mockResolvedValue(harness.store.job),
                            };
                        }
                        return {
                            findOne: jest.fn().mockResolvedValue(null),
                            find: jest.fn().mockResolvedValue([]),
                            save: jest.fn().mockResolvedValue(undefined),
                            upsert: jest.fn().mockResolvedValue(undefined),
                        };
                    }),
                });
                transactionActive = false;
                return result;
            },
        );
        harness.wiki.findExact.mockImplementation(() => {
            expect(transactionActive).toBe(false);
            return matchedLookup;
        });

        await harness.deliver({ gameId: 42 });

        expect(harness.wiki.findExact).toHaveBeenCalledWith('Elden Ring');
        expect(harness.store.job?.status).toBe('completed');
        expect(harness.store.game?.status).toBe('pending_approval');
        expect(harness.channel.ack).toHaveBeenCalledTimes(1);
    });

    it('does not ask Gemini to reinterpret deterministic numeric requirements', async () => {
        const harness = await createHarness();
        harness.wiki.findExact.mockResolvedValue({
            ...matchedLookup,
            minimum: 'RAM: 8 GB\nCPU: Intel Core i5-8400\nGPU: GTX 1060',
        });

        await harness.deliver({ gameId: 42 });

        expect(harness.gemini.interpret).not.toHaveBeenCalled();
    });

    it('skips PCGamingWiki when retained RAWG data fills every wiki-capable field', async () => {
        const harness = await createHarness();
        harness.store.game!.rawgPayload = {
            id: 12,
            name: 'Elden Ring',
            released: '2022-02-25',
            developers: [{ name: 'FromSoftware' }],
            publishers: [{ name: 'Bandai Namco Entertainment' }],
            genres: [{ name: 'Action RPG' }],
            platforms: [
                {
                    platform: { slug: 'windows' },
                    requirements: {
                        minimum:
                            'OS: Windows 10\nRAM: 8 GB\nVRAM: 4 GB\nStorage: 60 GB\nCPU: Intel Core i5-8400\nGPU: NVIDIA GeForce GTX 1060\nSSD required',
                        recommended:
                            'OS: Windows 10\nRAM: 16 GB\nVRAM: 8 GB\nStorage: 60 GB\nCPU: Intel Core i7-8700K\nGPU: NVIDIA GeForce GTX 1070\nSSD required',
                    },
                },
            ],
        };

        await harness.deliver({ gameId: 42 });

        expect(harness.wiki.findExact).not.toHaveBeenCalled();
        expect(harness.store.job?.status).toBe('completed');
    });

    it('omits an invalid provider release date without retrying the job', async () => {
        const harness = await createHarness();
        harness.wiki.findExact.mockResolvedValue({
            ...matchedLookup,
            metadata: { releaseDate: '2022-99-99' },
        });

        await harness.deliver({ gameId: 42 });

        expect(harness.store.game?.releaseDate).toBeNull();
        expect(harness.store.job?.status).toBe('completed');
        expect(harness.channel.sendToQueue).not.toHaveBeenCalled();
    });

    it('persists PCGamingWiki requirement provenance without coercing it to RAWG', async () => {
        const harness = await createHarness();

        await harness.deliver({ gameId: 42 });

        expect(
            harness.store.game?.metadataProvenance[
                'requirements.minimum.ramGb'
            ],
        ).toEqual({
            source: 'pcgamingwiki',
            sourceUrl: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
            extractedBy: null,
        });
    });

    it('preserves an existing admin-authored requirement note unchanged', async () => {
        const harness = await createHarness();
        const existingNote = 'Keep this review note exactly';
        harness.store.requirementRows.push(
            Object.assign(new GameRequirement(), {
                game: harness.store.game,
                tier: 'minimum',
                ramGb: 8,
                vramGb: null,
                storageGb: null,
                requiresSsd: false,
                resolutionWidth: 1920,
                resolutionHeight: 1080,
                targetFps: 30,
                cpu: null,
                gpu: null,
                notes: existingNote,
            }),
        );
        harness.store.game!.metadataProvenance = {
            'requirements.minimum.notes': {
                source: 'admin',
                sourceUrl: null,
                extractedBy: null,
            },
        };
        harness.wiki.findExact.mockResolvedValue({
            ...matchedLookup,
            minimum: 'RAM: 8 GB\nCPU: Unmatched CPU',
        });

        await harness.deliver({ gameId: 42 });

        expect(harness.store.requirementRows[0]?.notes).toBe(existingNote);
        expect(
            harness.store.game?.metadataProvenance[
                'requirements.minimum.notes'
            ],
        ).toEqual({
            source: 'admin',
            sourceUrl: null,
            extractedBy: null,
        });
    });

    it('records source provenance for notes synthesized from unmatched hardware text', async () => {
        const harness = await createHarness();
        harness.wiki.findExact.mockResolvedValue({
            ...matchedLookup,
            minimum: 'RAM: 8 GB\nCPU: Unmatched CPU\nGPU: Unmatched GPU',
        });

        await harness.deliver({ gameId: 42 });

        expect(harness.store.requirementRows[0]?.notes).toBe(
            'CPU: Unmatched CPU; GPU: Unmatched GPU',
        );
        expect(
            harness.store.game?.metadataProvenance[
                'requirements.minimum.notes'
            ],
        ).toEqual({
            source: 'pcgamingwiki',
            sourceUrl: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
            extractedBy: null,
        });
    });

    it('does not ACK until the completion transaction resolves', async () => {
        const gate = deferred<void>();
        const harness = await createHarness({ completionGate: gate });
        const delivery = harness.deliver({ gameId: 42 });

        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(harness.channel.ack).not.toHaveBeenCalled();

        gate.resolve();
        await delivery;
        expect(harness.channel.ack).toHaveBeenCalledTimes(1);
    });

    it('rejects a stale completion token without overwriting the newer claim', async () => {
        const gate = deferred<void>();
        const harness = await createHarness();
        harness.wiki.findExact.mockImplementation(() => {
            gate.resolve();
            return matchedLookup;
        });
        const delivery = harness.deliver({ gameId: 42 });
        await gate.promise;
        if (harness.store.job)
            harness.store.job.claimToken = 'newer-claim-token';
        await delivery;

        expect(harness.store.game?.publisher).toBeNull();
        expect(harness.store.job?.status).not.toBe('completed');
        expect(harness.channel.ack).toHaveBeenCalledTimes(1);
    });

    it('preserves an admin-owned value when an enrichment completion races the edit', async () => {
        const gate = deferred<void>();
        const harness = await createHarness();
        harness.wiki.findExact.mockImplementation(async () => {
            await gate.promise;
            return matchedLookup;
        });
        const delivery = harness.deliver({ gameId: 42 });
        await new Promise<void>((resolve) => setImmediate(resolve));
        harness.store.game!.publisher = 'Admin publisher';
        harness.store.game!.metadataProvenance = {
            publisher: {
                source: 'admin',
                sourceUrl: null,
                extractedBy: null,
            },
        };
        gate.resolve();
        await delivery;

        expect(harness.store.game?.publisher).toBe('Admin publisher');
        expect(harness.store.game?.metadataProvenance.publisher.source).toBe(
            'admin',
        );
    });

    it.each([
        ['publish', 'published'],
        ['reject', 'rejected'],
    ])(
        'does not write metadata when a concurrent %s changes game status before commit',
        async (_name, status) => {
            const gate = deferred<void>();
            const harness = await createHarness();
            harness.wiki.findExact.mockImplementation(async () => {
                await gate.promise;
                return matchedLookup;
            });
            const delivery = harness.deliver({ gameId: 42 });
            await new Promise<void>((resolve) => setImmediate(resolve));
            harness.store.game!.status = status as Game['status'];
            gate.resolve();
            await delivery;

            expect(harness.store.game?.publisher).toBeNull();
            expect(harness.store.job?.status).toBe('failed');
            expect(harness.store.job?.error).toBe('Game is no longer pending');
            expect(harness.channel.ack).toHaveBeenCalledTimes(1);
        },
    );

    it('ACKs an active duplicate while the original claim owns provider work', async () => {
        const gate = deferred<void>();
        const harness = await createHarness();
        harness.wiki.findExact.mockImplementation(async () => {
            await gate.promise;
            return matchedLookup;
        });
        const first = harness.deliver({ gameId: 42 });
        await new Promise<void>((resolve) => setImmediate(resolve));
        const second = harness.deliver({ gameId: 42 });
        await second;

        expect(harness.wiki.findExact).toHaveBeenCalledTimes(1);
        expect(harness.channel.ack).toHaveBeenCalledTimes(1);

        gate.resolve();
        await first;
        expect(harness.channel.ack).toHaveBeenCalledTimes(2);
    });

    it('marks a RAWG identity mismatch terminal without contacting providers', async () => {
        const harness = await createHarness();
        harness.store.game!.rawgPayload = { id: 999, name: 'Elden Ring' };

        await harness.deliver({ gameId: 42 });

        expect(harness.wiki.findExact).not.toHaveBeenCalled();
        expect(harness.channel.nack).toHaveBeenCalledWith(
            expect.anything(),
            false,
            false,
        );
        expect(harness.store.job?.status).toBe('failed');
    });

    it.each([
        ['http_403', 403],
        ['http_429', 429],
        ['http_5xx', 500],
        ['timeout', 0],
        ['response_too_large', 0],
    ])(
        'retries %s failures at most three total claims and dead-letters on exhaustion',
        async (code) => {
            const harness = await createHarness();
            harness.wiki.findExact.mockRejectedValue(
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

            await harness.deliver({ gameId: 42 });
            await harness.deliver({ gameId: 42 });
            await harness.deliver({ gameId: 42 });
            await harness.deliver({ gameId: 42 });

            expect(harness.wiki.findExact).toHaveBeenCalledTimes(3);
            expect(harness.channel.sendToQueue).toHaveBeenCalledTimes(2);
            expect(harness.channel.sendToQueue).toHaveBeenNthCalledWith(
                1,
                GAME_ENRICHMENT_RETRY_QUEUE,
                { gameId: 42 },
                expect.objectContaining({ persistent: true }),
            );
            expect(harness.store.job?.attempts).toBe(3);
            expect(harness.store.job?.status).toBe('failed');
            expect(harness.channel.nack).toHaveBeenCalledWith(
                expect.anything(),
                false,
                false,
            );
        },
    );

    it('does not call a provider or publish a retry for a completed replay', async () => {
        const harness = await createHarness();
        harness.store.job!.status = 'completed';
        await harness.deliver({ gameId: 42 });

        expect(harness.wiki.findExact).not.toHaveBeenCalled();
        expect(harness.channel.sendToQueue).not.toHaveBeenCalled();
        expect(harness.channel.ack).toHaveBeenCalledTimes(1);
    });

    it('dead-letters a failed replay without calling providers', async () => {
        const harness = await createHarness({
            jobOverrides: { status: 'failed', attempts: 3 },
        });

        await harness.deliver({ gameId: 42 });

        expect(harness.wiki.findExact).not.toHaveBeenCalled();
        expect(harness.channel.nack).toHaveBeenCalledWith(
            expect.anything(),
            false,
            false,
        );
    });

    it('treats a Gemini timeout as retryable and keeps the provider payload out of RabbitMQ', async () => {
        const harness = await createHarness();
        harness.wiki.findExact.mockResolvedValue({
            ...matchedLookup,
            minimum: 'Minimum RAM: eight gigabytes',
        });
        harness.gemini.interpret.mockRejectedValue(
            new Error('Gemini request timeout with provider-secret'),
        );

        await harness.deliver({ gameId: 42 });

        expect(harness.channel.sendToQueue).toHaveBeenCalledWith(
            GAME_ENRICHMENT_RETRY_QUEUE,
            { gameId: 42 },
            expect.objectContaining({ persistent: true }),
        );
        expect(
            JSON.stringify(harness.channel.sendToQueue.mock.calls),
        ).not.toContain('provider-secret');
        expect(harness.store.job?.status).toBe('queued');
    });
});

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AbuseProtectionService } from '../../common/abuse-protection/abuse-protection.service';
import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { DiscoverGamesDto } from './dto/discover-games.dto';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

describe('GamesController', () => {
    let controller: GamesController;

    const mockGamesService = {
        findPaged: jest.fn(),
        findBySlug: jest.fn(),
        findPendingPageById: jest.fn(),
        discover: jest.fn(),
        selectRawgGame: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [GamesController],
            providers: [
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn(
                            (_key: string, fallback?: unknown) => fallback,
                        ),
                    },
                },
                AbuseProtectionService,
                CheckRateLimitGuard,
                {
                    provide: GamesService,
                    useValue: mockGamesService,
                },
            ],
        }).compile();

        controller = module.get<GamesController>(GamesController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('requires the games service in Nest wiring', async () => {
        const module = Test.createTestingModule({
            controllers: [GamesController],
        });

        await expect(module.compile()).rejects.toThrow();
    });

    describe('RAWG discovery routes', () => {
        type DiscoveryController = GamesController & {
            discoverGames(input: { q: string }): Promise<unknown>;
            selectRawgGame(rawgId: number): Promise<unknown>;
        };

        const discoveryService = {
            discover: jest.fn(),
            selectRawgGame: jest.fn(),
        };

        const discoveryController = (): DiscoveryController =>
            new GamesController(discoveryService as never);

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('trims a non-empty query before delegating read-only discovery', async () => {
            discoveryService.discover.mockResolvedValue({
                data: [],
                rawgAvailable: false,
            });

            await discoveryController().discoverGames(
                plainToInstance(DiscoverGamesDto, { q: '  Elden Ring  ' }),
            );

            expect(discoveryService.discover).toHaveBeenCalledWith(
                'Elden Ring',
            );
            expect(discoveryService.selectRawgGame).not.toHaveBeenCalled();
        });

        it.each(['', '   ', 'x'.repeat(101)])(
            'rejects an invalid discovery query: %j',
            async (q) => {
                await expect(
                    validate(plainToInstance(DiscoverGamesDto, { q })),
                ).resolves.not.toHaveLength(0);
            },
        );

        it('delegates RAWG selection and returns only the public identity result', async () => {
            discoveryService.selectRawgGame.mockResolvedValue({
                id: 91,
                slug: 'elden-ring-rawg-123',
                status: 'pending_approval',
            });

            await expect(
                discoveryController().selectRawgGame(123),
            ).resolves.toEqual({
                id: 91,
                slug: 'elden-ring-rawg-123',
                status: 'pending_approval',
            });
            expect(discoveryService.selectRawgGame).toHaveBeenCalledWith(123);
        });
    });
});

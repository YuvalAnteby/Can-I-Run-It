import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_GAMES } from './games.constants';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { IGamesRepositoryToken } from './igames.repository';

describe('GamesController', () => {
    let controller: GamesController;

    const mockGamesRepository = {
        findAll: jest.fn(),
        findBySlug: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [GamesController],
            providers: [
                GamesService,
                {
                    provide: IGamesRepositoryToken,
                    useValue: mockGamesRepository,
                },
            ],
        }).compile();

        controller = module.get<GamesController>(GamesController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('should return mock games', async () => {
        const games = await controller.getMockGames();
        expect(games).toEqual(MOCK_GAMES);
    });

    it('should search mock games', async () => {
        const result = await controller.searchMockGames('Cyberpunk');
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].name).toContain('Cyberpunk');
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
            new GamesController(
                discoveryService as never,
            ) as DiscoveryController;

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('trims a non-empty query before delegating read-only discovery', async () => {
            discoveryService.discover.mockResolvedValue({
                data: [],
                rawgAvailable: false,
            });

            await discoveryController().discoverGames({ q: '  Elden Ring  ' });

            expect(discoveryService.discover).toHaveBeenCalledWith(
                'Elden Ring',
            );
            expect(discoveryService.selectRawgGame).not.toHaveBeenCalled();
        });

        it.each(['', '   ', 'x'.repeat(101)])(
            'rejects an invalid discovery query: %j',
            async (q) => {
                await expect(
                    discoveryController().discoverGames({ q }),
                ).rejects.toThrow(BadRequestException);
                expect(discoveryService.discover).not.toHaveBeenCalled();
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

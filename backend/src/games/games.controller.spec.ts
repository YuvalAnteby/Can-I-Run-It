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
});

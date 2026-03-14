import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_GAMES } from './games.constants';
import { GamesService } from './games.service';
import { IGamesRepositoryToken } from './igames.repository';

describe('GamesService', () => {
    let service: GamesService;

    const mockGamesRepository = {
        findAll: jest.fn(),
        findBySlug: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GamesService,
                {
                    provide: IGamesRepositoryToken,
                    useValue: mockGamesRepository,
                },
            ],
        }).compile();

        service = module.get<GamesService>(GamesService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return mock games', async () => {
        const games = await service.getMockGames();
        expect(games).toEqual(MOCK_GAMES);
    });

    it('should filter mock games', async () => {
        const games = await service.searchMockGames('God of War');
        expect(games.length).toBeGreaterThan(0);
        expect(games[0].name).toContain('God of War');
    });
});

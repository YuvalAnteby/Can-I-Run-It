import { TypeOrmGamesRepository } from './games.typeorm.repository';

describe('TypeOrmGamesRepository', () => {
    const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(),
    };
    const gameRepo = {
        createQueryBuilder: jest.fn(() => queryBuilder),
        findOne: jest.fn(),
    };
    const dataSource = {
        getRepository: jest.fn(() => gameRepo),
    };

    let repository: TypeOrmGamesRepository;

    beforeEach(() => {
        jest.clearAllMocks();
        queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
        repository = new TypeOrmGamesRepository(dataSource as never);
    });

    it('limits list queries to published games and preserves name filtering', async () => {
        await repository.findAll({
            search: 'cyber',
            page: 2,
            limit: 5,
        });

        expect(queryBuilder.where).toHaveBeenCalledWith(
            'game.status = :status',
            { status: 'published' },
        );
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'game.name ILIKE :search',
            { search: '%cyber%' },
        );
        expect(queryBuilder.skip).toHaveBeenCalledWith(5);
        expect(queryBuilder.take).toHaveBeenCalledWith(5);
    });

    it('finds only published games by slug', async () => {
        await repository.findBySlug('cyberpunk-2077');

        expect(gameRepo.findOne).toHaveBeenCalledWith({
            where: { slug: 'cyberpunk-2077', status: 'published' },
            relations: [
                'gameEngine',
                'requirements',
                'requirements.cpu',
                'requirements.gpu',
            ],
        });
    });
});

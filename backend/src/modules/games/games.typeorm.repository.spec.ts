import { TypeOrmGamesRepository } from './games.typeorm.repository';

const containing = <T extends object>(value: T): T =>
    expect.objectContaining(value) as T;

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
        findOneBy: jest.fn(),
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

    it('finds pending or newly published pages by internal id but never rejected rows', async () => {
        gameRepo.findOne.mockResolvedValue(null);

        await (
            repository as unknown as {
                findPendingPageById(id: number): Promise<unknown>;
            }
        ).findPendingPageById(42);

        expect(gameRepo.findOne).toHaveBeenCalledWith(
            containing({
                where: containing({
                    id: 42,
                    status: containing({
                        _value: ['pending_approval', 'published'],
                    }),
                }),
                relations: [
                    'requirements',
                    'requirements.cpu',
                    'requirements.gpu',
                ],
            }),
        );
    });

    it('looks up RAWG identity without merging on a matching title or slug', async () => {
        await (
            repository as unknown as {
                findByRawgId(rawgId: number): Promise<unknown>;
            }
        ).findByRawgId(3498);

        expect(gameRepo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { rawgId: 3498 } }),
        );
    });
});

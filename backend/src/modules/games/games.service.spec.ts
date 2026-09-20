import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_GAMES } from './games.constants';
import { GamesService } from './games.service';
import { IGamesRepositoryToken } from './igames.repository';

describe('GamesService', () => {
    let service: GamesService;

    const mockGamesRepository = {
        findAll: jest.fn(),
        findBySlug: jest.fn(),
        findPendingPageById: jest.fn(),
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

    it('maps a pending RAWG import to normalized public defaults and safe attribution', async () => {
        mockGamesRepository.findPendingPageById.mockResolvedValue({
            id: 42,
            slug: 'cyberpunk-2077-rawg-3498',
            name: 'Cyberpunk 2077',
            status: 'pending_approval',
            rawgId: 3498,
            rawgPayload: {
                id: 3498,
                name: 'Cyberpunk 2077',
                slug: 'cyberpunk-2077',
                private_provider_field: 'must not leak',
            },
            metadataProvenance: {},
            rejectionReason: null,
            coverImageUrl: null,
            releaseDate: null,
            developer: null,
            publisher: null,
            genre: null,
            description: null,
            tags: null,
            supportsRayTracing: false,
            supportsDlss: false,
            supportsFsr: false,
            supportsXeSS: false,
            isTrending: false,
            trendingRank: null,
            requirements: [],
        });

        const result = await (
            service as unknown as {
                findPendingPageById(
                    id: number,
                ): Promise<Record<string, unknown>>;
            }
        ).findPendingPageById(42);

        expect(result).toMatchObject({
            id: 42,
            slug: 'cyberpunk-2077-rawg-3498',
            status: 'pending_approval',
            coverImageUrl: null,
            tags: [],
            requirements: [],
        });
        expect(result).toHaveProperty('attributions', [
            {
                source: 'rawg',
                label: 'RAWG',
                url: 'https://rawg.io/games/cyberpunk-2077',
            },
        ]);
        expect(result).not.toHaveProperty('rawgPayload');
        expect(result).not.toHaveProperty('metadataProvenance');
        expect(result).not.toHaveProperty('rejectionReason');
    });

    it('normalizes published detail and projects only accepted displayed PCGamingWiki provenance', async () => {
        mockGamesRepository.findBySlug.mockResolvedValue({
            id: 43,
            slug: 'elden-ring',
            name: 'Elden Ring',
            status: 'published',
            rawgId: 123,
            rawgPayload: { id: 123, slug: 'elden-ring' },
            metadataProvenance: {
                description: {
                    source: 'pcgamingwiki',
                    sourceUrl:
                        'https://www.pcgamingwiki.com/wiki/Elden_Ring?private=no#history',
                    extractedBy: 'gemini',
                },
                publisher: {
                    source: 'pcgamingwiki',
                    sourceUrl: 'https://attacker.example/wiki/Elden_Ring',
                    extractedBy: 'gemini',
                },
            },
            coverImageUrl: null,
            releaseDate: null,
            developer: null,
            publisher: null,
            genre: null,
            description: 'A displayed description',
            tags: null,
            supportsRayTracing: false,
            supportsDlss: false,
            supportsFsr: false,
            supportsXeSS: false,
            isTrending: false,
            trendingRank: null,
            requirements: [],
        });

        const result = await service.findBySlug('elden-ring');

        expect(result).toMatchObject({
            status: 'published',
            tags: [],
            requirements: [],
        });
        expect(result).toHaveProperty('attributions', [
            {
                source: 'rawg',
                label: 'RAWG',
                url: 'https://rawg.io/games/elden-ring',
            },
            {
                source: 'pcgamingwiki',
                label: 'PCGamingWiki',
                url: 'https://www.pcgamingwiki.com/wiki/Elden_Ring',
            },
        ]);
        expect(JSON.stringify(result)).not.toContain('attacker.example');
    });

    it('projects one PCGamingWiki attribution for a displayed requirement value', async () => {
        mockGamesRepository.findBySlug.mockResolvedValue({
            id: 45,
            slug: 'requirement-attribution',
            name: 'Requirement Attribution',
            status: 'published',
            rawgId: null,
            rawgPayload: null,
            metadataProvenance: {
                'requirements.minimum.ramGb': {
                    source: 'pcgamingwiki',
                    sourceUrl:
                        'https://www.pcgamingwiki.com/wiki/Requirement_Attribution?oldid=1#RAM',
                    extractedBy: 'gemini',
                },
            },
            coverImageUrl: null,
            releaseDate: null,
            developer: null,
            publisher: null,
            genre: null,
            description: null,
            tags: [],
            supportsRayTracing: false,
            supportsDlss: false,
            supportsFsr: false,
            supportsXeSS: false,
            isTrending: false,
            trendingRank: null,
            requirements: [
                {
                    tier: 'minimum',
                    description: null,
                    cpu: null,
                    gpu: null,
                    ramGb: 16,
                    vramGb: null,
                    storageGb: null,
                    requiresSsd: false,
                    resolutionWidth: 1920,
                    resolutionHeight: 1080,
                    targetFps: 30,
                    notes: null,
                },
            ],
        });

        const result = await service.findBySlug('requirement-attribution');

        expect(result.requirements).toEqual([
            expect.objectContaining({ tier: 'minimum', ramGb: 16 }),
        ]);
        expect(result.attributions).toEqual([
            {
                source: 'pcgamingwiki',
                label: 'PCGamingWiki',
                url: 'https://www.pcgamingwiki.com/wiki/Requirement_Attribution',
            },
        ]);
    });

    it('omits unsafe and non-displayed requirement provenance', async () => {
        mockGamesRepository.findBySlug.mockResolvedValue({
            id: 46,
            slug: 'private-requirement-provenance',
            name: 'Private Requirement Provenance',
            status: 'published',
            rawgId: null,
            rawgPayload: null,
            metadataProvenance: {
                'requirements.minimum.privatePayload': {
                    source: 'pcgamingwiki',
                    sourceUrl:
                        'https://www.pcgamingwiki.com/wiki/Private_Requirement',
                    extractedBy: 'gemini',
                },
                'requirements.minimum.ramGb': {
                    source: 'pcgamingwiki',
                    sourceUrl:
                        'https://attacker.example/wiki/Private_Requirement',
                    extractedBy: 'gemini',
                },
            },
            coverImageUrl: null,
            releaseDate: null,
            developer: null,
            publisher: null,
            genre: null,
            description: null,
            tags: [],
            supportsRayTracing: false,
            supportsDlss: false,
            supportsFsr: false,
            supportsXeSS: false,
            isTrending: false,
            trendingRank: null,
            requirements: [
                {
                    tier: 'minimum',
                    description: null,
                    cpu: null,
                    gpu: null,
                    ramGb: 16,
                    vramGb: null,
                    storageGb: null,
                    requiresSsd: false,
                    resolutionWidth: 1920,
                    resolutionHeight: 1080,
                    targetFps: 30,
                    notes: null,
                },
            ],
        });

        const result = await service.findBySlug(
            'private-requirement-provenance',
        );

        expect(result).not.toHaveProperty('attributions');
    });

    it('omits attribution data for seeded games and does not expose rejected games as pending pages', async () => {
        mockGamesRepository.findBySlug.mockResolvedValue({
            id: 44,
            slug: 'seeded-game',
            name: 'Seeded Game',
            status: 'published',
            rawgId: null,
            rawgPayload: null,
            metadataProvenance: {
                name: {
                    source: 'seed',
                    sourceUrl: 'https://example.com/seed',
                    extractedBy: null,
                },
            },
            coverImageUrl: null,
            releaseDate: null,
            developer: null,
            publisher: null,
            genre: null,
            description: null,
            tags: null,
            supportsRayTracing: false,
            supportsDlss: false,
            supportsFsr: false,
            supportsXeSS: false,
            isTrending: false,
            trendingRank: null,
            requirements: [],
        });
        mockGamesRepository.findPendingPageById.mockResolvedValue(null);

        const seeded = await service.findBySlug('seeded-game');
        expect(seeded).not.toHaveProperty('attributions');

        await expect(
            (
                service as unknown as {
                    findPendingPageById(id: number): Promise<unknown>;
                }
            ).findPendingPageById(99),
        ).rejects.toThrow(NotFoundException);
    });
});

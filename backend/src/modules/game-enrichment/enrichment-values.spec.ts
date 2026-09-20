import type { CandidateValue, CandidateValues } from './enrichment-values';
import {
    extractRawg,
    mergeMissing,
    normalizeRequirements,
    summarizeMissing,
} from './enrichment-values';

const rawgValue = (
    value: CandidateValue['value'],
    source: CandidateValue['source'] = 'rawg',
): CandidateValue => ({
    value,
    source,
    sourceUrl: source === 'rawg' ? 'https://rawg.io/games/12' : null,
    extractedBy: null,
});

describe('enrichment values', () => {
    describe('extractRawg', () => {
        it('rejects a payload whose identity does not match the retained RAWG id', () => {
            expect(() =>
                extractRawg({ id: 12, name: 'Other game' }, 13),
            ).toThrow('RAWG id');
        });

        it('rejects a payload without a nonblank name', () => {
            expect(() => extractRawg({ id: 12, name: '   ' }, 12)).toThrow(
                'RAWG name',
            );
        });

        it('extracts only nonblank allowlisted metadata and explicit feature flags', () => {
            const values = extractRawg(
                {
                    id: 12,
                    name: 'Elden Ring',
                    released: '2022-02-25',
                    background_image: 'https://cdn.example/elden-ring.jpg',
                    description_raw: 'A source description.',
                    developers: [{ name: 'FromSoftware' }],
                    publishers: [{ name: 'Bandai Namco' }],
                    genres: [{ name: 'RPG' }],
                    tags: [{ name: 'action-rpg' }],
                    supportsRayTracing: true,
                    supportsDlss: true,
                    supportsFsr: false,
                    supportsXeSS: true,
                    slug: 'must-not-persist',
                    isTrending: true,
                },
                12,
            );

            expect(values).toMatchObject({
                developer: {
                    value: 'FromSoftware',
                    source: 'rawg',
                    sourceUrl: 'https://rawg.io/games/12',
                    extractedBy: null,
                },
                publisher: { value: 'Bandai Namco', source: 'rawg' },
                releaseDate: { value: '2022-02-25', source: 'rawg' },
                genre: { value: 'RPG', source: 'rawg' },
                description: { value: 'A source description.', source: 'rawg' },
                tags: { value: ['action-rpg'], source: 'rawg' },
                coverImageUrl: {
                    value: 'https://cdn.example/elden-ring.jpg',
                    source: 'rawg',
                },
                supportsRayTracing: { value: true, source: 'rawg' },
                supportsDlss: { value: true, source: 'rawg' },
                supportsXeSS: { value: true, source: 'rawg' },
            });
            expect(values).not.toHaveProperty('supportsFsr');
            expect(values).not.toHaveProperty('slug');
            expect(values).not.toHaveProperty('isTrending');
        });

        it('treats blank fields, empty collections, and default false flags as missing', () => {
            const values = extractRawg(
                {
                    id: 12,
                    name: 'Elden Ring',
                    released: '',
                    background_image: null,
                    description_raw: '  ',
                    developers: [],
                    publishers: [],
                    genres: [],
                    tags: [],
                    supportsRayTracing: false,
                    supportsDlss: false,
                    supportsFsr: false,
                    supportsXeSS: false,
                },
                12,
            );

            expect(values).toEqual({});
        });

        it('reads Windows requirement text without requiring a platforms array', () => {
            const values = extractRawg(
                {
                    id: 12,
                    name: 'Elden Ring',
                    platforms: [
                        {
                            platform: { slug: 'windows' },
                            requirements: {
                                minimum: 'RAM: 8192 MB',
                                recommended: 'RAM: 16 GB',
                            },
                        },
                    ],
                },
                12,
            );

            expect(values['requirements.minimum.ramGb']?.value).toBe(8);
            expect(values['requirements.recommended.ramGb']?.value).toBe(16);
        });
    });

    describe('normalizeRequirements', () => {
        it('converts explicit RAM, VRAM, storage, hardware, and SSD evidence', () => {
            const values = normalizeRequirements(
                [
                    'RAM: 8192 MB',
                    'VRAM: 4 GB',
                    'Storage: 70 GB',
                    'CPU: Intel Core i5-12400F',
                    'GPU: NVIDIA GeForce RTX 3070',
                    'SSD required',
                ].join('\n'),
                'minimum',
                'rawg',
                null,
            );

            expect(values).toMatchObject({
                'requirements.minimum.ramGb': { value: 8, source: 'rawg' },
                'requirements.minimum.vramGb': { value: 4, source: 'rawg' },
                'requirements.minimum.storageGb': {
                    value: 70,
                    source: 'rawg',
                },
                'requirements.minimum.cpu': {
                    value: 'Intel Core i5-12400F',
                    source: 'rawg',
                },
                'requirements.minimum.gpu': {
                    value: 'NVIDIA GeForce RTX 3070',
                    source: 'rawg',
                },
                'requirements.minimum.requiresSsd': {
                    value: true,
                    source: 'rawg',
                },
            });
        });

        it('rounds fractional gigabytes up and does not infer unsupported units', () => {
            const rounded = normalizeRequirements(
                'RAM: 1.5 GB',
                'minimum',
                'pcgamingwiki',
                'https://www.pcgamingwiki.com/wiki/Example',
            );
            const unsupported = normalizeRequirements(
                'RAM: 8192 KiB',
                'minimum',
                'pcgamingwiki',
                'https://www.pcgamingwiki.com/wiki/Example',
            );

            expect(rounded['requirements.minimum.ramGb']?.value).toBe(2);
            expect(unsupported['requirements.minimum.ramGb']).toBeUndefined();
        });

        it('does not mistake storage or VRAM numbers for RAM', () => {
            const values = normalizeRequirements(
                'VRAM: 8 GB\nStorage: 80 GB',
                'minimum',
                'rawg',
                null,
            );

            expect(values['requirements.minimum.ramGb']).toBeUndefined();
            expect(values['requirements.minimum.vramGb']?.value).toBe(8);
            expect(values['requirements.minimum.storageGb']?.value).toBe(80);
        });
    });

    describe('mergeMissing', () => {
        it('keeps an existing RAWG value when PCGamingWiki supplies a duplicate', () => {
            const rawg: CandidateValues = {
                publisher: rawgValue('RAWG publisher'),
            };
            const wiki: CandidateValues = {
                publisher: {
                    value: 'Wiki publisher',
                    source: 'pcgamingwiki',
                    sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example',
                    extractedBy: null,
                },
            };

            expect(mergeMissing(rawg, wiki).publisher?.value).toBe(
                'RAWG publisher',
            );
        });

        it('always keeps admin provenance and fills genuinely missing paths', () => {
            const admin: CandidateValues = {
                publisher: {
                    value: 'Edited publisher',
                    source: 'admin',
                    sourceUrl: null,
                    extractedBy: null,
                },
            };
            const wiki: CandidateValues = {
                publisher: {
                    value: 'Wiki publisher',
                    source: 'pcgamingwiki',
                    sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example',
                    extractedBy: null,
                },
                developer: {
                    value: 'Wiki developer',
                    source: 'pcgamingwiki',
                    sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example',
                    extractedBy: null,
                },
            };

            const merged = mergeMissing(admin, wiki);
            expect(merged.publisher?.value).toBe('Edited publisher');
            expect(merged.publisher?.source).toBe('admin');
            expect(merged.developer?.value).toBe('Wiki developer');
        });
    });

    describe('summarizeMissing', () => {
        it('returns a stable sorted list with minimum required evidence', () => {
            const missing = summarizeMissing({
                'requirements.recommended.ramGb': rawgValue(16),
            });

            expect(missing).toEqual([...missing].sort());
            expect(missing).toEqual(
                expect.arrayContaining([
                    'requirements.minimum.ramGb',
                    'requirements.minimum.cpu',
                    'requirements.minimum.gpu',
                    'requirements.recommended.cpu',
                    'requirements.recommended.gpu',
                ]),
            );
            expect(missing).not.toContain('requirements.recommended.ramGb');
        });

        it('does not invent a recommended tier when no source supplied one', () => {
            const missing = summarizeMissing({});

            expect(missing).toContain('requirements.minimum.ramGb');
            expect(missing).not.toContain('requirements.recommended.ramGb');
        });
    });
});

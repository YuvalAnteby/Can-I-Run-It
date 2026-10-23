import type { MigrationInterface, QueryRunner } from 'typeorm';

/** RAWG ids of the seeded games, so discovery hides their RAWG duplicates. */
export const SEEDED_GAME_RAWG_IDS: [slug: string, rawgId: number][] = [
    ['kingdom-come-deliverance-2', 980502],
    ['god-of-war-2018', 58175],
    ['god-of-war-ragnarok', 494384],
    ['kingdom-come-deliverance', 28172],
    ['red-dead-redemption-2', 28],
    ['black-myth-wukong', 481913],
    ['assassins-creed-shadows', 981791],
    ['the-last-of-us-part-1', 799265],
    ['the-last-of-us-part-2', 972403],
    ['cyberpunk-2077', 41494],
];

/**
 * Backfills rawg_id on databases seeded before 05-seed.sql carried it. Skips a
 * game whose RAWG copy was already imported, to respect the unique index.
 */
export class SeededGameRawgIds1792108800000 implements MigrationInterface {
    name = 'SeededGameRawgIds1792108800000';

    async up(queryRunner: QueryRunner): Promise<void> {
        for (const [slug, rawgId] of SEEDED_GAME_RAWG_IDS) {
            await queryRunner.query(
                `UPDATE public.games SET rawg_id = $1
                 WHERE slug = $2 AND rawg_id IS NULL
                   AND NOT EXISTS (SELECT 1 FROM public.games WHERE rawg_id = $1)`,
                [rawgId, slug],
            );
        }
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        for (const [slug, rawgId] of SEEDED_GAME_RAWG_IDS) {
            await queryRunner.query(
                'UPDATE public.games SET rawg_id = NULL WHERE slug = $1 AND rawg_id = $2',
                [slug, rawgId],
            );
        }
    }
}

BEGIN;

ALTER TABLE game_enrichment_jobs
  ADD COLUMN warnings TEXT[] NOT NULL DEFAULT '{}'::text[];

COMMIT;

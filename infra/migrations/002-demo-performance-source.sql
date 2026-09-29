BEGIN;

ALTER TABLE performance_records ADD COLUMN IF NOT EXISTS source VARCHAR(50);
UPDATE performance_records
SET source = CASE WHEN source_url = 'gemini' THEN 'gemini' ELSE 'measured' END
WHERE source IS NULL;
ALTER TABLE performance_records ALTER COLUMN source SET DEFAULT 'measured';
ALTER TABLE performance_records ALTER COLUMN source SET NOT NULL;

COMMIT;

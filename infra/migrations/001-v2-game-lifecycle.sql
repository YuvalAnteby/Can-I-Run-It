BEGIN;

ALTER TABLE games ADD COLUMN status varchar(20);
UPDATE games SET status = 'published';
ALTER TABLE games ALTER COLUMN status SET NOT NULL;
ALTER TABLE games ALTER COLUMN status SET DEFAULT 'pending_approval';
ALTER TABLE games
    ADD COLUMN rawg_id integer,
    ADD COLUMN rawg_payload jsonb,
    ADD COLUMN metadata_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN rejection_reason text,
    ADD CONSTRAINT games_status_check CHECK (status IN ('pending_approval', 'published', 'rejected')),
    ADD CONSTRAINT games_rawg_id_key UNIQUE (rawg_id),
    ADD CONSTRAINT games_rawg_id_check CHECK (rawg_id IS NULL OR rawg_id > 0),
    ADD CONSTRAINT games_rawg_payload_check CHECK (rawg_payload IS NULL OR jsonb_typeof(rawg_payload) = 'object'),
    ADD CONSTRAINT games_metadata_provenance_check CHECK (jsonb_typeof(metadata_provenance) = 'object'),
    ADD CONSTRAINT games_rejection_reason_check CHECK (
        (status = 'rejected' AND rejection_reason IS NOT NULL AND length(regexp_replace(rejection_reason, '[[:space:]]', '', 'g')) > 0)
        OR (status <> 'rejected' AND rejection_reason IS NULL)
    );

COMMIT;

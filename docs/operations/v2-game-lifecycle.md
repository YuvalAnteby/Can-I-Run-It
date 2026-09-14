# V2 game lifecycle operations

Issue #62 defines the persistence and visibility contract used by the game
import, enrichment, and moderation work. It does not call RAWG, publish broker
messages, or add admin endpoints.

## Schema paths

Fresh databases run the numbered files in `infra/init-scripts/` in order. The
updated game table and the `game_enrichment_jobs` table are created by
`03-games-schema.sql` and `06-enrichment-schema.sql`; `05-seed.sql` marks every
curated game as `published`.

For an existing V1 database, take a verified backup and run the one-time
transactional upgrade against the intended database:

```sh
pg_dump --format=custom "$DATABASE_URL" > ciri-before-v2-game-lifecycle.dump
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  -f infra/migrations/001-v2-game-lifecycle.sql
```

`ON_ERROR_STOP=1` is required. The migration is intentionally not idempotent:
do not apply it to a database that already has the lifecycle columns or table.
It is not a production upgrade procedure to execute casually from a developer
machine; use the deployment process for the intended database and retain the
backup until post-upgrade checks finish.

Post-upgrade, verify the retained data and key constraints:

```sql
SELECT status, COUNT(*) FROM games GROUP BY status ORDER BY status;
SELECT COUNT(*) FROM performance_records;
SELECT conname
FROM pg_constraint
WHERE conrelid = 'performance_records'::regclass
  AND contype = 'f';
```

If `psql` exits nonzero before commit, PostgreSQL rolls the transaction back.
Keep the error output, do not retry blindly, and inspect the database and
backup. If recovery is required after a committed operational mistake, restore
the verified backup into a controlled recovery path and promote it through the
normal deployment process. There is no casual down migration: dropping the
lifecycle columns discards moderation state.

## Contract

`backend/src/modules/games/game-lifecycle.contract.ts` exports:

```ts
type GameStatus = 'pending_approval' | 'published' | 'rejected';
type EnrichmentStatus = 'queued' | 'processing' | 'completed' | 'failed';
type MetadataSource = 'rawg' | 'pcgamingwiki' | 'admin' | 'seed' | 'default';

interface FieldProvenance {
    source: MetadataSource;
    sourceUrl: string | null;
    extractedBy: 'gemini' | null;
}

type MetadataProvenance = Record<string, FieldProvenance>;
interface GameEnrichmentMessage { gameId: number; }
const GAME_ENRICHMENT_QUEUE = 'game.enrichment';
```

The message contains only a positive integer `gameId`. Runtime consumers must
validate that value; TypeScript types are not message validation. URLs,
credentials, and complete provider payloads do not travel in the message.

Metadata provenance keys are persisted field paths, for example:

```json
{
  "name": {
    "source": "rawg",
    "sourceUrl": "https://rawg.io/games/3498",
    "extractedBy": null
  },
  "requirements.minimum.ramGb": {
    "source": "pcgamingwiki",
    "sourceUrl": "https://www.pcgamingwiki.com/wiki/Example",
    "extractedBy": "gemini"
  },
  "coverImageUrl": {
    "source": "admin",
    "sourceUrl": null,
    "extractedBy": null
  }
}
```

Consumers allowlist supported field paths; arbitrary paths are not treated as
database columns. Gemini extraction is distinct from the underlying evidence
source. A default `false` feature flag without provenance is a placeholder,
not evidence that the game lacks the feature. Missing numeric requirements
remain missing and must not be invented to satisfy
`game_requirements.ram_gb`.

## State matrix

Game publication transitions are the only transitions in this issue:

| From | To | Allowed |
| --- | --- | --- |
| `pending_approval` | `published` | yes |
| `pending_approval` | `rejected` | yes |
| `pending_approval` | `pending_approval` | no transition |
| `published` | `pending_approval` | no |
| `published` | `published` | no transition |
| `published` | `rejected` | no |
| `rejected` | `pending_approval` | no |
| `rejected` | `published` | no |
| `rejected` | `rejected` | no transition |

Rejected rows are retained. There is no automatic reopening and no automatic
published metadata change. Editing a published game does not change its
status. #65 must check enrichment completion and enforce publication changes
transactionally; a repeated identical status request may be treated as a
conflict.

The current job is unique per game. Its worker-owned flow is:

| From | To | Rule |
| --- | --- | --- |
| `queued` | `processing` | claim the job with a new ownership token |
| `processing` | `completed` | persist only with the matching claim token |
| `processing` | `failed` | persist only with the matching claim token |
| `failed` | `queued` | bounded retry |
| expired `processing` | `processing` | recover with a new token |

Completed jobs may still list missing fields. The worker must recheck game
status in the commit transaction. #64 owns claims, bounded retries, and
abandoned-claim recovery.

## Public and pending access

Existing public V2 game list/search/detail queries and the V1 compatibility
check resolve `status = 'published'` at their repository/service boundaries.
The existing V1 mock endpoints remain static and do not read lifecycle rows.
Pending and rejected games therefore return the same public not-found behavior
as an unknown slug. #66 must add a separate explicit pending-page/check path;
it must not remove the published predicate globally.

## Handoffs

### #66 game selection/import

RAWG search remains read-only. Selection/import uses `rawg_id` as identity and
must never reuse a game merely because its title or slug matches. One
transaction creates or reuses the pending game and its current job. If a RAWG
slug conflicts with an existing slug, use a deterministic suffix based on the
RAWG ID. Reselection reuses the current durable queued job rather than creating
another active job, and a publisher retries that job after interruption. Do
not reset published or rejected games automatically.

### #64 enrichment and #65 moderation

Metadata and publication writers recheck the current game status under their
transaction. A worker completion must include the current job's claim token so
stale retries cannot overwrite a newer claim. Do not add a hidden per-
performance visibility flag; `Game.status` is the visibility authority.

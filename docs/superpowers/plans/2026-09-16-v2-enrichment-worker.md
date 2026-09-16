# Pending Game Enrichment Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume durable `{ gameId }` jobs and prepare source-attributed metadata and requirements for admin review while leaving every imported game pending.

**Architecture:** Reuse the #62 game/job tables and #52 `RabbitMqService`. A shared game-lifecycle contract asserts the complete main/retry/dead RabbitMQ topology for both #66's producer and #64's worker, preventing inequivalent queue redeclarations. Claim one current job in PostgreSQL, gather only missing values from retained RAWG data and an exact-match PCGamingWiki page, normalize requirements before asking Gemini to interpret remaining source text, then conditionally commit against the same claim and pending game before acknowledging. #64 alone owns retry semantics; no new event bus, scraping framework, or LLM strategy layer.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, `amqplib` / `amqp-connection-manager`, Node 24 `fetch`, installed `@google/genai`, Jest, isolated Docker test stack.

**Spec:** [Issue #64](https://github.com/YuvalAnteby/Can-I-Run-It/issues/64), [#62 lifecycle](https://github.com/YuvalAnteby/Can-I-Run-It/issues/62), [#52 messaging](https://github.com/YuvalAnteby/Can-I-Run-It/issues/52), and `docs/operations/v2-game-lifecycle.md` at base `c99a8210cdc8944b1c5fb2e98cdaa3e1104ea7b1`.

## Global Constraints

- Message body is exactly `{ gameId: positive safe integer }`; load `rawgPayload` and status from PostgreSQL. Invalid/missing identity is terminal. Never place a payload or provider credential in RabbitMQ.
- `backend/src/modules/games/game-lifecycle.contract.ts` is the sole declaration site for `game.enrichment`, `game.enrichment.retry`, and `game.enrichment.dead`. It exports one `assertGameEnrichmentTopology(channel)` setup with identical durable, DLX, routing-key, and TTL arguments. #64's worker and #66's producer must call it from their confirm-channel setup and must not call `assertQueue` separately for these queue names.
- `Game.status` remains `pending_approval`; this worker never publishes or reopens published/rejected games. Keep `GameEnrichmentJob.status` separate.
- #66 owns RAWG search/selection and creates or reuses one pending game plus a queued job by `rawg_id`; it persists the RAWG object with matching positive `id` and `name`, then confirms the initial `{ gameId }` publication only while `status='queued' AND attempts=0`. After #64 claims and increments `attempts`, #64 exclusively owns retry publication, backoff, abandoned-claim recovery, exhaustion, and dead-lettering. No title/slug identity matching in the database.
- #64 owns `GameEnrichmentJob.warnings: string[]`. Add it as `TEXT[] NOT NULL DEFAULT '{}'::text[]` in fresh init and one-time migration `infra/migrations/002-v2-enrichment-warnings.sql`. #65 must base on #64, read persisted `warnings`, and use migration 003 for its own schema change. Partial `completed` remains approvable. #65 and this worker lock the game row before the job row and recheck status/provenance inside their write transaction.
- Retain `MetadataProvenance` with allowlisted persisted paths. `source` is `rawg` or `pcgamingwiki`; `extractedBy` is `gemini` only if Gemini interpreted text from that source. Never overwrite a path marked `admin`, or any existing non-placeholder value. A default `false` flag without provenance is a placeholder, not evidence of false.
- The requirement table requires `ram_gb`; do not create a tier row without an evidenced RAM value. CPU/GPU foreign keys are set only on an unambiguous match to existing hardware rows; retain unmatched names in `notes` and list the structured path as missing. Do not invent hardware rows or numeric data.
- Use MediaWiki only, never Cargo or HTML scraping. Parent verification on 2026-09-19 used a contact-bearing User-Agent and received HTTP 200 from anonymous `action=query` exact-title resolution and `action=parse&prop=wikitext` for `Elden Ring`; the parse response contained the Windows `System requirements` template in about 33.8 KB of wikitext. Freeze exact requested-title or explicit redirect matching. Ambiguous, mismatched, or absent pages complete partially with a warning; 403, 429, 5xx, timeout, and bounded-response failures follow the worker's settled three-attempt provider-failure policy.
- Send `User-Agent: Can-I-Run-It/2.0 (+https://github.com/YuvalAnteby/Can-I-Run-It)` and cap the process below PCGamingWiki's documented 60 requests/minute. Preserve only canonical source URLs derived as `https://www.pcgamingwiki.com/wiki/${encodeURIComponent(canonicalTitle.replaceAll(' ', '_'))}` from the accepted MediaWiki title.
- PCGamingWiki's official copyright page states that content is CC BY-NC-SA unless otherwise noted. This does not block implementation or CI. Before production deployment, preserve source URL/provenance, hand #66 the sanitized public attribution contract for any page displaying approved PCGamingWiki-derived data, and require the deployment owner to confirm the site's non-commercial/share-alike compatibility. Do not add licensing infrastructure or state a legal conclusion in this issue.
- Do not add a source-cache table, generic provider interface, new parser dependency, or re-enrichment of published games. Preserve raw source text already held in `rawg_payload`; persist only accepted normalized values and their provenance.
- The base has no `backend/node_modules` in this worktree. The implementation session installs from the existing lockfile before checks; this planning session does not write dependencies or feature code.

## File map

| Path | Responsibility |
| --- | --- |
| `backend/src/modules/game-enrichment/game-enrichment.module.ts`, `game-enrichment.worker.ts` | Register a feature consumer using `RabbitMqService`; claim, recover, commit, ACK/NACK. |
| `backend/src/modules/game-enrichment/enrichment-values.ts` | Pure RAWG field extraction, precedence, requirement normalization, missing paths. |
| `backend/src/modules/game-enrichment/pcgamingwiki.service.ts` | Exact page lookup and bounded MediaWiki read request; extract supported infobox metadata and Windows requirement template fields. |
| `backend/src/modules/game-enrichment/gemini-requirements.service.ts` | Interpret unresolved requirement text using installed Gemini SDK and validate source-grounded JSON. Distinct from FPS estimation. |
| `backend/src/modules/games/entities/game-enrichment-job.entity.ts`, `infra/init-scripts/06-enrichment-schema.sql`, `infra/migrations/002-v2-enrichment-warnings.sql` | Add `warnings text[] NOT NULL DEFAULT '{}'` to the current job; do not change the game publication schema. |
| `backend/src/modules/games/game-lifecycle.contract.ts`, `backend/src/modules/games/game-lifecycle.contract.spec.ts` | Export the message plus the one exact main/retry/dead topology setup consumed by both #64 and #66. |
| `backend/src/app.module.ts` | Register the worker module. The PCGamingWiki service owns the fixed contact-bearing User-Agent; no new deployment setting is needed. |
| Co-located `*.spec.ts`, `backend/test/game-enrichment.e2e-spec.ts` | Source parsing, claim/commit, retry/dead-letter and broker/database behavior. |

## Review Focus

1. A duplicate or stale `{ gameId }` delivery must not call providers or overwrite a newer claim; Task 3's worker suite covers active duplicate, completed replay, and stale-token completion.
2. A provider 403/429/5xx/timeout or oversized body must retry with fixed backoff at most three total claims, then persist `failed` and dead-letter; Tasks 2 and 4 cover each classification and exhaustion.
3. A no-page, ambiguous title, mismatched title, or page without Windows requirements must complete partially with stable `missingFields` and a warning, never use fuzzy data; Tasks 2 and 4 cover all four fixtures.
4. Producer-first or worker-first startup must not raise RabbitMQ `PRECONDITION_FAILED` or lose an early confirmed message; Tasks 3 and 4 cover exact shared queue arguments, both initialization orders, and retained delivery.
5. A publish/reject or admin edit racing worker completion must preserve admin-owned fields and prevent post-publication metadata writes; Tasks 3 and 4 pause before commit and assert the locked recheck outcome.

---

## Task 1: Persist review warnings and define the field policy

**Files:** Modify `backend/src/modules/games/entities/game-enrichment-job.entity.ts`, `infra/init-scripts/06-enrichment-schema.sql`; create `infra/migrations/002-v2-enrichment-warnings.sql`, `backend/src/modules/game-enrichment/enrichment-values.ts`, `backend/src/modules/game-enrichment/enrichment-values.spec.ts`.

**Interfaces:** Keep these types/functions in `enrichment-values.ts`, independent of TypeORM:

```ts
type RequirementTier = 'minimum' | 'recommended';
type RequirementField = 'ramGb' | 'vramGb' | 'storageGb' | 'cpu' | 'gpu' | 'requiresSsd' | 'notes';
type FieldPath =
    | 'publisher' | 'developer' | 'releaseDate' | 'genre' | 'description' | 'tags' | 'coverImageUrl'
    | 'supportsRayTracing' | 'supportsDlss' | 'supportsFsr' | 'supportsXeSS'
    | `requirements.${RequirementTier}.${RequirementField}`;
type CandidateValue = {
    value: string | string[] | number | boolean;
    source: 'rawg' | 'pcgamingwiki' | 'admin';
    sourceUrl: string | null;
    extractedBy: 'gemini' | null;
};
type CandidateValues = Partial<Record<FieldPath, CandidateValue>>;

function extractRawg(payload: unknown, rawgId: number): CandidateValues;
function normalizeRequirements(rawText: string, tier: RequirementTier, source: 'rawg' | 'pcgamingwiki', sourceUrl: string | null): CandidateValues;
function mergeMissing(current: CandidateValues, candidates: CandidateValues): CandidateValues;
function summarizeMissing(values: CandidateValues): FieldPath[];
```

Core first-failure assertions:

```ts
expect(() => extractRawg({ id: 12, name: 'Other' }, 13)).toThrow();
expect(normalizeRequirements('RAM: 8192 MB', 'minimum', 'rawg', null)['requirements.minimum.ramGb']?.value).toBe(8);
const admin = { publisher: { value: 'Edited', source: 'admin', sourceUrl: null, extractedBy: null } } as CandidateValues;
const wiki = { publisher: { value: 'Wiki', source: 'pcgamingwiki', sourceUrl: 'https://www.pcgamingwiki.com/wiki/Example', extractedBy: null } } as CandidateValues;
expect(mergeMissing(admin, wiki).publisher?.value).toBe('Edited');
```

- [ ] Write failing pure tests for RAWG object validation (`id` mismatch and missing `name`), nonblank metadata extraction, empty/default placeholders, and numeric conversion: `8192 MB -> 8 GB`, `1.5 GB -> 2 GB`, unsupported units -> missing. Test that a RAWG value wins over PCGamingWiki and `admin` provenance always wins.
- [ ] Run `npm --prefix backend test -- --runInBand enrichment-values`; expect the new suite to fail before implementation.
- [ ] Add `warnings: string[]` to the entity and `warnings TEXT[] NOT NULL DEFAULT '{}'::text[]` to fresh init. #64 definitively owns migration 002; do not edit migration 001 or defer this column to #65. Add an isolated DB test verifying fresh and upgraded shape without changing existing job rows or their attempts/status.

```sql
BEGIN;
ALTER TABLE game_enrichment_jobs
  ADD COLUMN warnings TEXT[] NOT NULL DEFAULT '{}'::text[];
COMMIT;
```
- [ ] Implement a fixed allowlist: scalar fields `publisher`, `developer`, `releaseDate`, `genre`, `description`, `tags`, `coverImageUrl`; explicit supported feature flags; and `minimum` / `recommended` requirement fields `ramGb`, `vramGb`, `storageGb`, `cpu`, `gpu`, `requiresSsd`, `notes`. Ignore `slug`, `isTrending`, raw unknown keys, and speculative engine inference. Treat a blank string, null, or an unprovenanced default boolean as missing. Preserve existing valued paths and all `admin` paths.
- [ ] Parse only supported RAWG shapes: `id`, `name`, `released`, `background_image`, `description_raw`, `developers`, `publishers`, `genres`, `tags`, and Windows `platforms[].requirements.{minimum,recommended}` if present. Accept a search-shaped payload with missing detail fields. Do not call RAWG again or assume `platforms` exists. For requirement text, parse explicit numbers/units and SSD claims; do not infer RAM from an unrelated storage/VRAM number.
- [ ] Return a stable sorted `missing_fields` list of absent review paths. Include minimum RAM/CPU/GPU when absent; include recommended paths only if a recommended tier exists in a source. Missing source data stays missing; no default numeric value is attributed to a provider. Use `warnings` for absent/ambiguous source pages, unsupported units, and skipped tiers, never as a substitute for `missing_fields`.
- [ ] Run the pure suite and the isolated schema check; commit the verified task as `feat(games): record enrichment warnings and normalize source values`.

## Task 2: Fill remaining fields from PCGamingWiki and Gemini

**Files:** Create `backend/src/modules/game-enrichment/pcgamingwiki.service.ts`, `backend/src/modules/game-enrichment/pcgamingwiki.service.spec.ts`, `backend/src/modules/game-enrichment/gemini-requirements.service.ts`, `backend/src/modules/game-enrichment/gemini-requirements.service.spec.ts`. No Compose or environment-file change is needed for the fixed contact URL.

**Interfaces:** Define the lookup result and failure contract in `pcgamingwiki.service.ts`; import `CandidateValues` and `FieldPath` from Task 1:

```ts
type PcGamingWikiWarning =
    | 'PCGamingWiki page not found'
    | 'PCGamingWiki title is ambiguous'
    | 'PCGamingWiki title did not match'
    | 'PCGamingWiki Windows requirements missing';
type PcGamingWikiLookup =
    | { kind: 'unmatched'; warning: PcGamingWikiWarning }
    | {
          kind: 'matched';
          url: string;
          metadata: Partial<Record<'developer' | 'publisher' | 'releaseDate' | 'genre', string>>;
          minimum?: string;
          recommended?: string;
          warnings: PcGamingWikiWarning[];
      };
type PcGamingWikiFailureCode = 'http_403' | 'http_429' | 'http_5xx' | 'timeout' | 'response_too_large';
class PcGamingWikiProviderError extends Error {
    constructor(readonly code: PcGamingWikiFailureCode, message: string) {
        super(message);
    }
}

PcGamingWikiService.findExact(name: string): Promise<PcGamingWikiLookup>;
GeminiRequirementsService.interpret(
    text: string,
    missingPaths: FieldPath[],
    source: 'rawg' | 'pcgamingwiki',
    sourceUrl: string | null,
): Promise<CandidateValues>;
```

Provider and interpretation acceptance assertions:

```ts
expect(await wiki.findExact('No exact page')).toEqual({ kind: 'unmatched', warning: 'PCGamingWiki page not found' });
expect(await wiki.findExact('Elden Ring')).toMatchObject({ kind: 'matched', url: expect.stringContaining('pcgamingwiki.com/wiki/'), minimum: expect.any(String) });
expect(geminiSdk.models.generateContent).not.toHaveBeenCalled(); // deterministic input already supplied RAM
const interpreted = await gemini.interpret('Minimum RAM: eight gigabytes', ['requirements.minimum.ramGb'], 'pcgamingwiki', 'https://www.pcgamingwiki.com/wiki/Example');
expect(interpreted['requirements.minimum.ramGb']).toMatchObject({ source: 'pcgamingwiki', extractedBy: 'gemini' });
```

- [ ] Save sanitized MediaWiki fixtures from the parent-verified 2026-09-19 response shape: one `action=query&format=json&formatversion=2&redirects=1&titles=Elden%20Ring` exact/redirect response and one `action=parse&format=json&formatversion=2&prop=wikitext&page=Elden%20Ring` response containing the Windows `System requirements` template. Unit and CI tests use fixtures and mocked `fetch`, never a live provider.
- [ ] Write failing provider tests for exact title acceptance, one explicit redirect acceptance, no page, multiple/ambiguous pages, normalized-but-mismatched title, missing Windows `System requirements` template, 403, 429, 5xx, timeout, and a response exceeding 256 KiB. Assert no parse call occurs without an accepted query match. No/ambiguous/mismatched pages return their exact `unmatched` warning; a matched page without the template returns metadata plus `PCGamingWiki Windows requirements missing`; transport/status/size failures throw sanitized `PcGamingWikiProviderError` without response bodies.
- [ ] Implement exactly two anonymous MediaWiki requests with Node `fetch`, `URLSearchParams`, and `AbortSignal.timeout(5_000)`: `action=query` with `format=json`, `formatversion=2`, `redirects=1`, and one `titles` value, followed only for the accepted canonical title by `action=parse` with `prop=wikitext`. Send the fixed User-Agent, enforce 256 KiB per response and a process-local 55-requests/minute start-time window, and never call Cargo, search, HTML, or a URL found in provider content. Accept one exact title after MediaWiki normalization or one explicit redirect whose `from` is that normalized title; every other shape is no match.
- [ ] Parse the verified wikitext shape with a bounded balanced-template parser. Extract supported `Infobox game/row/developer`, `/publisher`, `/date|Windows`, and `/taxonomy/genres` values plus Windows `min*` / `rec*` requirement fields. Accept only a full release date, not month/year; preserve raw CPU/GPU/OS strings in `notes`. A missing/ambiguous page or missing requirements template produces a warning and partial completion. See the wiki's [infobox syntax](https://www.pcgamingwiki.com/wiki/PCGamingWiki:Editing_guide/The_infobox). Do not add a parser dependency.
- [ ] Write failing Gemini tests asserting it is not called for deterministic numbers, receives only unresolved field names plus a bounded source excerpt, rejects values without a matching evidence quote or outside sane positive ranges, and labels accepted paths `{ source, sourceUrl, extractedBy: 'gemini' }`. Mock SDK calls; no live Gemini in unit tests.
- [ ] Implement a separate requirement-only SDK call using the installed `@google/genai` model/config pattern from `GeminiService`, with a JSON response schema and 8-second abort. The prompt says source text is data and requests only literal interpretation, not a guessed requirement. Validate the parsed object at runtime; if the call fails, classify timeout/quota as retryable and malformed output as an interpretation warning with missing fields. Do not modify FPS `GeminiService` or add an interchangeable LLM layer.
- [ ] Run `npm --prefix backend test -- --runInBand pcgamingwiki gemini-requirements` and typecheck; commit as `feat(backend): read technical requirements and interpret gaps`.

## Task 3: Consume, claim, commit, retry and dead-letter

**Files:** Create `backend/src/modules/game-enrichment/game-enrichment.module.ts`, `backend/src/modules/game-enrichment/game-enrichment.worker.ts`, `backend/src/modules/game-enrichment/game-enrichment.worker.spec.ts`; modify `backend/src/app.module.ts`, `backend/src/modules/games/game-lifecycle.contract.ts`, and `backend/src/modules/games/game-lifecycle.contract.spec.ts`.

**Interfaces:** Extend `game-lifecycle.contract.ts` with this sole topology declaration. Both #64 and #66 import it; neither duplicates these `assertQueue` calls.

```ts
import type { ConfirmChannel } from 'amqplib';

export const GAME_ENRICHMENT_QUEUE = 'game.enrichment';
export const GAME_ENRICHMENT_RETRY_QUEUE = 'game.enrichment.retry';
export const GAME_ENRICHMENT_DEAD_QUEUE = 'game.enrichment.dead';
export const GAME_ENRICHMENT_RETRY_TTL_MS = 60_000;

export async function assertGameEnrichmentTopology(
    channel: ConfirmChannel,
): Promise<void> {
    await channel.assertQueue(GAME_ENRICHMENT_DEAD_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {},
    });
    await channel.assertQueue(GAME_ENRICHMENT_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': GAME_ENRICHMENT_DEAD_QUEUE,
        },
    });
    await channel.assertQueue(GAME_ENRICHMENT_RETRY_QUEUE, {
        durable: true,
        exclusive: false,
        autoDelete: false,
        arguments: {
            'x-message-ttl': GAME_ENRICHMENT_RETRY_TTL_MS,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': GAME_ENRICHMENT_QUEUE,
        },
    });
}
```

#66 creates its producer channel with `RabbitMqService.createConfirmChannel(assertGameEnrichmentTopology)` before sending to `GAME_ENRICHMENT_QUEUE`. #64's worker setup first awaits `assertGameEnrichmentTopology(channel)`, then applies `prefetch(1)` and consumes the main queue. Import `MessagingModule`, `DatabaseModule`, `EntityManager`, and Task 1's `CandidateValues`. Keep `mergeAndSaveAllowedValues(tx: EntityManager, game: Game, job: GameEnrichmentJob, candidates: CandidateValues): Promise<void>` private to the worker: it saves allowlisted metadata/provenance and requirement tiers plus `status='completed'`, `missingFields`, and `warnings` in that same transaction.

The write boundary must follow this order; the test should pause before commit and race #65's status change:

```ts
await dataSource.transaction(async (tx) => {
    const game = await tx.getRepository(Game).findOne({ where: { id: gameId }, lock: { mode: 'pessimistic_write' } });
    const job = await tx.getRepository(GameEnrichmentJob).findOne({ where: { game: { id: gameId } }, lock: { mode: 'pessimistic_write' } });
    if (!game || !job || job.status !== 'processing' || job.claimToken !== claimToken) return;
    if (game.status !== 'pending_approval') {
        job.status = 'failed';
        job.error = 'Game is no longer pending';
        await tx.save(job);
        return;
    }
    await mergeAndSaveAllowedValues(tx, game, job, candidates);
});
channel.ack(message); // only after transaction resolves
```

- [ ] In `game-lifecycle.contract.spec.ts`, write a failing topology test with a mocked `ConfirmChannel`: `assertGameEnrichmentTopology` must assert dead, main, then retry exactly once with the queue names and options above. In the worker spec, assert setup calls this shared function before `prefetch(1)`/`consume`; do not accept a worker-local `assertQueue` implementation.
- [ ] Write failing worker tests for invalid JSON/non-positive ID, missing game/job, completed replay, nonpending game, duplicate delivery, stale claim token, admin-owned values, concurrent publish/reject at commit, and each `PcGamingWikiProviderError` cause. Assert no external source call for replay/nonpending rows, no ACK before durable completion, and no fourth provider call after three claims.
- [ ] In a short transaction, lock `Game` then `GameEnrichmentJob` by ID. Validate matching RAWG identity/payload, current `pending_approval`, and one job. Claim `queued` or expired `processing` (two-minute lease) only while `attempts < 3`, with a fresh `randomUUID()`, increment `attempts`, set `claimedAt`, and commit. That increment transfers retry ownership from #66 to #64. A non-expired other claim is an ACKed duplicate; a completed job is an ACKed replay; a failed job or exhausted unclaimed attempt is dead-lettered without more provider work. If a game is now published/rejected, ACK after the read without changing it. A missing/invalid identity is a terminal poison delivery.
- [ ] Perform PCGamingWiki/Gemini calls outside the transaction. In the completion transaction, lock game before job again; require `pending_approval`, `status='processing'`, and the same `claimToken`. Re-read `metadataProvenance` and existing requirement rows, apply only still-empty/non-admin allowlisted paths, and upsert each tier by the existing `(game_id,tier)` uniqueness. Write `missingFields`, `warnings`, clear `error`/claim, set job `completed`; do not set Game.status. ACK only after commit. If the game changed status while processing, make no metadata write; close only the matching job as failed with a sanitized reason, then ACK.
- [ ] On 403, 429, 5xx, timeout, oversized response, Gemini quota/timeout, or transient database failure, persist a sanitized `error`, clear the claim, and change only the matching job back to `queued` while `attempts < 3`. Confirm-publish the same message to the durable 60-second retry queue with `persistent: true`, then ACK the original. If the retry confirm or DB commit is uncertain, do not ACK; broker redelivery plus row claims remains safe. After attempt 3, commit `failed`, clear the claim, then `nack(requeue=false)` so main-queue dead-lettering retains the message. Poison identity/payload likewise marks an existing job failed when possible and dead-letters. Never log credentials, response bodies, or full source payloads.
- [ ] On startup and every two minutes, #64 scans two bounded ownership-recovery sets whose games remain pending: expired `processing` jobs with `attempts > 0`, and `queued` jobs with `attempts > 0 AND attempts < 3` whose `updated_at` is at least 60 seconds old. Confirm-publish `{ gameId }` to main and leave row state unchanged. Ignore `queued` jobs with `attempts=0` because #66 exclusively republishes those initial deliveries; never reset `completed`, `failed`, published, or rejected rows. Concurrent recovery/redelivery is harmless because row locks and claim tokens reject duplicate work.
- [ ] Run the worker unit suite, typecheck and lint; commit as `feat(backend): consume pending game enrichment jobs`.

## Task 4: Prove end-to-end behavior and hand off contracts

**Files:** Create `backend/test/game-enrichment.e2e-spec.ts`; update only the worker's tests or plan notes where verification exposes a defect. Do not edit #65/#66 artifacts.

- [ ] In the isolated test stack, insert a pending game with a matching durable RAWG payload and queued job, publish `{ gameId }` persistently, and verify full enrichment commits metadata/provenance and requirement tier rows, leaves game pending, completes the job, then ACKs. Stub external PCGamingWiki/Gemini responses; do not call live providers in CI.
- [ ] Test partial completion with separate no-page, ambiguous-page, mismatched-title, and missing-Windows-template fixtures. Each ends `status=completed` with sorted `missing_fields`, no fabricated requirement row, and a pending game; assert the respective persisted warning is `PCGamingWiki page not found`, `PCGamingWiki title is ambiguous`, `PCGamingWiki title did not match`, or `PCGamingWiki Windows requirements missing`. Test Gemini-assisted interpretation with source provenance/evidence and explicit admin provenance surviving a racing completion.
- [ ] Test each retryable provider failure (403, 429, 5xx, timeout, and oversized response) entering the 60-second retry queue, three-attempt exhaustion dead-lettering with `status=failed`, malformed payload dead-lettering, and exact replay/concurrent delivery resulting in one game/job and no duplicate requirement row. Force a worker stop between claim and commit; after lease expiry/restart, confirm #64 recovery and stale-token rejection. Observe ACK/NACK only after DB state is durable.
- [ ] Add the cross-issue retry-ownership integration test with two pending fixtures. The #66 fixture query `WHERE status = 'queued' AND attempts = 0` publishes only the untouched job. Claim the second job through #64 so `attempts` becomes 1, force a retryable failure back to `queued`, rerun the #66 fixture query and assert it does not publish that job, set only that fixture's `updated_at = now() - interval '61 seconds'`, and assert #64 recovery publishes it. Verify one provider attempt per claim, no reset to `attempts=0`, exhaustion at 3, and exactly one dead-letter.
- [ ] Add a RabbitMQ topology integration test parameterized as `producer-first` and `worker-first`. Create separate producer and worker confirm channels through `RabbitMqService`; both setup callbacks call `assertGameEnrichmentTopology`, while only the worker callback adds `prefetch(1)`/`consume`. In `producer-first`, wait for producer setup, confirm-send persistent `{ gameId }` before creating the worker channel, then start the worker and assert it receives that exact retained message. In `worker-first`, initialize the worker before the producer and verify the same delivery. Fail on channel error/close and assert neither order produces `PRECONDITION_FAILED`; ACK and purge the three queues between cases.
- [ ] Run `npm --prefix backend run typecheck`, `npm --prefix backend run lint`, `npm --prefix backend test -- --runInBand`, `npm --prefix backend run build`, and `npm run docker:test:backend` against the isolated stack. Record actual exit status and any unavailable Docker/provider dependency. Run fresh-init and one-time warnings migration on separate disposable databases; preserve V1/lifecycle data and job counts.
- [ ] Hand #66 the exact durable payload expectation (`rawg_payload.id/name`, optional Windows requirement text), `{ gameId }` route, `status='queued' AND attempts=0` initial-publication predicate, and mandatory `createConfirmChannel(assertGameEnrichmentTopology)` producer setup. Shared topology gives #66 no authority to publish retries or touch attempts after #64's first claim. Also hand it the public attribution rule: when an approved page displays any PCGamingWiki-derived field, expose only the canonical persisted source URL with link text `Source: PCGamingWiki`, never raw provenance or provider text. Hand #65 the migration-003 ordering, persisted `warnings`/`missing_fields`, and completed-with-warnings approval behavior. Commit verification changes as `test(backend): verify enrichment delivery and replay`.

## Readiness, Order, and Release Gate

- #64 is ready to implement from current `staging` using committed/mocked RAWG, MediaWiki, and Gemini fixtures; live provider access is not required for implementation or CI.
- #66 may be developed in parallel against the frozen message, payload, shared `assertGameEnrichmentTopology`, and `attempts=0` initial-delivery contract. The shared declaration prevents broker inequivalence; #64 still owns every delivery after the first successful claim.
- #65 must base on #64 after `warnings` migration 002 lands, consume persisted warnings, and number its moderation schema migration 003.
- Before production only, the deployment owner records confirmation that the site's use of PCGamingWiki-derived data is compatible with the source's stated CC BY-NC-SA terms. The release also verifies the #66 public attribution link above. This gate neither blocks #64 implementation nor asserts a legal conclusion.

Plan complete: every issue #64 acceptance scenario and each Review Focus risk maps to an executable test step; the settled source, retry, migration, ordering, and release contracts above are implementation inputs.

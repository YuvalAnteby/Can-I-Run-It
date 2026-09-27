# RAWG Discovery and Pending Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a proposal for approval; no implementation is authorized by this plan alone.

**Goal:** Let a visitor discover a RAWG game, select it once, view a pending page, and request a compatibility estimate before admin publication.

**Architecture:** Keep the existing published catalog and `/api/v1/check` paths intact. Add a read-only mixed search, a server-side RAWG selection transaction backed by the existing unique `rawg_id` and one-job-per-game constraints, and explicit pending page/check routes. Initialize RabbitMQ through the exact shared #64 topology setup, then publish durable `{ gameId }` messages only for never-claimed queued jobs, leaving retry delay and dead-lettering to #64 after its first claim. Reuse the existing Gemini, response-builder, and game DTO paths.

**Tech Stack:** NestJS, TypeORM/PostgreSQL, existing RabbitMqService, Node `fetch`, React Query, React Router, Jest/Supertest, Vitest/MSW. No new dependency or schema is planned.

**Spec:** [GitHub #66](https://github.com/YuvalAnteby/Can-I-Run-It/issues/66), [#62 lifecycle](https://github.com/YuvalAnteby/Can-I-Run-It/issues/62), [#52 messaging](https://github.com/YuvalAnteby/Can-I-Run-It/issues/52), and V1 [#54](https://github.com/YuvalAnteby/Can-I-Run-It/issues/54), [#56](https://github.com/YuvalAnteby/Can-I-Run-It/issues/56), [#57](https://github.com/YuvalAnteby/Can-I-Run-It/issues/57). Read the local `docs/superpowers/plans/2026-09-13-v2-game-lifecycle.md` and `docs/superpowers/plans/2026-09-13-v2-rabbitmq.md` before execution; they may be outside the committed base of this planning branch.

## Global constraints and contracts

- Base inspected: `c99a8210cdc8944b1c5fb2e98cdaa3e1104ea7b1`. Re-read integrated code before implementation. #66 and #64 may implement in parallel against the frozen `{ gameId }`/`rawgPayload` contract below; #65 follows #64 because approval consumes the worker's final job/warnings contract.
- `Game.status` is exactly `pending_approval | published | rejected`. `rawg_id` is unique across all statuses. `game_enrichment_jobs.game_id` is unique, so there is one current job row per game. Publication state never doubles as job state.
- `GAME_ENRICHMENT_QUEUE` and `GameEnrichmentMessage` in `game-lifecycle.contract.ts` define the queue and exact message `{ gameId: positiveInteger }`. #66 owns initial confirmed delivery and replay only while the persisted job is `status='queued' AND attempts=0`. #64 increments `attempts` when it claims; from then on #64 exclusively owns retry delay, retry publication, dead-lettering, and acknowledgement after commit. #65 owns approval/rejection and must not expose a pending prediction through published queries before approval.
- #64 extends the existing `backend/src/modules/games/game-lifecycle.contract.ts` as the single topology declaration site. Alongside `GAME_ENRICHMENT_QUEUE='game.enrichment'`, it defines `GAME_ENRICHMENT_RETRY_QUEUE='game.enrichment.retry'`, `GAME_ENRICHMENT_DEAD_QUEUE='game.enrichment.dead'`, and `GAME_ENRICHMENT_RETRY_TTL_MS=60_000`, and exports `assertGameEnrichmentTopology(channel)`. #64's worker and #66's `EnrichmentPublisher` call that same function instead of declaring queues independently. The setup asserts, in order: dead `{ durable: true, exclusive: false, autoDelete: false, arguments: {} }`; main with the same base flags plus default-exchange dead-letter routing to `GAME_ENRICHMENT_DEAD_QUEUE`; then retry with the same base flags, `x-message-ttl: 60_000`, and default-exchange routing to `GAME_ENRICHMENT_QUEUE`. Both sides use these exact queue arguments, preventing RabbitMQ `PRECONDITION_FAILED` regardless of initialization order.
- Existing `GET /api/v2/games`, `GET /api/v2/games/:slug`, and `POST /api/v1/check` stay published-only. A RAWG search result is never a local game. No search request writes a row or publishes a job.
- RAWG calls and `RAWG_API_KEY` stay in backend. Unit tests and CI mock the provider and never need a live key. A missing key, timeout, 429, or other provider error leaves local search usable, so credentials are not an implementation blocker. Never return the key, raw payload, field-level metadata provenance, rejection reason, or broker detail in public DTOs/logs.
- RAWG's [official API page](https://rawg.io/apidocs) requires an API key on every request, an active backlink from every page using RAWG data, and an account tier appropriate to the deployed site's use. `RAWG_API_KEY` and owner confirmation of the account tier are production/live-provider prerequisites, not blockers for mocked implementation or CI. Keep active RAWG links on discovery results and both pending and normal published detail pages for RAWG-imported games. The provider endpoint reference is [RAWG games API](https://api.rawg.io/docs/).
- PCGamingWiki's [official copyright page](https://www.pcgamingwiki.com/wiki/PCGamingWiki:Copyrights) says its content is CC BY-NC-SA unless otherwise noted. Expose one sanitized PCGamingWiki attribution link when displayed data has accepted PCGamingWiki provenance, without exposing field-level provenance. Owner confirmation that the deployed site's use is license-compatible is a production prerequisite, not an implementation or CI blocker.
- Keep the V1 result states, source/provider/confidence/target-FPS wording and rate limit. Heuristic runs only with a structured `GameRequirement` row. A RAWG payload's free-text requirements are not structured requirements.

## Review Focus

1. **Topology equivalence and startup order:** producer-first and worker-first initialization must use identical main/retry/dead declarations without `PRECONDITION_FAILED`, and a confirmed persistent message published before the worker starts must remain available. Task 2 adds shared-setup unit coverage and both real-broker initialization-order integration cases.
2. **Retry ownership after the first claim:** a job that is still `queued` with `attempts > 0` must never be selected or published by #66. Task 2 adds a publisher unit test and isolated broker/DB E2E assertion; #64's tests own retry timing and dead-letter exhaustion. Concurrent/repeated selection remains covered by Task 2's service and E2E cases.
3. **Provider configuration/outage boundary:** a missing key, timeout, 429, malformed response, or 5xx must preserve local discovery and perform no write. Task 1 covers mocked service/controller tests; Task 5 covers the local-results UI state without live RAWG.
4. **Attribution without private-data leakage:** RAWG links must appear on discovery, pending, and approved published detail; PCGamingWiki links appear only when displayed fields have accepted PCGW provenance; seeded/non-RAWG games omit `attributions`; no `rawgPayload` or provenance map is public. Tasks 1, 3, and 5 add DTO, mapper, MSW/RTL, and isolated E2E assertions.
5. **Publication transition and route stability:** pending detail/check stay ID-based and unpublished data stays hidden, while an approved pending response carries published status/slug and the frontend redirects to `/games/:slug` without changing the frozen route/DTO shapes. Tasks 3-5 cover service, check, redirect, and visibility E2E tests.

## File map and public interfaces

| Area | Planned files | Responsibility |
| --- | --- | --- |
| RAWG HTTP | Create `backend/src/modules/games/rawg.service.ts` and `.spec.ts`; modify `infra/.env.example`, dev/prod/test Compose backend environment | Bounded `GET /games?search=` and `GET /games/{id}`; validate minimal provider shape; backend-only key |
| Discovery/selection | Create `backend/src/modules/games/game-discovery.service.ts` and `.spec.ts`, `dto/discover-games.dto.ts`, `dto/select-rawg-game.dto.ts`; modify `games.controller.ts`, `games.controller.spec.ts`, `games.module.ts`, `igames.repository.ts`, `games.typeorm.repository.ts` and its spec | Mixed read-only search and transactional select/reuse by `rawg_id` |
| Job publication | Create `backend/src/modules/games/enrichment-publisher.service.ts` and `.spec.ts`; consume #64's shared topology from `backend/src/modules/games/game-lifecycle.contract.ts`; import `MessagingModule` in `games.module.ts` | Initialize the exact shared dead/main/retry topology, then confirm durable `{ gameId }` sends and bounded replay of `queued/attempts=0` rows |
| Page DTO | Modify `games.service.ts`, `games.service.spec.ts`, `dto/client-game.dto.ts`, `games.constants.ts`; add controller/repository coverage | Same normalized game DTO for published and explicit pending page, with sanitized optional public attributions |
| Pending check | Modify `backend/src/modules/check/check.controller.ts`, `check.service.ts`, `check.service.spec.ts`; create `dto/pending-check-request.dto.ts` | Internal-ID pending check, Gemini-only cache lookup, shared result builders |
| Frontend | Modify `frontend/src/@types/game.types.ts`, `@types/check.types.ts`, `pages/main_page/useGameSearch.ts`, `HeroSearch.tsx` and test, `pages/game_detail/useGameDetail.ts`, `useGameDetailForm.ts`, `useHardwareCheck.ts`, `GameDetailPage.tsx`, `components/GameHero.tsx`, `router.tsx`, and MSW handlers/tests | Distinguish sources, select RAWG, render pending defaults/attributions, submit internal ID |
| Integration | Add `backend/test/rawg-discovery.e2e-spec.ts` using the isolated test stack | DB write boundary, concurrent selection, producer/worker topology order, early-message durability, initial-delivery ownership, visibility, attribution, provider/broker failure, prediction linkage |

Accepted route/DTO contract (frozen for #64/#66 parallel implementation):

```ts
GET  /api/v2/games/discover?q=<trimmed title>
// { data: Array<
//   { source: 'local'; id: number; slug: string; name: string; coverImageUrl: string | null }
// | { source: 'rawg'; rawgId: number; name: string; coverImageUrl: string | null; rawgUrl: string }
// >; rawgAvailable: boolean }
POST /api/v2/games/rawg/:rawgId/select
// { id: number; slug: string; status: 'pending_approval' | 'published' }
GET  /api/v2/games/pending/:id // ClientGameDto; pending or newly published, never rejected
POST /api/v2/check/pending/:gameId // { hardware, settings } -> existing CheckResponseDto

type PublicAttributionDto = {
  source: 'rawg' | 'pcgamingwiki';
  label: 'RAWG' | 'PCGamingWiki';
  url: string;
};

// ClientGameDto additions/normalization:
// status: 'pending_approval' | 'published'
// tags: string[]
// requirements: ClientGameRequirementDto[]
// attributions?: PublicAttributionDto[] // omitted when empty
```

`rawgAvailable: false` means the provider was unavailable; it does not change local results. The RAWG discovery branch's `rawgUrl` is the active search attribution link. `GET /pending/:id` returns the published status/slug after approval, and the accepted frontend behavior is to replace that route with `/games/:slug`. The pending check itself accepts only `pending_approval`; after approval the normal published check path applies. Public status/slug/ID and sanitized `attributions` are safe; private RAWG payload and field-level provenance remain internal.

## Task 1: Read-only mixed search

**Interfaces:** Consumes published `IGamesRepository.findAll(FilterGameDto)`. Produces the `discover` response above. Search has no `save`, `insert`, transaction, or broker call.

- [ ] Add a failing `GameDiscoveryService` test: a local-only result stays available when RAWG is missing/timed out/429; a mixed response has explicit `source` on every row; each RAWG row has an active sanitized `rawgUrl`; no repository write or publisher method is called. Add a controller test for trimmed nonempty query and an empty/overlong query returning 400. Mock every provider call; no unit or CI test uses a live key.
- [ ] Implement `RawgService.search(q)` with Node `fetch`, `AbortSignal.timeout(3_000)`, `URL`/`URLSearchParams`, `page_size=8`, and the key only in the server request. Cap q at 100 chars and provider results at 8. Treat malformed response, missing key, timeout, 429, and 5xx as unavailable, with sanitized Nest Logger messages. Validate positive integer IDs, nonblank names, and provider slugs matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` before mapping. Construct `rawgUrl` with `new URL(`/games/${slug}`, 'https://rawg.io').toString()`; never return a provider-supplied URL or trust provider image URLs blindly.
- [ ] Add `GET /discover` before `GET /:slug` in `GamesController`. Query the existing published catalog (`limit: 8`) and RAWG independently; return local data even when RAWG fails. Drop RAWG hits whose `rawgId` is already published locally or rejected, using a read-only ID/status lookup; pending RAWG hits may remain selectable. Never infer identity from title alone.

  ```ts
  const [local, rawg] = await Promise.all([
      gamesRepository.findAll({ search: q, limit: 8, page: 1 }),
      rawgService.search(q), // { results: [], available: false } on provider failure
  ]);
  // Map only published local rows and validated RAWG hits to source-tagged DTOs.
  // The RAWG branch includes a server-constructed https://rawg.io/games/<slug> link.
  // No selection/import method is called by this route.
  ```
- [ ] Run `npm --prefix backend test -- --runInBand rawg game-discovery games.controller` and `npm --prefix backend run typecheck`. Commit only implementation-session work as `feat(games): add read-only RAWG discovery`.

## Task 2: Idempotent selection and durable enrichment publication

**Interfaces:** Consumes `RawgService.getById(rawgId)`, `Game`, `GameEnrichmentJob`, `RabbitMqService.createConfirmChannel`, and #64's `assertGameEnrichmentTopology(channel: ConfirmChannel): Promise<void>` plus its queue constants from `game-lifecycle.contract.ts`. Produces one game row and one current queued job per new RAWG ID; message body is exactly `{ gameId }`. The retained `rawgPayload` contract with #64 is an object whose positive integer `id` equals `Game.rawgId`, whose `name` is nonblank, and whose validated `slug` is retained for safe attribution.

- [ ] Write failing unit/integration cases: invalid/nonexistent RAWG ID has no write; two concurrent selects return the same internal ID and one job row; existing pending selection changes neither metadata nor job state; existing published returns its public slug; existing rejected returns 409 and stays rejected; an equal title with a different RAWG ID does not attach to the local row. In `EnrichmentPublisher` unit coverage, assert `createConfirmChannel` receives the imported `assertGameEnrichmentTopology` function and the publisher contains no independent `assertQueue` calls; reuse #64's contract test for the exact three names, dead/main/retry declaration order, durability, DLX routing keys, default exchange, and 60-second TTL. Seed `queued/attempts=0`, `queued/attempts=1`, and `queued/attempts=2`; assert only the first job is selected and sent.
- [ ] On selection, first look up an existing `rawg_id`; fetch server-side RAWG detail only for a missing ID. Require the fetched ID to equal the path ID, a nonblank name, and a slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Map only initial known fields, clipping to entity column lengths, with nullable fields left null, feature booleans false only as placeholders, and field provenance only for values actually supplied. Retain the validated detail object, including `id`, `name`, and `slug`, in `rawgPayload`; do not parse free-text requirements or create `GameRequirement` rows here.
- [ ] Inside one PostgreSQL transaction, insert/reuse by the unique `rawg_id` constraint and insert the one `queued` `GameEnrichmentJob`. On `23505`, let that transaction roll back, then re-read `rawg_id` outside it; if a row won the race, return it. If the conflict was instead with an unrelated slug, retry the transaction with a deterministic `-rawg-<id>` suffix; never merge on title or slug. Do not reset `processing`, `completed`, or `failed` jobs on reselection.

  ```ts
  // Shape of the atomic write; catch 23505 outside this transaction and re-read rawg_id.
  await dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Game, { where: { rawgId } });
      if (existing) return existing;
      const game = await manager.save(Game, normalizedRawgGame);
      await manager.save(GameEnrichmentJob, { game, status: 'queued' });
      return game;
  });
  // Never continue inside a PostgreSQL transaction after its unique violation.
  ```

- [ ] After the new-game transaction commits, ask `EnrichmentPublisher` to perform the initial send. Create its confirm channel with the imported `assertGameEnrichmentTopology` callback; do not redeclare even the main queue locally. The shared callback must finish all three exact queue assertions before the channel confirms persistent JSON `{ gameId }` with a 5-second send deadline. If RabbitMQ is unavailable, selection still returns the pending ID and the database job remains `queued` with `attempts=0`. On startup and every 15 seconds, scan at most 100 jobs matching exactly `status='queued' AND attempts=0`; never publish `queued` rows with `attempts>0`. Keep an in-process set of confirmed job IDs to avoid flooding before #64 claims, while allowing one replay after process restart. Permit only one in-flight send per game. A duplicate after an uncertain confirm is safe because #64 claims the one job idempotently. Once #64 claims and increments `attempts`, #66 is permanently out of that job's delivery path; topology initialization does not transfer retry ownership, so #64 alone owns retry delay/publication and dead-lettering. Clear timer/channel on shutdown. Do not mutate job status, attempts, or timestamps in the producer.

  ```ts
  const channel = rabbitMqService.createConfirmChannel(
      assertGameEnrichmentTopology,
  );
  const initialJobs = await jobs.find({
      where: { status: 'queued', attempts: 0 },
      relations: ['game'],
      take: 100,
      order: { id: 'ASC' },
  });
  for (const job of initialJobs) {
      await channel.sendToQueue(GAME_ENRICHMENT_QUEUE, { gameId: job.game.id }, {
          persistent: true,
          timeout: 5_000,
      });
  }
  // Record the in-process dedup marker only after confirm; never update the job row.
  // Queue assertions exist only inside assertGameEnrichmentTopology.
  ```
- [ ] Add real-broker initialization-order coverage on the isolated stack. In one case initialize #66's publisher first, confirm-publish a persistent `{ gameId }` before registering #64's consumer, assert the main queue holds the message, then initialize the worker and assert it receives that same message. In a fresh isolated broker/vhost case initialize the worker first and publisher second. Both orders must open healthy channels with no `PRECONDITION_FAILED`; the shared-helper unit test pins the exact arguments. Keep the ownership assertion in the same integration suite: a selected game persists with one `queued/attempts=0` row while the broker is down and later sends `{ gameId }`; after simulating #64's first claim and return to `queued` with `attempts=1`, restart/run #66's scanner and assert no message is published; repeated selection/replay adds no game or job. Run `npm --prefix backend test -- --runInBand game-discovery enrichment-publisher`, `npm --prefix backend run typecheck`, and the targeted isolated E2E test. Commit `feat(games): import selected RAWG games and publish enrichment jobs`.

## Task 3: Normalized pending game page

**Interfaces:** Consumes the same `GamesService.mapToClientDto(Game)` as published detail; produces `ClientGameDto` with `status`, `requirements: []`, `tags: []`, nullable missing metadata, and optional sanitized `attributions`. A valid RAWG import gets one RAWG link on pending and published detail. A game displaying accepted PCGamingWiki-derived fields gets one PCGamingWiki link. Seeded/non-RAWG games omit `attributions`. No raw payload or field-level provenance leaves the service.

- [ ] Write failing service/controller tests for a newly imported game with no art, date, publisher, tags, or requirements. Assert a complete DTO with `coverImageUrl: null`, nullable metadata, `tags: []`, `requirements: []`, `status: 'pending_approval'`, and one safe RAWG attribution; assert no `rawgPayload`, provenance, or rejection reason keys. Assert the same RAWG attribution remains on normal published detail after approval, accepted displayed PCGamingWiki provenance adds one sanitized PCGamingWiki attribution, invalid/unrelated provenance URLs are omitted, and seeded/non-RAWG games have no `attributions` property. Assert rejected is 404 and published is redirected by status/slug in the frontend.
- [ ] Extend the existing DTO mapping once. Add explicit `findPendingPageById` repository lookup for pending/published only; retain existing `findBySlug` and list published filters. For published games also return the normalized array defaults, status, and any applicable attributions. Build the RAWG URL only when `rawgPayload.id === rawgId` and its slug passes the frozen validation, using the fixed `https://rawg.io/games/` origin. Add one PCGamingWiki attribution only when at least one public field actually returned by the DTO has accepted `source='pcgamingwiki'` provenance and its source URL has exact origin `https://www.pcgamingwiki.com` with a `/wiki/` path; strip query/hash and deduplicate by source. Keep mock endpoints static and update their DTO fixtures only for added required fields.

  ```ts
  // Use one mapper for published and selected pages.
  const attributions = this.mapPublicAttributions(game);
  return {
      ...existingPublicFields,
      status: game.status,
      coverImageUrl: game.coverImageUrl ?? null,
      tags: game.tags ?? [],
      requirements: (game.requirements ?? []).map(mapRequirementToDto),
      ...(attributions.length ? { attributions } : {}),
  };
  ```
- [ ] Update the detail page to show a local placeholder when the image is null, omit empty publisher/date separators, display an explicit “Requirements not available yet” state, and label the page “Pending review.” Render every provided attribution as an active accessible external link. Extend the isolated E2E case through approval and normal published detail: RAWG remains linked, PCGamingWiki appears beside it when accepted displayed provenance exists, and seeded/non-RAWG detail has no attribution field/link. Run focused backend and frontend tests. Commit `feat(games): expose normalized pending game pages`.

## Task 4: Pending compatibility through internal game ID

**Interfaces:** `POST /api/v2/check/pending/:gameId` uses the existing `HardwareDto`, `SettingsDto`, `CheckResponseDto`, `GeminiService.estimate`, and response builders. It selects a `Game` by internal ID and `pending_approval` status; the published slug route remains unchanged.

- [ ] Write a failing check test: pending ID bypasses measured lookup completely, looks for a stored `source='gemini'` row for exact game/CPU/GPU/RAM/resolution/preset/upscaler/quality, returns the cached AI source when present, and never calls Gemini in that case. Validate positive ID and existing CPU/GPU through the same trust boundary as V1.
- [ ] Extract the shared validated hardware/provider/fallback part of `CheckService` instead of copying the V1 pipeline. The pending branch queries only Gemini rows; the published branch still prioritizes measured rows. Match #54's exact identity, including upscaler and quality, and store the new Gemini row against the internal game ID with `source='gemini'` and null 1%-low. A concurrent duplicate estimate may produce two rows in the current V1 schema; choose the newest cached row on the next request rather than adding a speculative schema migration here.

  ```ts
  // Pending cache lookup never queries measured rows.
  const cached = await perfRepo.findOne({
      where: {
          game: { id: gameId }, cpu: { id: hardware.cpuId },
          gpu: { id: hardware.gpuId }, ramGb: hardware.ramGb,
          resolutionWidth: settings.resolutionWidth,
          resolutionHeight: settings.resolutionHeight,
          settings: settings.preset,
          upscaler: settings.upscaler ?? UpscalerType.OFF,
          upscalerQuality: settings.upscalerQuality ?? IsNull(),
          source: 'gemini',
      },
      order: { createdAt: 'DESC' },
      relations: ['gpu'],
  });
  ```
- [ ] Reuse `buildResponseFromRecord`, `buildResponseFromGemini`, and `buildResponseFromFallback`. Only call the heuristic when `game.requirements` contains a structured row; RAWG free text does not count. If Gemini is unavailable and no structured row exists, return the existing `Insufficient data` response. Preserve the shared rate limit and frontend source badges.
- [ ] Add isolated E2E assertions that the pending check can run immediately after selection, a saved Gemini row is joined to that game's ID, public list/detail/search/check still exclude the pending game and linked result, and approval later makes that row eligible through the published path. The approval transition itself belongs to #65. Run `npm --prefix backend test -- --runInBand check`, `npm --prefix backend run typecheck`, and targeted E2E. Commit `feat(check): allow pending game predictions by internal ID`.

## Task 5: Search-to-pending frontend flow and release gate

**Interfaces:** A discriminated search result drives local navigation to `/games/:slug` or a RAWG selection mutation followed by `/pending-games/:id`. Pending check submits `{ hardware, settings }` to `/v2/check/pending/:id`; published pages keep `/v1/check` with `gameSlug`. The frontend renders only backend-supplied `rawgUrl`/`attributions` and never derives links from private provider data.

- [ ] Add failing MSW/RTL tests for local-only, mixed-source labels and active RAWG search links, RAWG unavailable with local results, selection loading/error/success, repeated click disabled while selecting, null-image/metadata/requirements page, pending check, and the accepted published redirect. Assert pending and approved published RAWG pages render the RAWG link; a published PCGamingWiki-derived DTO renders the PCGamingWiki link beside it; a seeded DTO with no `attributions` renders no attribution container. Keep search and link keyboard/screen-reader labels explicit.
- [ ] Switch `useGameSearch` to `/v2/games/discover` while preserving its 300-ms debounce and React Query key. Add a React Query mutation for RAWG selection using `nestClient`. Navigate only after the POST succeeds; show a retryable error when it fails. Key result rows by source plus ID, not numeric ID alone.
- [ ] Add `/pending-games/:id` to `router.tsx`; reuse `GameDetailPage` and its form by passing the page's game ID/status into `useHardwareCheck`. Keep the published route unchanged. When the pending response has `status='published'`, replace-navigate to `/games/:slug`; this redirect is part of the frozen contract. Use the normalized DTO defaults for empty states and render sanitized links verbatim; do not interpret raw provider payload or provenance in React.
- [ ] Run `npm --prefix frontend test -- --run`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`, `npm --prefix backend run lint`, `npm --prefix backend run build`, and `npm run docker:test:backend` on an isolated stack. Record actual results, including provider/broker outage probes; do not touch the development or production database. Commit `feat(frontend): open RAWG discoveries as pending games`.

## Integration handoff and release prerequisites

- #66 and #64 may implement in parallel against the frozen message/payload/topology boundary: exact `{ gameId }`, retained `rawgPayload` with matching positive `id`, nonblank `name`, and validated `slug`, plus the single shared dead/main/retry setup above. #64 loads provider data from PostgreSQL rather than the message. Integration keeps the sole topology declaration in `game-lifecycle.contract.ts`; neither feature may retain a local queue declaration.
- #66 initializes the shared topology but performs only initial delivery for `queued/attempts=0`. #64 claims the current job, increments `attempts`, ignores stale/published/rejected work, and exclusively owns every retry delay/publication and dead-letter decision after that claim. A `queued/attempts>0` row is never republished by #66; declaring retry/dead queues does not grant #66 permission to publish to them.
- #65 follows #64's finalized job/warnings contract. It publishes only after the job is completed, keeps rejected `rawg_id` reserved, and lets linked Gemini rows become visible solely through published game status. No per-performance visibility flag is needed.
- #67 should integrate the public frontend flow in this plan with the admin UI without changing the frozen source/status/attribution DTOs or published-after-pending redirect. Reconcile shared module, Compose, and frontend route edits additively.
- Implementation and CI proceed with mocked RAWG/PCGamingWiki providers. Production/live-provider deployment requires an owner-supplied `RAWG_API_KEY`, confirmation that the selected RAWG account tier fits deployed use, and confirmation that use of PCGamingWiki-derived content is compatible with its CC BY-NC-SA terms. Missing approval or credentials disables live provider use; it does not disable local catalog search.

## Self-review

- **Spec coverage:** issue #66's local/mixed/no-write search, idempotent selection, shared topology/startup order, early-message availability, initial-delivery ownership, normalized pending/published pages, internal-ID prediction, hidden unpublished data, provider errors, source-aware frontend, and provider attribution all map to Tasks 1-5 and the Review Focus tests.
- **Placeholder scan:** no placeholder or fill-in step remains; deployment confirmations are explicit release prerequisites rather than implementation questions.
- **Type consistency:** routes use `rawgId` only for provider selection and `gameId`/`id` for local pending operations; queue messages remain exactly `{ gameId }`; both broker users consume `assertGameEnrichmentTopology(channel: ConfirmChannel): Promise<void>` and the same queue constants from `game-lifecycle.contract.ts`; `status`, normalized arrays, and optional `attributions: PublicAttributionDto[]` are consistent across backend and frontend tasks.
- **Scope:** #66 does not extract PCGamingWiki data, implement #64 retries, add admin screens, add a cache service/schema migration, or deploy externally. It only projects sanitized attribution from #64's accepted provenance.

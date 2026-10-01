# Issue #77 Quota / Abuse Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow the explicit model and file ownership rules below.

**Goal:** Bound expensive requests and provider work for the single-process demo while proving that deployed IP limits cannot be bypassed with forwarded headers.

**Architecture:** Keep the existing route-scoped guard and provider fallback contracts. Inject one singleton abuse-protection service into guards and provider clients to own fixed-window budgets, fail-fast concurrency permits, and fixed-label event counters. Retain one-hop proxy trust only on a verified ingress-only path; enforce one backend replica in the actual deployment configuration.

**Tech Stack:** Existing NestJS 11 / Express, ConfigModule, TypeScript, Jest / Supertest, Node fetch / AbortController, Google GenAI SDK, Docker; no new dependencies.

**Spec:** [GitHub issue #77](https://github.com/YuvalAnteby/Can-I-Run-It/issues/77), retrieved 2026-10-01. This plan is planning-only; implementation and tests are future work.

**Base revision:** Revised after issue #75 merged, for `codex/issue-77-quota-abuse-protection` based on `origin/staging` commit `1c986b7` (`feat(health): add liveness, readiness, and Azure probes (#79)`). The initial plan assumed an older base without Terraform; this revision reuses the newly existing app-only Terraform and removes the proposed Azure enforcement scripts.

## Global Constraints

- No Redis, distributed limiter, WAF, APIM, authentication, or multi-replica infrastructure.
- Preserve 10 accepted expensive requests/minute/IP, 100/minute globally, and 30 new Gemini calls/minute as default application budgets.
- Scope limiting to POST `/api/v1/check`, POST `/api/v2/check/pending/:gameId`, GET `/api/v2/games/discover`, and POST `/api/v2/games/rawg/:rawgId/select`.
- Keep cheap catalog/hardware/pending-page/health reads open; no APP_GUARD applying indiscriminately.
- Preserve guard HTTP 429 with meaningful integer-seconds `Retry-After`; provider exhaustion preserves existing fallback response contracts.
- Constructor injection, Nest Logger, standard Nest exceptions, mocked external dependencies in unit tests, seeded isolated PostgreSQL for E2E.
- `infra/.env` remains the local environment source; update its tracked `.env.example`, never secrets. Docker inter-service addresses use service names.
- Conventional Commit messages; never add an agent co-author. Do not commit during this planning request.
- GPT-6.1 Sol high owns planning/reviews only. Future production implementation is GPT-5.6 Luna max. A **separate** GPT-5.6 Luna max subagent owns all test creation and edits; the production implementer must not edit test files.

## Findings and decisions

- `CheckModule` and `GamesModule` independently provide `CheckRateLimitGuard`, whose maps/windows are instance fields. Existing tests prove 100/minute for one manually constructed guard, not a whole-process mixed-route budget. Use shared injected state rather than relying on exporting a guard: [Nest's current guard context creator](https://github.com/nestjs/nest/blob/master/packages/core/guards/guards-context-creator.ts) resolves class guards through module-local injectables. The exact installed version must be checked at implementation time; a real Nest HTTP test is the definitive regression check.
- `main.ts` already enables `trust proxy = 1` only for `TRUST_PROXY=1`; its private-Nginx comment is stale. Production docs describe a static Azure frontend calling a public backend URL; no Nginx configuration or frontend production image exists here. `rawg-discovery.e2e-spec.ts` currently trusts every proxy (`true`) and rotates synthetic forwarded addresses.
- Published and pending checks read exact persisted performance records before calling Gemini. Keep `CheckService` production code unchanged unless a test exposes a regression. Gemini currently coalesces by its normalized prompt, has an 8-second timeout race, and returns null on failure. RAWG has a 3-second abort timeout, local discovery fallback, and selection returns 404 on unavailable detail without writing.
- Add no waiting queue: admission failure immediately returns the existing provider-unavailable result. Count only newly admitted outbound operations; duplicates, missing keys, and concurrency denials consume no provider minute budget. Failed admitted attempts do consume budget.
- RAWG evaluation: repeated detail selection already avoids calls after DB persistence, but concurrent selection misses call the provider repeatedly (the current selection E2E launches three requests). Add **in-flight coalescing only** in the shared RAWG request path: three simultaneous identical requests must make one fetch. Defer completed-response TTL caching because no measured sequential discovery hit rate exists and local moderation results must stay fresh. Continue merging/filtering fresh local DB results on every discovery request.
- `infra/terraform/main.tf` now already enforces `revision_mode = "Single"`, `template.min_replicas = 1`, `template.max_replicas = 1`, and 100% latest-revision traffic. `variables.tf` exposes no replica/revision override and supplies backend runtime maps plus validated probe/ingress port configuration. Preserve these constants and the health probes; no Terraform code change or enforcement script is needed. CD still publishes images only; actual Terraform application, state/resource ownership, and deployed read-back remain release gates (Task 4).

## Configuration contract

Create `backend/src/config/abuse-protection.config.ts` exporting `validateAbuseProtectionConfig(env: Record<string, unknown>): Record<string, unknown>`; return the existing env merged with normalized values. Wire it to `ConfigModule.forRoot({ isGlobal: true, validate: validateAbuseProtectionConfig })`. Validation must complete before DB/provider initialization.

| Key                                    | Default | Allowed values                                   |
| -------------------------------------- | ------: | ------------------------------------------------ |
| `EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE` |      10 | integer 1..1000                                  |
| `EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE` |     100 | integer 1..10000; at least per-IP limit          |
| `GEMINI_REQUESTS_PER_MINUTE`           |      30 | integer 1..1000                                  |
| `RAWG_REQUESTS_PER_MINUTE`             |      60 | integer 1..1000                                  |
| `GEMINI_MAX_CONCURRENT`                |       2 | integer 1..16; no greater than its minute budget |
| `RAWG_MAX_CONCURRENT`                  |       4 | integer 1..16; no greater than its minute budget |
| `GEMINI_TIMEOUT_MS`                    |    8000 | integer 100..60000                               |
| `RAWG_TIMEOUT_MS`                      |    3000 | integer 100..60000                               |
| `TRUST_PROXY`                          |     `0` | strings `0` or `1` only                          |

Absent keys get defaults. Explicit blank, fractional, negative, zero, NaN, Infinity, scientific-notation strings, trailing garbage, booleans, and out-of-range values fail startup, naming the offending key without dumping env/secrets. Accept actual integer numbers or decimal digit strings for numeric keys. The 60-second fixed window remains constant; do not add window tuning. Defaults are application safety ceilings, not promises that the provider account has matching RPM/TPM/RPD capacity.

## Shared interfaces and files

Create `backend/src/common/abuse-protection/abuse-protection.module.ts`: `@Global()` module providing/exporting exactly one `AbuseProtectionService`; import once in `AppModule`. Leave existing guard registrations/decorators intact; multiple stateless guard wrappers are safe because they inject the same service. Do not re-provide the shared service in feature modules.

Create `backend/src/common/abuse-protection/abuse-protection.service.ts` with these interfaces:

- `consumeExpensiveRequest(ip: string): number | null`: return null when admitted, otherwise positive seconds to the denying window reset. Count admissions at the guard (including later validation/DB failures), never guard denials. Retain existing fixed deadlines and periodic expired-IP cleanup; check global admission before creating a new IP bucket.
- `tryAcquireProvider(provider: 'gemini' | 'rawg'): (() => void) | null`: synchronously check concurrency and fixed-minute budget, then increment both only on admission; return an idempotent release function for active count only. No queue, budget refunds, retries, dynamic registries, or policy hierarchy.
- `recordEvent(event: AbuseEvent): void`: fixed union of `rate_limit.ip`, `rate_limit.global`, and `provider.{gemini|rawg}.{budget|concurrency|timeout|failure}`. Count every occurrence in bounded fields; emit the first occurrence then at most one aggregate warning per label per 60 seconds with accumulated count. Flush pending aggregates on `onApplicationShutdown(): void`; no logging timer. No raw IP, prompt, response body, key, URL containing credentials, or provider error/stack in emitted events.

`CheckRateLimitGuard` delegates its existing request.ip/socket fallback to `consumeExpensiveRequest`, then sets `Retry-After` and throws its existing exception on denial. Provider budgets and events belong to the same singleton; Gemini's existing pending map remains inside GeminiService and RAWG's pending map inside RawgClient.

## Review Focus

1. Two real Nest controller modules must share per-IP/global admission state; exporting a guard class alone is insufficient evidence (Task 1 HTTP test).
2. Rotating only the left side of a forwarded chain cannot rotate the trusted rightmost client bucket; direct untrusted traffic ignores forwarding (Task 3 HTTP tests and deployed gate).
3. A timeout must return fallback promptly while retaining its concurrency permit until underlying client work settles; late rejection must be handled (Task 2 deferred-promise tests).
4. Coalesced work joins before checking admission and consumes one provider request; failed/timeout work must eventually clear pending entries and permits (Task 2 tests).
5. Invalid explicit configuration must fail startup rather than silently remove protection, and repeated failure events must not flood logs or leak secrets (Task 1/2 tests).

## Task 1: Validated configuration and shared route admission

**Production owner:** GPT-5.6 Luna max. **Test owner:** separate GPT-5.6 Luna max.

**Files:** Create the config/service/module files above; modify `backend/src/app.module.ts`, `backend/src/common/guards/check-rate-limit.guard.ts`, `infra/.env.example`. Test owner creates `backend/src/config/abuse-protection.config.spec.ts`, `backend/src/common/abuse-protection/abuse-protection.service.spec.ts`, `backend/test/abuse-protection.e2e-spec.ts` and edits `backend/src/common/guards/check-rate-limit.guard.spec.ts`.

**Consumes:** ConfigService normalized keys. **Produces:** the three shared service interfaces above and one instance throughout AppModule.

- [ ] Test owner writes named cases `defaults_and_valid_overrides`, `rejects_invalid_explicit_limits_before_startup`, `ten_acceptances_then_429`, `fixed_window_retry_after_and_recovery`, `denials_do_not_consume_global_budget`, and `rotated_ips_stop_at_100`. Assertions: defaults 10/100/30/60/2/4/8000/3000/0; all table bounds; 11th same-IP request denied with 60 seconds at time zero, 1 second at 59001 ms, admission at 60000 ms.
- [ ] Test owner adds `mixed_real_nest_routes_share_limits`: import real AppModule, mock only providers (keep guard/state real), seeded dedicated E2E DB; combine check/discovery/selection admissions, assert the 11th combined request for one IP is 429, and 101st combined admission across at least 11 IPs is 429. A rejected per-IP request must leave global capacity available to another IP. Assert `Retry-After`; show catalog/CPU/GPU/health reads succeed after expensive budgets exhaust. Use isolated app instances/scenario setup and fake clock for reset, not minute-long sleeps.
- [ ] Run failing checks: `npm test --prefix backend -- --runInBand --runTestsByPath src/config/abuse-protection.config.spec.ts src/common/abuse-protection/abuse-protection.service.spec.ts src/common/guards/check-rate-limit.guard.spec.ts`; E2E command is in the verification section. Expected failure: missing config/shared provider or split-route budget, not a missing fixture or network error.
- [ ] Production owner implements the config contract, one global shared service, guard delegation, and `.env.example` values. Keep route decorators unchanged. Add the existing `ponytail:` process-local limitation to the shared state.
- [ ] Test owner runs checks to green; Sol reviews configuration rejection, DI/state ownership, route boundaries and memory cleanup. Future commit: `feat(backend): configure shared expensive request limits`.

## Task 2: Provider admission, safe timeout lifecycle, and bounded events

**Files:** Modify `backend/src/modules/gemini/gemini.service.ts`, `backend/src/modules/games/rawg.client.ts`, shared service as needed. Test owner edits their existing `.spec.ts`, `backend/src/modules/check/check.service.spec.ts`, `backend/src/modules/games/games.discovery.spec.ts`, and shared service tests. No change to existing public estimate/search/detail signatures.

**Consumes:** `tryAcquireProvider`, `recordEvent`, normalized timeouts. **Produces:** bounded actual client operations, preserved Gemini pending/DB reuse, and RAWG pending coalescing without completed-response TTL.

- [ ] Test owner adds deferred SDK/fetch tests: with concurrency 2/4, hold distinct admitted promises unresolved and assert the next distinct call returns null/unavailable without another SDK/fetch call or queued work; resolve/reject one and prove another call can start. Assert budget defaults and configured overrides, new-call counting, exhausted-minute recovery, and no budget consumption for rejected concurrency/missing-key requests.
- [ ] Test owner asserts identical Gemini requests (including omitted versus explicit off settings) join before admission, call upstream once, and still join while distinct-work slots or minute budget are full. RAWG identical normalized search and detail operations coalesce; different queries/IDs do not. After settled failure or success a later RAWG request is fresh; keys never leak into logs.
- [ ] Test owner adds `timeout_holds_permit_until_underlying_settles`: provider mock ignores abort; at configured deadline callers get fallback and signal is aborted, but a new distinct request cannot reuse that permit until the original SDK/fetch+body promise resolves/rejects. A late rejection is handled, discarded success is never persisted, and all deadline timers clear. Repeated identical requests while timed-out work is still unsettled must not start replacement upstream work.
- [ ] Test owner retains/asserts published and pending exact DB reuse without provider admission, heuristic fallback when requirements exist, insufficient-data fallback otherwise, RAWG local-only discovery, and unavailable RAWG selection 404 with no transaction/write. Cover upstream 429, 402, 503, network error, timeout, malformed payload, and key absence using mocks.
- [ ] Test owner asserts event counters increment for every denial/failure while emitted warnings are throttled by fixed label, timeout is distinguished from generic failure, provider-denial is not double-counted as a provider failure, and shutdown flushes pending counts. Existing log assertions are adjusted only by the test owner. Missing-key warnings move to constructor/startup rather than per request.
- [ ] Run provider/service tests red: `npm test --prefix backend -- --runInBand --runTestsByPath src/modules/gemini/gemini.service.spec.ts src/modules/games/rawg.client.spec.ts src/modules/check/check.service.spec.ts src/modules/games/games.discovery.spec.ts src/common/abuse-protection/abuse-protection.service.spec.ts`.
- [ ] Production owner integrates admission after Gemini pending lookup, before new provider calls. Keep existing deadline races/fallbacks, but release concurrency on settlement of the underlying SDK operation (RAWG includes response body consumption), never in the timeout-race finalizer. Handle both fulfillment/rejection on cleanup to avoid unhandled promises. Keep pending ownership until actual work settles, even if its outward result is already null. Bound pending maps by admitted concurrency; no unbounded denied-work entries.
- [ ] Production owner verifies the lockfile SDK retry behavior after `npm ci`; preserve one upstream attempt (explicit `httpOptions.retryOptions.attempts = 1` if supported by the installed types), and add no automatic app retry on quota/failure. RAWG pending key is path plus normalized request parameters excluding API key; trim/truncate search exactly as today, do not lowercase or otherwise change search meaning. Move repetitive provider failure logs into bounded event recording.
- [ ] Run tests green; Sol reviews permit/pending settlement separately from timeout response, duplicate counting, and fallback persistence. Future commit: `feat(backend): bound provider concurrency and quota events`.

## Task 3: Narrow forwarded-IP handling

**Files:** Modify `backend/src/main.ts`; test owner edits `backend/src/main.spec.ts`, `backend/test/rawg-discovery.e2e-spec.ts`, and `backend/test/abuse-protection.e2e-spec.ts`.

**Consumes:** validated `TRUST_PROXY`. **Produces:** explicit false/default or exactly one trusted hop; genuine HTTP tests rather than a mocked `set()` assertion alone.

- [ ] Test owner updates bootstrap mocks for `app.get(ConfigService)` and adds actual Express/Nest HTTP cases with trust false: forged forwarding does not change `request.ip`; trust 1: `X-Forwarded-For: 198.51.100.1, 203.0.113.10` yields `203.0.113.10`. Repeated left-value rotation sharing that rightmost address reaches the same 429 bucket; a different rightmost address has a separate bucket. Observe request.ip with test-only middleware, never a public diagnostic endpoint. Include IPv4/IPv6 valid chain cases and header absence.
- [ ] Test owner replaces the discovery E2E `trust proxy=true` with numeric 1 in its simulated proxy path and updates its setter type. Synthetic rightmost addresses there are test fixtures, not proof that a direct client may supply trusted forwarding in production.
- [ ] Run red: `npm test --prefix backend -- --runInBand --runTestsByPath src/main.spec.ts`; run the isolated HTTP E2E suite as below.
- [ ] Production owner reads trust setting from validated ConfigService (`app.get(ConfigService)`), retains numeric 1 and default false, and replaces stale Nginx comment with the verified ingress-only precondition. Never add a manual leftmost-header parser, `true`, broad private-range trust, or increased hop count.
- [ ] Run green; Sol checks deploy procedure against the official Azure/Express sources below. Future commit: `fix(backend): validate narrow ingress proxy trust`.

## Task 4: Enforce single-replica deployment and document release evidence

**Files:** Modify `docs/operations/demo-release.md` only. Read/reuse `infra/terraform/main.tf`, `infra/terraform/variables.tf`, and the existing lockfile; keep Terraform code unchanged unless a concrete deployed gap is discovered. No scripts, new Terraform resources, or Azure accounts.

**Interface:** the existing `azurerm_container_app.backend` owns Single revision, one replica, ingress, and probes. Document applying this same module to the selected existing app and reading the deployed values back. Use the established ignored tfvars/state workflow; do not add replica knobs or a parallel imperative deployment owner.

- [ ] Production owner documents that this base already satisfies the replica/revision configuration requirement in `infra/terraform/main.tf`; preserve fixed min/max 1 and Single mode during future deployments. The operator must identify the actual existing app/state, inspect a Terraform plan, apply this module through the authorized deployment workflow, and retain deployed scale/revision/traffic evidence. A source declaration alone does not prove the live app uses it.
- [ ] Validate unchanged Terraform when the existing Terraform runtime/provider is available: `terraform -chdir=infra/terraform fmt -check`, `terraform -chdir=infra/terraform init -backend=false -lockfile=readonly`, and `terraform -chdir=infra/terraform validate`. Expected exit 0 and `Success! The configuration is valid.` No regression test or forced red test is necessary for existing unchanged constants; no new install is required for this docs-only task. Terraform is not on this planning environment's PATH, so these checks remain unrun until execution/CI has it.
- [ ] Document that limits are per process and reset on restart; fixed windows permit boundary bursts, NAT shares IP buckets, client abort cannot guarantee provider billing cancellation, revision transitions/maintenance may briefly overlap processes, and one configured max replica per revision is not a globally durable billing cap. No traffic split or public old-revision labels; require one active serving revision.
- [ ] Document provider controls and RAWG TTL decision from the sources below. Record account-specific model/tier quotas and hard-limit status before launch; never assume free-tier capacity equals the app defaults. Record event-label log queries/count interpretation, without adding a telemetry stack.
- [ ] Sol reviews the existing Terraform values and amended release runbook. Future commit: `docs(infra): document quota deployment verification`.

## Azure deployment-only verification gate

These checks require the real Azure resource, DNS/frontend routing, account access, and two genuine external client networks. Local HTTP tests cannot establish those facts. Run against staging with provider keys absent to avoid billable calls; repeat after a routing/topology change. Never publish a diagnostic IP endpoint.

1. Inspect the current subscription and deployed app; use `az account show --query '{subscription:id,name:name}' -o json`, `az containerapp show -g <resource-group> -n <app> --query '{mode:properties.configuration.activeRevisionsMode,scale:properties.template.scale,ingress:properties.configuration.ingress}' -o json`, and `az containerapp revision list -g <resource-group> -n <app> -o table`. Confirm HTTP ingress is the only public API path, no bypass listener/additional port, trust flag 1, one active serving revision, maxReplicas 1. Review internal environment callers too; they must not reach a shorter direct path to the Express listener with attacker-supplied forwarding.
2. Identify the app/state owned by the existing `infra/terraform` module. Follow its current import/state instructions only if the app is not already managed; inspect `terraform -chdir=infra/terraform plan -var-file=release.tfvars` and apply the reviewed plan through the authorized deployment workflow. Then repeat the scale/mode/traffic read-back and inspect `az containerapp replica list -g <resource-group> -n <app> --revision <active-revision> -o table`. Retain redacted evidence of maxReplicas 1, Single mode, and latest traffic, noting documented transient platform overlap. Do not import an already managed resource or create duplicate state ownership.
3. Use temporary staging-only request middleware or existing secure diagnostic session to record `socket.remoteAddress`, full XFF, and computed `request.ip` for a small controlled sample. Enable Nest debug level explicitly if needed; remove instrumentation after verification. Do not log IPs globally in production event counters. Send through default ACA FQDN, custom domain, and the browser's actual configured API path; verify the recorded rightmost IP is the external source for each. The frontend here is static; if external deployment adds Nginx/front-door/proxy routing, include that path and its header replacement rules. Do not raise hop count to make it pass; revisit exact trusted boundary if topology differs.
4. From network A, after a fresh 60-second window, send 10 GET discovery requests with varying spoofed prefixes and assert success, then the 11th is 429 with `Retry-After` in 1..60. Example request: `curl.exe -i -H "X-Forwarded-For: 198.51.100.1, 198.51.100.2" "https://<api-host>/api/v2/games/discover?q=issue77"`. Change only the supplied header between calls. Observed `request.ip` must remain A's actual public IP, never a supplied value. Fresh-window header-free traffic must behave identically.
5. Network B must obtain its own 10 admissions while A is denied, unless the shared global budget is exhausted. Confirm a cheap catalog/health read still succeeds while A is denied. Genuine rotated-IP/global accounting is proved locally with real Nest requests; forged XFF values must **not** simulate new client networks in Azure.
6. Store redacted observations/date/revision/config and pass/fail evidence in the release record. Missing network evidence, unknown bypass path, unconfirmed application of this Terraform module/live replica ceiling, or unknown provider hard limits remain explicit launch-gate gaps; do not mark issue acceptance fully verified.

## Provider facts and limitations (official sources checked 2026-10-01)

- [Azure HTTP ingress headers](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview#http-headers): ACA appends to client XFF; only its rightmost entry is platform-provided. [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) explains right-to-left numeric-hop behavior and warns about shorter alternate paths. **Inference:** trust 1 fits a direct ACA-to-app path with no bypass; the deployed chain must prove it.
- [Azure scale limits](https://learn.microsoft.com/en-us/azure/container-apps/scale-app#scale-definition) apply per revision; default maximum is 10 and maintenance can temporarily pre-warm extra replicas. [Azure revision commands](https://learn.microsoft.com/en-us/cli/azure/containerapp/revision?view=azure-cli-latest) support the deployed read-back gate. The existing module pins AzureRM 4.25.0 and fixes Single mode plus min/max replicas 1; the actual deployed resource/state and successful application still need operator evidence.
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): RPM/TPM/RPD are model/tier/project dependent; keys share a project's quota and actual account capacity is displayed in AI Studio. Record the actual `gemini-3.1-flash-lite` limits and choose app values at or below account limits; token quota can exhaust below 30 requests. No app/provider retry storm on 429.
- [Gemini billing](https://ai.google.dev/gemini-api/docs/billing#spend-caps): current docs describe experimental project monthly spend caps with approximately ten-minute enforcement delay and possible overages; availability excludes some accounts. Prefer a small eligible project cap, plus prepaid credit limits/auto-reload disabled or capped where applicable; verify actual controls in AI Studio. Billing-account caps cover multiple projects. Do not describe ordinary Cloud billing budget notifications as an instantaneous hard stop. This task documents/records account choices; it does not alter payment settings without authorization.
- [GenAI abort contract](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html#abortSignal): abort is a client operation, service work/charges can continue. [SDK HTTP options](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html) include retry/timeouts in current docs; validate installed lockfile types/behavior, not latest documentation alone.
- [RAWG plans](https://rawg.io/apidocs): published free-plan allowance is 20,000 requests/month and attribution is required. This source does not establish a configurable user-defined spending cap, exact exhaustion response, or enforcement guarantees. Verify the key's actual plan/dashboard/contract; document unsupported hard caps honestly. A 60/min application budget can consume 20,000 monthly calls in about 5.6 hours under sustained load, so minute limits/coalescing are not monthly quota control. Disable the optional key if account controls/allowance are unacceptable; do not build a speculative durable monthly counter.

## Exact verification commands and handoff

Run from repository root unless a command explicitly changes location. Planning inspected files and official sources only; no test/build/deployed verification has been run or claimed. The revised base already contains fixed single-replica Terraform; Terraform is not available on this environment's PATH, and its checks below are future verification commands.

```powershell
npm ci --prefix backend
npm test --prefix backend -- --runInBand --runTestsByPath src/config/abuse-protection.config.spec.ts src/common/abuse-protection/abuse-protection.service.spec.ts src/common/guards/check-rate-limit.guard.spec.ts src/modules/gemini/gemini.service.spec.ts src/modules/games/rawg.client.spec.ts src/modules/check/check.service.spec.ts src/modules/games/games.discovery.spec.ts src/main.spec.ts
npm run lint --prefix backend
npm run typecheck --prefix backend
npm test --prefix backend -- --runInBand
npm run build --prefix backend
docker compose -f infra/docker-compose.tests.yml up --build --exit-code-from backend --abort-on-container-exit
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform init -backend=false -lockfile=readonly
terraform -chdir=infra/terraform validate
git diff --check
git status --short
```

The Docker command runs unit tests plus all seeded isolated E2E suites, including the new mixed-route/forwarded-IP suite, without live provider calls. Expect Jest suites passing, TypeScript/lint/build exit 0, Terraform fmt/init/validate exit 0 when its runtime is available, and clean whitespace. Network/install failures are setup failures, not expected red tests. The test writer must create/adjust fixtures/DI mocks separately from the production implementer and return exact red/green evidence. Sol reviews each task's diff and whole-change acceptance coverage; deployment-only gates stay pending until actual evidence exists. Do not modify frontend code, migrations, provider model/prompt, or add dependencies.

Self-review: all issue scope items map to Tasks 1–4; review-focus cases have named checks; public fallback interfaces remain unchanged; RAWG cache decision is explicit. The old-base Terraform gap and new-script proposal were removed after rebasing onto issue #75; existing replica/revision enforcement is reused, while actual Terraform application/IP/provider account evidence remains deployment-only verification.

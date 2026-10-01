# Health Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shallow process liveness and PostgreSQL readiness, wire Azure Container Apps probes, and prove database outage/recovery without restarting Nest.

**Architecture:** Add one HealthService using the already installed Terminus PostgreSQL indicator. Keep the existing version-neutral controller and PostgreSQL diagnostic contract; expose small sanitized probe responses. Add an app-only Terraform configuration against an existing resource group and Container Apps environment.

**Tech Stack:** NestJS 11, Terminus 11.0.0, TypeORM/PostgreSQL, Jest/Supertest, Terraform/AzureRM.

**Spec:** [GitHub issue #75](https://github.com/YuvalAnteby/Can-I-Run-It/issues/75).

## Global Constraints

- Main is the active source baseline after the staging/main reconciliation; preserve reconciliation ancestry.
- Every controller method delegates to a service; constructor injection, module imports array, Swagger descriptions, co-located service/controller specs.
- Tests belong to a separate gpt-5.6-luna Max agent; production code/Terraform/docs belong to another gpt-5.6-luna Max agent. Neither edits the other's files.
- No new application dependencies, provider calls, authentication, throttling, or reconnect/cache infrastructure.
- Keep `GET /api/health/postgres` as diagnostic tooling; never configure a restart probe against it.
- No HA, provider availability checks, Kubernetes, publication, deployment, or merge.
- Conventional commits, no co-author trailer. User already authorized execution and review; no additional plan approval gate.

## Review Focus

- Repeated DB failures must produce repeated readiness 503 responses while liveness remains 200.
- PostgreSQL recovery must work in the same Nest application and DataSource instance.
- Slow/unresolved DB pings must return a sanitized 503 within the 1000 ms indicator timeout.
- Error objects containing database credentials/hostnames must never reach probe responses.
- Health traffic beyond the check-route rate limit and failed Gemini/RAWG clients must leave probes usable.

---

### Task 1: Probe HTTP contract and automated outage/recovery

**Files:**

- Production create: `backend/src/modules/health/health.service.ts`
- Production modify: `backend/src/modules/health/health.controller.ts`, `backend/src/modules/health/health.module.ts`
- Tests create: `backend/src/modules/health/health.service.spec.ts`, `backend/src/modules/health/health.controller.spec.ts`
- Tests modify: `backend/test/health.e2e-spec.ts`

**Interfaces:**

- `HealthService.live(): { status: 'ok' }`
- `HealthService.ready(): Promise<{ status: 'ok' }>`
- `HealthService.postgres(): Promise<HealthCheckResult>`
- Controller `live()` and `ready()` delegate to matching service methods; retain existing `check(): Promise<HealthCheckResult>`, delegating to `postgres()`.
- `GET /api/health/live`: HTTP 200, exactly `{ "status": "ok" }`, no dependency IO.
- `GET /api/health/ready`: HTTP 200, exactly `{ "status": "ok" }` when a PostgreSQL ping succeeds; HTTP 503, exactly `{ "status": "unavailable" }` on any check error or timeout.
- PostgreSQL diagnostic endpoint retains existing healthy `status/info/error/details` Terminus response behavior.
- Probe methods stay version neutral, public, and unguarded.

- [ ] **Step 1 — Test agent writes the failing unit and HTTP assertions.**

  Assert live returns the exact body without health-check, DB, Gemini, or RAWG calls. Assert ready delegates one PostgreSQL ping with the injected `DATA_SOURCE` and `timeout: 1000`; check healthy/error/timeout responses and absence of sensitive exception details. Controller unit tests assert all three delegations. HTTP tests assert the unversioned paths and exact bodies and send more than 10 unauthenticated requests without 401/403/429.

- [ ] **Step 2 — Test agent runs the focused tests and hands off the red output.**

  Run `npm test --prefix backend -- --runInBand --testPathPatterns=modules/health`. Expected red: missing HealthService/new controller methods; after dependencies exist, the old HTTP routes return 404. Do not edit production files to make tests pass.

- [ ] **Step 3 — Production agent implements the service, controller delegation, and provider registration.**

  Inject HealthCheckService, TypeOrmHealthIndicator, and `@Inject('DATA_SOURCE') DataSource` into HealthService. Reuse the current PostgreSQL check in `postgres()`. In `ready()`, run only the database indicator with the 1000 ms option, then return the small successful body; catch check failures and throw `new ServiceUnavailableException({ status: 'unavailable' })`. `live()` returns its body synchronously. Register HealthService in the existing module. Document both probe operations in Swagger, including 503 readiness response. Do not import Gemini/RAWG or apply guards.

- [ ] **Step 4 — Test agent adds genuine PostgreSQL connectivity outage and recovery to the existing dedicated-database E2E suite.**

  Open a separate administrative DataSource to the PostgreSQL `postgres` database using the existing test connection credentials. Safely quote the configured dedicated test DB identifier. Temporarily run `ALTER DATABASE <test-db> ALLOW_CONNECTIONS false`, then terminate sessions for that DB using `pg_terminate_backend` with a parameterized database name. Assert repeated ready 503/live 200 responses. Restore `ALLOW_CONNECTIONS true` in a `finally` block, poll boundedly for ready 200, and assert the same application and DataSource were used throughout. No DataSource destruction/reinitialization or app rebuild as a recovery mechanism. Destroy only the admin connection during cleanup. Existing E2E runner is sequential, and this test must restore DB access even after assertions fail.

  Add an unresolved-query timeout assertion with a mocked query, restore the spy, then show readiness succeeds again. Make Gemini and RAWG client spies reject if called and assert their call count stays zero for probes. Preserve the existing diagnostic healthy E2E assertion.

- [ ] **Step 5 — Run focused and full verification after both agents finish.**

  Run focused unit tests, then `npm run lint --prefix backend`, `npm run typecheck --prefix backend`, `npm test --prefix backend -- --runInBand`, and `npm run build --prefix backend`. Run `docker compose -f infra/docker-compose.tests.yml up --build --exit-code-from backend --abort-on-container-exit`. Expected: all checks pass, including real dedicated-DB outage/recovery. If Docker cannot run, report that integration verification limitation explicitly.

### Task 2: Azure Container Apps probe configuration and operations contract

**Files:**

- Production create: `infra/terraform/main.tf`, `infra/terraform/variables.tf`, `infra/terraform/.gitignore`
- Production modify: `docs/operations/demo-release.md`
- Production modify if needed for repeatable validation: `.github/workflows/backend-ci.yml`

**Interfaces:**

- Terraform requires `>= 1.9, < 2.0`, AzureRM `= 4.25.0`; use the AzureRM provider with `features {}`.
- Inputs: `container_app_name: string`, `resource_group_name: string`, `container_app_environment_id: string`, `backend_image: string`, `backend_port: number = 4000`, `environment_variables: map(string) = {}`, `secret_environment_variables: map(string) = {}` (sensitive).
- If private GHCR requires it, add only optional registry credentials; public images need no registry block. Never commit a token.
- Existing environment/resource group/database/network remain externally supplied.
- `azurerm_container_app.backend`: Single revision, min/max replicas 1, backend container 0.5 CPU/1Gi, HTTPS public ingress using the same validated integer `backend_port` as PORT and all probe ports; latest revision traffic weight 100.
- Plain env values come from inputs, with NODE_ENV=production and PORT forced to the configured port. Secret env inputs create app secrets and reference their names, using nonsensitive key iteration and sensitive value lookup. Reject duplicate/fixed env keys.
- Only one of each HTTP probe:
  - Startup: `/api/health/live`, initial_delay 10, interval_seconds 10, failure_count_threshold 30, timeout 2 (approximately five minutes of startup tolerance).
  - Liveness: `/api/health/live`, initial_delay 10, interval_seconds 10, failure_count_threshold 3, timeout 2.
  - Readiness: `/api/health/ready`, interval_seconds 5, failure_count_threshold 1, success_count_threshold 1, timeout 2.

- [ ] **Step 1 — Production agent adds the minimal app configuration and local state/secret exclusions.**

  Validate backend_port is an integer from 1 through 65535. Keep PORT, ingress target_port, and all HTTP probe ports bound to it. Ignore `.terraform/`, Terraform state/backups, crash logs, and local `*.tfvars` (the provider lockfile may be committed). Do not provision a database/environment or add deploy automation.

- [ ] **Step 2 — Validate against the real provider schema.**

  Run `terraform -chdir=infra/terraform fmt -check`, `terraform -chdir=infra/terraform init -backend=false`, and `terraform -chdir=infra/terraform validate`. Expected: format passes and configuration valid. If the local binary is unavailable, add the same checks to backend CI using hashicorp/setup-terraform@v3; report local validation as unavailable until it has actually run. Do not claim HCL/provider validity from text inspection alone. Do not apply.

- [ ] **Step 3 — Document the precise endpoint and infrastructure contract in the existing release operations document.**

  Include the status/body table, PostgreSQL-only readiness, provider independence, no public details on probes, diagnostic endpoint purpose, timeout/probe values, default port, existing Azure resource prerequisites, input supply and import/plan/validate instructions, and secure state handling. Keep infra/.env as the source for runtime values and never add provider secrets to frontend variables. Explain DB outage removes readiness but leaves startup/liveness successful on a running process; restored DB connectivity returns readiness without a process restart.

  Explicitly document the current startup limitation: the custom DataSource factory awaits its initial DB connection before Nest listens and has no retry loop. The generous startup budget tolerates slow successful startup; it does not create application retries or guarantee boot during an initial DB outage. Existing application bootstrap behavior is unchanged by this issue.

- [ ] **Step 4 — Review contract/config consistency and commit only the authorized feature files.**

  Review the rendered Terraform values against the endpoint table and test results. Use `feat(backend): add liveness and database readiness probes` and `feat(infra): configure container app health probes` as logical Conventional Commit messages; do not add a co-author. Keep reconciliation work separate from feature commits.

## Primary references

- [Azure Container Apps health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes): HTTP success is 200–399; startup/liveness/readiness have separate roles and slow startup needs generous thresholds.
- [AzureRM 4.25.0 Container App resource](https://registry.terraform.io/providers/hashicorp/azurerm/4.25.0/docs/resources/container_app): resource, ingress, probe field names, and port configuration.
- [Nest Terminus v11 documentation](https://docs.nestjs.com/v11/recipes/terminus): reuse TypeOrmHealthIndicator and its options timeout; do not copy the newer v12 builder API.

## Known limits

When the sole Azure replica is not ready, public ingress may return a platform 503 even while the app's internal live probe returns 200. Verify deployed outage behavior through internal probe/replica logs or a request inside the backend container. [Microsoft's architecture guidance](https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-container-apps) distinguishes liveness restarts from readiness traffic gating.

Terminus bounds the health response wait; it does not cancel a PostgreSQL query. No custom reconnect loop or new health connection pool is introduced. Live Azure outage/recovery and replica restart behavior require deployment observation; automated tests establish the app's status transitions in the same process, and Terraform validation establishes the declared configuration.

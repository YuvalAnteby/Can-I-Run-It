# Azure Production Implementation Plan

> **For agentic workers:** Use the approved architecture and execute the independent tasks below with the dispatching-parallel-agents workflow; integrate and review the complete branch before publishing the draft update.

**Goal:** Implement the Azure production contract with locally verified deployment artifacts and an explicit record of unobserved Azure acceptance gates.

**Architecture:** Terraform owns the default-network Consumption platform and exact secret references; human bootstrap owns privileged RBAC/Entra setup. Immutable release images run the API and finite maintenance Jobs; SQL migrations precede releases, and Blob metadata coordinates firewall and export operations.

**Tech Stack:** NestJS/TypeORM/pg, Node 24, PostgreSQL 16, Terraform/AzureRM, GitHub Actions OIDC, Azure Container Apps/Key Vault/Blob/SWA.

**Spec:** `docs/architecture/azure-production.md`, `docs/architecture/azure-terraform-handoff.md`, `docs/operations/azure-database.md`, and the supplied `CODEX-PROMPT.md`.

## Global Constraints

- SWA Free; Workload Profiles environment, Consumption only, default Azure-managed network.
- API 0.5 vCPU/1 GiB, Single revision, min0/max1, HTTPS port4000; no customer VNet, VM, NAT, private endpoint, dedicated profile, ACR or separate load balancer.
- PostgreSQL16/B1ms/32GiB, Entra-only, exact public IPv4 rules; no Azure-services bypass.
- Separate protected state account and private export/control account; secrets stay outside Terraform values/state reads.
- Ordinary CI has no RBAC administration or Entra DB-admin authority; main-only protected production release.
- Preserve existing application behavior, Compose, checks/scanners and optional provider fallback; issue82 owns admin endpoints.
- No provisioning without observed subscription grants/costs and a reviewed real plan; user reviews draft before deployment.

## Review Focus

- Pool reconnections acquire fresh tokens and reject expired tokens/insecure TLS; password-mode Compose still works.
- Existing schemas adopt one migration ledger without replaying conflicting legacy SQL or losing data; seed preserves operator edits.
- Missing/invalid egress discovery changes no rules; retired exact IPs survive one interval; only controller-owned rules are pruned.
- Concurrent/failed exports preserve completed copies and due thresholds; four calendar months clamp UTC month ends and credit periods cross years.
- OIDC, overridden Job commands and resource/state ownership cannot silently grant broad permissions or duplicate existing resources.

### Task 1: Complete Terraform ownership

**Files:** `infra/terraform/*.tf`, lock/test files, `infra/terraform/bootstrap/`, Terraform README.
**Interfaces:** Outputs `resource_group_name`, API/SWA URLs, PostgreSQL hostname/database, app/Job resource IDs, executor client/principal IDs, export account/container/control names. Inputs contain nonsecret names/IDs/URIs and immutable API/tools digests only. Human bootstrap establishes separate platform/release federated principals and role assignments.

- [ ] Write mock-provider tests for fixed SKUs, scale, native KV metadata, Jobs, no alerts/network bypass, and safe inputs.
- [ ] Observe tests fail on the app-only root; implement the owned platform and separate privileged/bootstrap roots.
- [ ] Run fmt/init/validate/test and a mock plan; record real state/import/RBAC/subscription/cost requirements before apply.

### Task 2: Database authentication and lifecycle

**Files:** `backend/src/database/`, backend package scripts/dependencies, `infra/database/azure/`, focused unit/PG16 E2E tests.
**Interfaces:** Shared `POSTGRES_AUTH_MODE`, `POSTGRES_SSL_MODE`, `POSTGRES_POOL_MAX`, `AZURE_CLIENT_ID`; CLI `migration:run`, `migration:show`, `seed:initial` uses compiled migrations and supplied SQL under `/app/infra` in tools images. CLI exits terminally, locks migration/seed execution, never boots HTTP.

- [ ] Add failing tests for explicit password/Entra modes, token refresh/expiry, TLS, bounded initial retries and unchanged readiness behavior.
- [ ] Implement shared connection options and CLI DataSource, one fresh/existing migration baseline, insert-missing seed and explicit runtime write grants.
- [ ] Fix bootstrap failure exit/default ACL defects with tested PostgreSQL behavior; keep real Entra extension validation as an Azure gate.
- [ ] Run backend lint/typecheck/unit/PG16 E2E/build; verify repeated seed/migrations, drifted grants, concurrent locks and a dump/restore round trip.

### Task 3: Finite maintenance programs

**Files:** `infra/azure/` Node scripts, package/lock and tests.
**Interfaces:** CLI modes `firewall`, `export-check`, `export`; reads executor resource IDs, PG executor settings, export/control account/container names, credit-period/currency inputs and immutable release digest from environment. Uses explicit UAMI client ID in Azure and CLI credentials in trusted release CI.

- [ ] Write failing tests for invalid egress, add-before-retire grace, lease conflicts, schedule/month/threshold boundaries, failed upload/retention and bounded waits.
- [ ] Implement shared ARM discovery and exact firewall reconciliation with leased control metadata; discovery failures retain prior working rules.
- [ ] Implement fresh-token PG16 custom dump, read-back hash verification, completion manifests and two-set pruning; daily checker uses verified costs or documented manual fallback.
- [ ] Run tests and locally verifiable upload/restore checks; record actual ARM/MI/Cost Management connectivity as Azure integration gates.

### Task 4: Images and trusted pipelines

**Files:** `infra/Dockerfile.backend`, `.github/workflows/`, workflow helpers, `frontend/public/staticwebapp.config.json`, env example.
**Interfaces:** API/tools digest outputs feed Terraform defaults and release Job overrides; main-only protected workflows use platform/release principal IDs and Azure Blob OIDC state. SWA token stays a GitHub secret outside Terraform.

- [ ] Add meaningful validation for workflow order/permissions and unsafe deployment inputs; preserve all existing checks/scans.
- [ ] Build a dedicated nonroot tools target with compiled migration tooling, PG16 tools and maintenance programs; scan API/tools images.
- [ ] Implement OIDC platform plan/apply gates and release sequencing: firewall, terminal successful matching-image migration, API digest, SPA build/deploy, smoke/evidence.
- [ ] Configure SPA fallback and document rollback/rotation/operator finally-cleanup; test workflows with actionlint and production builds.

### Task 5: Integration, evidence and draft update

**Files:** README, release/observability/database/Terraform runbooks, `docs/operations/azure-acceptance.md`.

- [ ] Reconcile available resource/state inventory without reading secret values; record account/tool access limitations with exact commands/results.
- [ ] Run all backend/frontend checks, audits, Docker PG16 E2E, Terraform checks/tests/plans, maintenance tests, tools/API builds/scans and restore validation.
- [ ] Review the whole implementation against every contract gate; fix material findings and rerun affected checks.
- [ ] Replace stale handoff-only status with implementation/evidence status, enumerate unobserved Azure gates and update existing draft PR83 to staging.

## Execution Record

- Starting commit: `2985ef313bf0b3c884149fb6b17af4fef8a7aca8`; existing draft PR83 remains the delivery branch.
- User explicitly instructed full prompt execution after rejecting the earlier documentation-only scope. The approved written architecture is the design authority; execute without another design-approval pause.
- Initial tool inventory: Azure CLI and Terraform are absent from PATH; GitHub, Docker, Python and Node are available. Cloud resource/cost evidence must not be inferred from local artifact checks.

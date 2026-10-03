# Azure implementation acceptance record

Local verification date: 2026-10-03. Baseline: staging
`4ef01411a987c4c9d9d8a73ced7124a5683524c9`. The full `CODEX-PROMPT.md` scope is
implemented in the repository for draft review. No Azure provisioning or release
was executed. No authenticated Azure account/API access was available; Azure CLI
and an authenticated profile were absent from the implementation environment.
Resource/state reconciliation, actual account entitlements/prices and the real
reviewed production plan remain required before any provisioning.

## Observed local evidence

| Check | Observed result |
| --- | --- |
| Backend lint/typecheck/build | Pass |
| Backend Jest, including driver token callback and five-minute transient/fatal connection policy | 27 suites, 237 tests pass |
| Existing Node24 Docker Compose suite | 237 unit tests and 24 integration tests pass; the 16 opt-in checks run separately in the dedicated PG16/TLS CI job |
| Dedicated actual PostgreSQL16 lifecycle/bootstrap/TLS suites | 3 suites, 16 checks pass |
| PostgreSQL coverage | Fresh/current/legacy baseline, preserved IDs/edits/provenance, one-connection pool, advisory-lock contention, partial-schema rejection, default-ACL drift/future objects and denied SQL, wrong host/untrusted CA, pool reconnect/expired credential and prompt fatal-auth CLI exit |
| Portable database restore | PG16 custom dump restored into an isolated database; ledger, records, indexes and sequence state verified |
| Final Node24 tools image | Build pass; 22 maintenance policy/runtime tests pass; compiled migrate and explicit repeated seed pass with pool 1 on disposable PG16 |
| Frontend lint/typecheck/test/build | Pass; 16 suites, 70 tests; static navigation fallback included in built output |
| Backend/maintenance npm audit --audit-level=high | Both report 0 vulnerabilities |
| Frontend npm audit --audit-level=high | Pass; 2 existing moderate Vitest/mocker advisories remain; forced major upgrade deferred |
| Final API and tools Trivy0.74.0 scans | Both pass; 0 HIGH/CRITICAL findings; original threshold/scanner preserved |
| Deployment contract and smoke tests | 7 pass: account/credit binding, complete cost worksheet, forbidden resource/secret/destructive-plan rejection, exact saved bytes/expiry, CORS/navigation/measured-data smoke failures |
| Terraform1.11.4/AzureRM4.25.0/AzAPI2.4.0 | All 3 roots readonly-lock initialized, formatted and schema-valid; production 11/state 2/privileges 3 mock checks pass |
| Generated mocked production plan | 26 resource changes pass the production guard; this is a genuine Terraform test plan, not an account plan or provisioning approval |
| actionlint1.7.7 | All workflows pass, including dedicated PG16/TLS CI and explicit finite maintenance |

The SQL tests use clearly named local `pgaadauth` stubs for SQL flow/ACL checks;
the token seam returns a local test password. Neither verifies Azure identity
mapping or a real managed-identity token. ARM/Blob doubles verify fail-closed
discovery, leases/ETags, add-before-retire, remote-readback/hash corruption,
failure retention and durable due/threshold policy. They do not verify Azure
network/RBAC or real uploads. A restored local dump does not establish a restored
Azure Blob download.

During the final continuation Docker Desktop stopped; connection tests failed
with engine/container unavailable. The engine and disposable server were restored,
then all 16 database checks passed. A Windows bootstrap test timed out during CPU
contention; the unchanged test passed in the final complete 237-test rerun. Neither
failure was hidden by weakening CI thresholds, test assertions or startup budgets.

## Reproducible checks

Backend: `npm ci --prefix backend`, `npm run lint --prefix backend`,
`npm run typecheck --prefix backend`, `npm run build --prefix backend`,
`npm test --prefix backend`, `npm audit --prefix backend --audit-level=high`.
Use the [database recipe](../../infra/database/azure/README.md) for the isolated
server, generated CA and three opt-in integration suites. Normal CI now explicitly
starts that fixture; those tests no longer silently skip everywhere.

Maintenance: `npm ci --prefix infra/azure`, `npm test --prefix infra/azure`,
`npm audit --prefix infra/azure --audit-level=high` and
`node --test infra/deployment/*.test.mjs`. Frontend uses its existing lint,
typecheck,test,build and HIGH audit commands. Build images with
`docker build -f infra/Dockerfile.backend --target prod ./backend` and
`docker build -f infra/Dockerfile.tools --target tools .`; scan each with the
unchanged Trivy HIGH/CRITICAL failure gate. The existing isolated Docker suite is
`docker compose -f infra/docker-compose.tests.yml up --build --exit-code-from backend --abort-on-container-exit`.

Terraform: from each of `infra/terraform`, `infra/terraform/bootstrap/state` and
`infra/terraform/bootstrap/privileges`, run `init -backend=false -lockfile=readonly`,
`validate` and `test`; run `fmt -check -recursive` for the full tree. Mocks use no
Azure credentials, account state or provisioning. Actual plans and generated
sensitive telemetry metadata remain private.

## Protected workflow configuration

Configure GitHub `production` with required reviewers, trusted main-only deployment
branches and workflow/branch protection. An environment OIDC subject alone does
not constrain the branch. State bootstrap supplies distinct platform/release UAMIs;
ordinary CI receives neither RBAC nor Entra SQL administrator rights.

Protected platform variables: `AZURE_PLATFORM_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`, `AZURE_LOCATION`, `AZURE_STATE_STORAGE_ACCOUNT`,
`AZURE_STATE_CONTAINER`, `AZURE_STATE_KEY`, `AZURE_TERRAFORM_VARS_JSON` and
`AZURE_COST_EVIDENCE_JSON`. Inputs are metadata only; provider references must be
versionless URIs. The cost record must contain matching subscription/tenant/region,
verified_at within 7 days, observed account/registration/inventory/reconciled-state
gates, current credit/free expiry, currency, remaining credit/reserve and all 11
priced quantity/grant/expiry categories. See `infra/deployment/contract.mjs` for
the exact machine-checked schema. Do not copy the fake test worksheet as real evidence.

The private plan/receipt is stored under `plans/<main-commit>/<run-id>/` in the state
container. Review it privately, then select `apply` with that plan run ID on the same
main commit within 24 hours. Receipt validation binds subscription/tenant/region through
the inputs/evidence hashes, commit/repository, Terraform version and exact binary SHA.
Do not publish raw JSON plans, state or provider values as CI artifacts/logs.

Release variables: `AZURE_RELEASE_CLIENT_ID`, tenant/subscription as above,
`AZURE_API_RESOURCE_ID`, `AZURE_SWA_RESOURCE_ID`, `AZURE_MIGRATION_JOB_RESOURCE_ID`,
`AZURE_FIREWALL_JOB_RESOURCE_ID`, `AZURE_EXPORT_CHECK_JOB_RESOURCE_ID`,
`AZURE_DATABASE_BOOTSTRAP_VERIFIED`, `AZURE_RELEASE_ACCEPTANCE_VERIFIED`,
`AZURE_DEPLOY_ENABLED` and a human-verified `AZURE_SMOKE_CHECK_JSON` matching an
existing measured record. Leave deployment disabled until the gates below pass.
The separately retrieved SWA token is a protected environment secret
`AZURE_STATIC_WEB_APPS_API_TOKEN`; Terraform never reads it. Both GHCR packages
must permit anonymous pull before release. Release reads no Terraform state.

## Exact remaining account and Azure integration gates

1. **Account and cost:** observe subscription/tenant, student offer/spending protection,
   credit start/end/currency/balance, first-year/shared PostgreSQL hours/storage/backup
   and ACA grants/expiry. Confirm actual West Europe PG16/B1ms/32GiB and Consumption
   availability/quota/provider registrations. Price every service, requests, finite
   Job, transaction, ingestion and bandwidth meter, including grant exhaustion and
   reserve. No paid SKU/region/network fallback or one-year budget guarantee.
2. **Ownership and reviewed plan:** list resource IDs and state blob/address metadata
   without exposing values, resolve sole ownership and import existing resources.
   Review actual production/bootstrap plans; verify Entra/OIDC private Blob access,
   leases, versioning/soft deletion and recovery. Confirm production state cannot
   access the separate human bootstrap container and release cannot access state.
3. **Human bootstrap:** create/import the initial platform with empty provider URIs
   and schedules disabled. Apply scoped runtime RBAC with actual principal IDs;
   authorize only the human Entra administrator, verify database/schema ownership,
   install allowlisted pg_trgm, and execute bootstrap through a temporary exact
   operator IP. Remove that rule in success/failure cleanup. Verify real pgaadauth
   reruns/conflicting OIDs/elevation, existing and future grants/defaults, migrator
   ownership, runtime allowed INSERT/UPDATE and denied DELETE/DDL, exporter read/dump
   and denied writes. Initial seed remains an explicit human action.
4. **Identity, TLS and vault:** observe each executor's explicit UAMI and actual token
   audience. Reconnect after real expiry; reject wrong CA/hostname/expired tokens.
   Confirm native versionless references use only API vault rights, secret rotation
   reaches new/restarted revisions, and secrets never appear in state reads/logs.
5. **Egress/firewall:** independently discover API, migration, export Job outbound IPs
   with supported ARM versions; require nonempty exact public IPv4. Prove executor
   connectivity, propagation retry, leased concurrent exclusion, add-before-remove,
   one-hour old-IP grace and later prune. Empty/failed discovery must preserve working
   rules and fail. Confirm no Azure-services bypass or routine API wake-up.
6. **Release:** prove main/environment OIDC subjects/RBAC/approvals, anonymous digest
   pulls and matching API/tools release provenance. Observe requested Job terminal
   success, migration failure/concurrency blocking API update and no automatic seed.
   Verify image-only PATCH, latest scanned revision ready, Single/min0/max1, 100% latest
   traffic and no public old labels. Verify SPA/module/deep-link, exact/denied CORS,
   catalog/measured compatibility and actual trusted proxy/client-IP bypass behavior.
   Exercise previous-image/SPA rollback with reviewed schema restore/forward policy.
7. **Exports and cost signals:** take the initial successful export; prove real MI
   PG16 dump and Entra Blob size/hash readback/completion manifest, failure preservation,
   two-completed-set retention and bounded abandoned cleanup without state/control
   deletion. Download/checksum/restore to isolated PG16 and compare data/ledger/indexes/
   sequences/API behavior. Verify actual leases/ETags, manual checker-to-exporter
   terminal success, four-calendar-month UTC scheduling/month-end clamp and actual
   credit-period 80/90 markers across January 1. Verify Cost Query currency/student
   credit mapping and budget email delivery/lag; retain visible manual fallback while
   mapping is unverified and record the annual budget's first-month boundary mismatch.
8. **Runtime and billing:** observe idle-to-zero and repeated genuine cold starts,
   each latency plus median/p95. Verify redaction/correlation/no duplicate telemetry,
   console/system-only routing, 10% SDK sampling, 30 day retention, 0.1 GB/day caps and no
   paid/replica 0 alerts. Reconcile observed usage/cost after 24–48 hours and over a billing
   interval against the account worksheet and actual student credit balance.

Retain redacted real resource IDs, timestamps, Job execution names, image digests,
ledger/manifest/restore evidence and observed measurements in the reviewed release
record. No source declaration, fake cost fixture, local SQL stub or mock plan closes
these gates. Admin POST/PATCH remains separately tracked in issue #82.

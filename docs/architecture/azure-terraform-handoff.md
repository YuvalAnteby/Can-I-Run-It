# Azure implementation contract for Codex

Read [the approved architecture](azure-production.md) first and
[database operations](../operations/azure-database.md) next.
Implement the complete Terraform/CI/CD platform; these documents themselves do
not deploy infrastructure. Do not implement the admin endpoints here: issue #82 owns them.

Baseline: staging commit `4ef01411a987c4c9d9d8a73ced7124a5683524c9`.
Inspect the implementation branch again before editing; main and staging may differ.
Reconcile existing resources/state rather than creating duplicate environments.

## Existing repository gaps

| Current repository behavior | Required Azure implementation |
| --- | --- |
| infra/terraform creates only an app in an existing environment; min=1 | Own the platform, Consumption/default network, min=0 |
| Sensitive environment map writes secret values into Terraform | Native Key Vault references; provider/admin values outside Terraform |
| TypeORM uses a fixed password; no explicit Azure TLS/pool configuration | Entra token callback for new connections, verified TLS, max pool=5 |
| SQL init + legacy standalone migrations; no CLI migration target | One TypeORM migration ledger/baseline and finite migration Job |
| Production API image contains no SQL/tooling and removes npm/CLI binaries | Dedicated scanned maintenance image/target containing compiled migrations and PostgreSQL 16 tools |
| main workflow scans/publishes GHCR image only | OIDC platform workflow and API/SPA release workflow |
| Existing monitoring Terraform creates three alerts, including min-one-replica | No billed log/metric alert rules by default; no low-replica alert for min=0 |
| Local env template has no implemented admin API feature | Add admin flags/key with issue #82, then wire optional Key Vault reference |

Preserve implemented compatibility behavior, safe provider traces, in-flight
coalescing, DB-backed Gemini results, provider fallback, and existing CI gates.
Do not introduce Redis, RabbitMQ, workers, automatic ingestion or a new frontend server.

## Subscription and cost gate: required before apply

Record actual subscription/tenant IDs, credit start/end, credit currency/remaining
balance, free-service expiry dates, allowed regions, provider registration and
quotas. Check West Europe first; do not silently substitute a region or paid SKU.

Confirm the first-year PostgreSQL allowance in the actual account: 750 B1ms hours,
32 GB storage and 32 GB backup storage per eligible month. One always-on server
fits 744 hours in a 31-day month, but additional servers/restores and grant sharing
can exceed allowances. Confirm PostgreSQL 16/B1ms compatibility and availability.

Container Apps publishes subscription-wide monthly grants of 180,000 vCPU-seconds,
360,000 GiB-seconds and two million requests. At 0.5 CPU/1 GiB this is approximately
100 active replica-hours if no other usage consumes the compute grants. This is
arithmetic for active-rate compute, not a promise about warm/idle billing.
Maintenance Jobs share those grants.

Build a dated, regional cost worksheet with quantity, unit price, verified free
allowance, net estimate and expiry for: PostgreSQL compute/storage/backup, API and
Job CPU/memory/requests, Key Vault operations, both Blob accounts and transactions,
Monitor ingestion/retention, bandwidth and any budget notification dependencies.
Check the generated plan for unexpected network or dedicated-compute charges.
Do not treat Free SPA, small DB or min=0 as proof of a zero total bill.

Set email budgets/notifications at approximately $80 and $90 over the actual credit
period where supported, plus a monthly burn-rate warning. The credit period must
not accidentally reset on January 1. The intended burn rate is at most $7–8/month
on average with reserve. Budget evaluation and cost data lag; neither is a hard
shutdown mechanism. Keep Azure's student spending protection and do not upgrade
the subscription automatically. Reconcile billed cost with credit consumption.

Required deployment inputs: subscription/tenant, permitted region, resource names,
Entra human admin object ID/login, alert email, credit-period dates/currency,
provider secret URIs, public image digests and GitHub production environment.
Identifiers are not secrets; actual keys/tokens remain outside tracked config.
Publish only redacted outputs, SKU/grant proof and estimated/observed costs.

## Terraform ownership and bootstrap

Use infra/terraform as the production root and a small documented bootstrap root
for state resources if necessary. Pin tested Terraform/provider versions and lock
files. Existing azurerm 4.25.0 is a baseline, not proof it exposes current Job egress
or every selected configuration. Upgrade deliberately; use a pinned AzAPI/ARM
operation where required rather than dropping a requirement.

Own: resource group, SWA Free, default-network ACA environment with Consumption
profile only, API, Jobs, user-assigned MIs, PostgreSQL server/database, explicit
operator rules, Key Vault/RBAC, state/export Blob accounts, monitoring and budget
configuration. Tag environment/owner/project. No additional billable replicas or
staging database by default.

Remote state: Azure Blob backend, Entra/OIDC auth, private state container, scoped
Storage Blob Data Contributor, leases, encryption, versioning/soft deletion.
Bootstrap this before terraform init; ignore local bootstrap state and transfer
ownership/state deliberately with a documented recovery path. A human bootstrap
phase grants roles/federation. Ordinary CI has no subscription-wide Owner,
User Access Administrator or PostgreSQL Entra-admin privilege.

RBAC assignments requiring elevated rights must be separated from ordinary
platform applies and performed by the authorized human/bootstrap identity.
Maintain a clear plan for adding a new MI permission without giving release CI
RBAC administration.

Use separate state and export accounts. Public HTTPS storage endpoints are
acceptable with authenticated Blob data access; no anonymous container access,
shared account keys in workflows, or public SAS links by default. Download exports
with Entra authorization. Export account policy must not accumulate old versioned/
soft-deleted dump copies indefinitely; state protection remains enabled independently.

Terraform owns scale, identity, environment, probes, security, secret references,
default Job images and resource lifecycle. Release CI owns the API image field
only: use targeted lifecycle ignore_changes for that exact field, never the entire
template. The release image is a digest. Keep default tools images pinned in
Terraform; migration execution uses a matching immutable release image override.

## Firewall discovery and reconciliation

Implement one source-of-truth routine reused by trusted release CI and a scheduled
network-control Job. The control Job runs hourly, parallelism/completions 1,
retry limit 0, timeout 60 seconds, 0.25 vCPU/0.5 GiB. It requires no DB connection,
provider secrets or SQL identity.

1. Read the API and each DB-connected Job ARM resource's
   properties.outboundIpAddresses. For Jobs, use a supported REST API exposing
   this property (2026-07-01 documents it); do not rely on older CLI output alone.
2. Validate a nonempty list of individual IPv4 addresses per resource; deduplicate
   and reject 0.0.0.0, ranges, private/inbound substitutions and unbounded input.
3. Maintain a deterministic automatic-rule prefix. Reconcile only rules owned by
   this routine; Terraform owns separately named operator rules. Do not have both
   systems create/delete the same rule resources.
4. Add new exact-IP rules first. Persist first-seen/retirement timestamps in the
   private control container; retain replaced addresses for one hourly interval
   before pruning on a subsequent successful discovery. This gives firewall
   propagation time without keeping the control Job running for minutes. Never
   broaden access to recover from failed discovery.
5. Log bounded status/diffs without credentials; surface failures and retain the
   previous working rules on failed discovery. Failure to remove stale rules must
   be retried and reported.
6. Run after platform creation/image release and before migration/export triggers.
   Those workflows/DB Jobs perform bounded real connection retries, allowing up
   to five minutes for firewall propagation, before doing data work. The hourly
   controller does not repeatedly wake the API to probe its DB. Re-run hourly
   for platform changes.

Give the control MI read permissions on only the selected app/Job resources and
firewall read/write/delete on only the PostgreSQL server, with explicit custom
role actions, plus Blob Data Contributor on the control container only for rule
timestamps/leases. Use separate metadata prefixes and concurrency leases from
export scheduling. Firewall management can broaden access, so this identity and actors
able to override its Job command are trusted. It must not read Key Vault secrets
or application data.

Do not assume a pre-creation Terraform plan knows final egress IPs. Infrastructure
can be created with deny-all DB access and Jobs not started, then reconciled.
Treat missing Job egress discovery or failed real connectivity as a deployment
blocker; investigate the API/provider response without allowing all Azure services.
Firewall propagation can take minutes. Hourly reconciliation does not guarantee
continuous connectivity between checks; record the accepted outage risk.

Operator/bootstrap access uses a temporary exact current public IPv4 rule with
bounded lifetime and cleanup in a finally/always step, including failure paths.
It does not give hosted GitHub runners permanent DB access.

## Application configuration

Implement explicit Azure Entra mode and local password mode. Proposed new tracked
configuration names are contracts to implement and document, not existing flags:

| Variable | Azure production value/behavior |
| --- | --- |
| NODE_ENV / PORT | production / 4000 |
| POSTGRES_HOST / PORT / DB | Flexible Server hostname / 5432 / ciri |
| POSTGRES_USER | ciri-runtime; migration/export Jobs use their own role |
| POSTGRES_AUTH_MODE | entra in Azure; password locally |
| AZURE_CLIENT_ID | Attached executor UAMI client ID, selected explicitly |
| POSTGRES_SSL_MODE | verify-full in Azure; map to actual pg TLS options |
| POSTGRES_POOL_MAX | 5 for API; lower bounded pools for tools |
| POSTGRES_PASSWORD | Local/test only; not a production Entra secret |
| REACT_URL | Exact SWA HTTPS origin |
| VITE_API_URL | Public API HTTPS URL ending /api; frontend build-time only |
| GEMINI_API_KEY / RAWG_API_KEY | Optional existing variables, Key Vault references |
| TELEMETRY_ENABLED / LOG_LEVEL | true / info in production; local default stays false |
| OTEL_TRACES_SAMPLER_ARG | 0.1 |
| ADMIN_API_ENABLED / ADMIN_API_KEY | Issue #82: disabled by default; secret reference when implemented |

Use @azure/identity with the attached UAMI's client ID and scope
https://ossrdbms-aad.database.windows.net/.default. Supply an asynchronous pg
password/token callback for every new pool connection. Verify the chosen TypeORM
adapter passes the callback through; a one-time awaited token is insufficient.
Reject expired/missing token, missing required Azure settings and insecure TLS.
Use trusted roots and hostname verification, never rejectUnauthorized=false.
Do not emit tokens, connection strings, provider query URLs or admin keys in logs.

Keep synchronize=false. Add a CLI DataSource/migration command that shares database
settings without importing the HTTP application or triggering its startup.
Connection retries must be bounded and observable. Preserve readiness/liveness
contracts. Validate ingress headers before TRUST_PROXY=1; do not trust caller-
controlled forwarding headers without demonstrating that public bypass is impossible.

## Release pipeline and finite maintenance

Production remains main-only through a trusted GitHub production environment.
Fork/PR jobs run existing checks without Azure deployment credentials.
Use GitHub Actions OIDC with restricted repository/environment subject federation,
separate platform/release principals, minimal permissions and protected branch rules.
Pin action versions or commit SHAs deliberately and retain scanners/audits.

Publish public GHCR API/tools packages after successful checks. A public repository
does not automatically make new packages public; verify anonymous digest pulls.
Publish sha-<fullcommit> for human traceability, deploy by digest, never latest.
An SWA deployment token may still be required: obtain/store it outside Terraform,
rotate it, and document the frontend deploy mechanism; OIDC is not a replacement
for every service token.

Deployment order:
1. Validate subscription/cost gates; plan/apply required platform updates.
2. Provision outside-Terraform secrets; verify MI/RBAC and native references.
3. Human bootstrap: temporary IP, Entra role mapping/schema grants, approved
   extension setup and initial migration baseline/seed; remove temporary elevation.
4. Reconcile API/Job source rules. Start the migration Job using the matching
   immutable tools image; wait for terminal success before API image deployment.
5. Deploy API digest, verify Single/min0/max1/HTTPS and readiness. No public old
   revision labels; perform external request/IP/security checks.
6. Build SPA using the real API FQDN, deploy SWA files/fallback configuration,
   verify CORS, deep links and basic compatibility behavior.
7. Record release digest, migration version, URLs, observations and rollback plan.

Migration/export Jobs: Consumption, 0.5 vCPU/1 GiB, parallelism and completion count
1, retry limit 0, timeout 600 seconds. Use an application advisory lock and workflow
concurrency so separate executions cannot run competing migrations. Initial seed
is a manual explicit mode, never routine deployment/startup behavior.
Use expansion-compatible migrations; failed migration blocks release. App rollback
does not automatically reverse a committed schema migration or restore data.

Daily export-check Job: 0.25 vCPU/0.5 GiB, 60-second timeout, retry 0, schedule
02:00 UTC. It reads durable export metadata, checks credit-period cost and starts
the export Job only when due, after starting and confirming firewall-control Job
success within its bounded execution budget. Grant the checker start/read-execution
permissions on those two Jobs only; if reconciliation cannot be confirmed, retain
the due marker and report failure instead of starting an unprepared export.
Separate exporter identity performs the dump.
Export-check can manage control metadata, not state or provider secrets.
Subscription Cost Management read access is broader than application scope; use
Cost Management Reader only where required and document that read-only scope.
Starting export executions implies the trust described in the architecture.

## Monitoring and acceptance evidence

Retain current safe telemetry, stdout logs once, 10% tracing, 30-day retention,
0.1 GB/day caps and successful-probe noise suppression. Own the dedicated ACA
environment's log routing in Terraform. Do not enable AllMetrics, ingress log
ingestion or paid alert rules by default. Daily caps can overshoot and produce
gaps; confirm actual bill/ingestion after launch. Native budget notifications
are distinct from billed log-search alerts.

Required checks before declaring implementation complete:
- Terraform fmt/init/validate/test and reviewed plan; no forbidden networking,
  dedicated profile or unexpected SKU; remote-state locking and scoped auth.
- Existing backend/frontend CI, real PG16 E2E, production API/tools builds/scans.
- Entra pool reconnect after token expiry; TLS rejects wrong host/untrusted CA;
  local password mode still works.
- Real Azure runtime SELECT/required INSERT/UPDATE succeed; DELETE/DDL fail.
  Export role reads/dumps but cannot write; migrator owns schema only.
- Bootstrap script reruns; conflicting object IDs/elevated roles fail closed;
  new migration-created objects receive appropriate default read grants.
- Denied DB source fails; each allowed executor works; stale-rule cleanup and
  empty discovery are tested; no Azure-services bypass.
- KV references use correct UAMI/RBAC; provider values absent from TF inputs/
  plans; browser bundle contains no secrets.
- Min0 reaches zero; repeated cold-start measurement recorded; no invalid
  replica-zero alert; provider fallback and ingress client IP behavior checked.
- Migrations fail safely, lock concurrent executions, and do not rerun seed.
- Export due/threshold/month-boundary/credit-period tests; failure retains prior
  dumps; exactly two successful dump sets after pruning; checksum and restore test.
- External SPA/API smoke, deep-link routing/CORS, rollback procedure and cost
  observations after 24–48 hours and a full billing interval.

No Azure deployment/integration was performed while preparing this handoff.
Implementation is complete only when its own fresh evidence satisfies these gates.

## Implementation references

- [Job outboundIpAddresses REST contract](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/jobs/get?view=rest-resource-manager-containerapps-2026-07-01)
- [App ARM properties](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/container-apps/get?view=rest-resource-manager-containerapps-2025-01-01)
- [Container Apps Jobs](https://learn.microsoft.com/en-us/azure/container-apps/jobs)
- [GitHub to Azure OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
- [Terraform Azure Blob backend](https://developer.hashicorp.com/terraform/language/backend/azurerm)
- [pg dynamic passwords](https://node-postgres.com/features/connecting)
- [TypeORM migration setup](https://typeorm.io/docs/migrations/setup/)
- [Cost Management Query API](https://learn.microsoft.com/en-us/rest/api/cost-management/query/usage?view=rest-cost-management-2026-06-01)
- [Azure Monitor pricing](https://azure.microsoft.com/pricing/details/monitor/)

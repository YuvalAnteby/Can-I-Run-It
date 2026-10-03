# Finite Azure maintenance programs

Node 24 programs installed with `npm ci --omit=dev --ignore-scripts` in this directory.
The tools image copies this directory into `/app/maintenance` and supplies PostgreSQL
16 `psql`, `pg_dump`, `pg_restore`, and trusted system CA roots. `npm test` uses Node's
built-in test runner; it has no Azure credential or network requirements.

## Identity and configuration

Every invocation explicitly selects `MAINTENANCE_AUTH_MODE=managed-identity` in
Azure (and a nonempty `AZURE_CLIENT_ID` for that Job's UAMI) or
`MAINTENANCE_AUTH_MODE=azure-cli` after trusted release CI's federated Azure login.
There is no default-credential fallback. Export itself requires the exporter UAMI.
The API, firewall controller, checker, and exporter use different identities.

| Variable | Consumers / meaning |
| --- | --- |
| `EXPORT_STORAGE_ACCOUNT` | Firewall/checker/export: private export account, never the Terraform state account |
| `EXPORT_CONTAINER`, `CONTROL_CONTAINER` | Distinct existing private containers; this program never creates/deletes containers |
| `DB_EXECUTOR_RESOURCE_IDS` | Firewall: JSON array of API, migration Job, and export Job ARM IDs; read each separately |
| `POSTGRES_SERVER_RESOURCE_ID` | Firewall: Flexible Server ARM ID |
| `FIREWALL_JOB_RESOURCE_ID`, `EXPORT_JOB_RESOURCE_ID` | Checker: trusted Job ARM IDs |
| `AZURE_SUBSCRIPTION_ID` | Checker: subscription UUID for the verified cost query |
| `CREDIT_PERIOD_START`, `CREDIT_PERIOD_END`, `CREDIT_CURRENCY` | Checker: actual credit period ISO timestamps, end exclusive, currency normally USD |
| `VERIFIED_CREDIT_COST_MAPPING` | Checker: default false; set exactly `true` only after human verification that ActualCost/PreTaxCost matches actual student credit consumption |
| `EXPORT_MANUAL` | Checker: exactly `true` requests a manual export even when schedule/cost thresholds are not due |
| `EXPORT_REQUEST_ID` | Export: checker-generated request ID injected into this execution only |
| `RELEASE_TOOLS_IMAGE_DIGEST` | Export: full immutable `ghcr.io/...@sha256:...` reference used in completion evidence |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` | Export: Azure PostgreSQL hostname, normally 5432, application database, fixed `ciri-exporter` role |
| `POSTGRES_SSL_MODE`, `POSTGRES_SSL_ROOT_CERT` | Export: must be `verify-full`, normally `/etc/ssl/certs/ca-certificates.crt` |

Do not give provider secrets, Terraform state access, or SQL credentials to the
firewall/checker. The exporter needs SQL read-only grants plus Blob Data Contributor
on the export **and control** containers (control lease and final schedule update).
Checker needs control Blob access, scoped Job start/read and optional Cost Management
Reader; it does not need export Blob access or any SQL identity. Firewall needs
control Blob access, executor ARM reads, and scoped Flexible Server firewall writes.

## Commands and trusted release helpers

```sh
node /app/maintenance/cli.mjs firewall
node /app/maintenance/cli.mjs export-check
node /app/maintenance/cli.mjs export
```

The daily checker is configured by Terraform for **02:00 UTC**, timeout 60 seconds.
The hourly controller has the same timeout; programs enforce a 55-second deadline.
The exporter enforces a 590-second deadline within its 600-second Job timeout.
Manual exports go through the protected main-only `Azure - Explicit Maintenance`
workflow, command `export`. It starts the existing checker Job with the trusted
command override `["env","EXPORT_MANUAL=true","node","/app/maintenance/cli.mjs","export-check"]`;
the checker retains its own UAMI, control Blob access and optional Cost Reader.
Ordinary release/human callers need only scoped Job start/read; they do not need
Blob/cost grants or to run the checker locally. This first
starts and confirms firewall success, then records/prepares a leased request and
starts the exporter. Direct exporter executions without that request fail closed.
Keep manual/budget-email fallback enabled while cost mapping is unverified; four
calendar month schedule exports continue. UTC month ends clamp, and credit thresholds
never reset at January 1. Cost queries use the actual period from start until the
current check, validate USD, and never infer credit consumption without the explicit
verification flag. Missing cost data appears in `cost_status` and JSON stdout.

Trusted release CI starts and waits for the scoped firewall Job under
`MAINTENANCE_AUTH_MODE=azure-cli`; it has no firewall write grants itself. Generic Job helpers use:

```sh
# JOB_RESOURCE_ID selects an existing, identity-attached trusted Job.
# Optional JOB_IMAGE_DIGEST is the immutable image for this execution only.
# Optional JOB_COMMAND_JSON is a JSON array, e.g. ["node","/app/dist/database/maintenance.js","migrate"].
node infra/azure/cli.mjs start-job
# Parse stdout execution_name into JOB_EXECUTION_NAME.
# Optional JOB_TIMEOUT_SECONDS defaults to 600 and is capped at 600.
# Wait adds at most 120 seconds for activation and terminal-status propagation.
node infra/azure/cli.mjs wait-job
```

Start deep-copies the existing Job template; secret references, resources and all
other environment variables survive. It does not mutate the Job resource/identity.
The helpers output one JSON line only. Wait succeeds only for the requested terminal
`Succeeded` execution; failure/stopped/timeout is nonzero. No SDK errors, subprocess
stderr, HTTP response bodies or tokens are printed.

## Durable coordination and retention

`firewall.json` and `export.json` are nonsecret control blobs protected by 60-second
leases renewed every 20 seconds, plus ETag conditions on every update. Lease loss
aborts work; nobody breaks another owner's lease. Export waits at most 30 seconds
for the triggering checker's lease handoff. Other competing control invocations fail.

Firewall discovers all executor lists before mutations; each must contain 1–64 exact
public IPv4 addresses, no more than 128 distinct total. App discovery uses ARM
`2025-01-01`; Job discovery/start/execution listing uses `2026-07-01`; PG firewall
operations use `2024-08-01`. Only deterministic `ciri-auto-<IPv4-with-hyphens>` rules
are owned. New rules are created first. Old rules receive durable retirement times
and survive an entire hour before a later successful discovery can prune them.
An empty/failed discovery leaves working rules and metadata unchanged. Failed stale
deletion is nonzero and retries next reconciliation. The controller never opens a
DB connection or wakes the API.

Dump preparation performs real verified-TLS `psql SELECT 1` retries bounded to five
minutes for firewall propagation. Every connection phase obtains a fresh exporter
token. Authentication/SQL failures fail immediately; no shell interpolation or
password command-line argument is used. The complete custom-format PG16 dump contains
the TypeORM migration ledger; `pg_restore --list` validates its contents.

Each UTC/UUID prefix under `exports/` includes the dump, table of contents, SHA-256
file, and manifest. Uploads cannot overwrite existing objects, and compare size and
downloaded hashes under matching ETags before publishing `manifest.json` as the
completion commit point. Retention runs after successful publication, keeps the
newest two complete verified sets, deletes older completion manifests last, and
cleans at most 32 incomplete sets untouched for seven days. It operates only in the
export container, never control/state; account versioning/soft-delete must stay off
for exports so pruning actually limits retained dump copies. Failed dumps/uploads
leave the prior successful copies and unconsumed due/threshold markers in place.
Completion alone updates `last_success_at`, UTC `next_due_at`, and
period-scoped `fired_thresholds`. Failed triggers remain due and retry on the next
daily/manual check; pending live executions are never duplicated.

## Evidence boundary

Local unit tests use storage/ARM doubles and prove policy, ordering, hash validation,
lease conflict/ETag handling, failure preservation and bounded waits. Archive listing
and checksum are **not a restore test**. Validate an actual generated dump with PG16
restore into an isolated disposable database after schema/tool changes.

Before deployment, observe real Azure checks: each executor's independently reported
egress; UAMI selection and token expiry; Entra read-only SQL grants/TLS denial cases;
Blob leases/ETags and read-back uploads under real RBAC; firewall add-before-prune and
propagation; matching Job terminal execution; cost currency/student-credit mapping;
two-set retention after failure/retry; successful downloaded-dump restore. No Azure
provisioning or account integration is implied by local tests.

REST contracts: [Job egress](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/jobs/get?view=rest-resource-manager-containerapps-2026-07-01),
[Job start](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/jobs/start?view=rest-resource-manager-containerapps-2026-07-01),
[execution status listing](https://learn.microsoft.com/en-us/rest/api/resource-manager/containerapps/jobs-executions/list?view=rest-resource-manager-containerapps-2026-07-01),
[Cost Management query](https://learn.microsoft.com/en-us/rest/api/cost-management/query/usage?view=rest-cost-management-2026-06-01).

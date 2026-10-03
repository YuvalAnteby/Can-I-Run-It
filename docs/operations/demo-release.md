# Demo release

This runbook describes the implemented Azure release and the separate local Compose
path. Read the [architecture](../architecture/azure-production.md),
[implementation contract](../architecture/azure-terraform-handoff.md),
[database/export runbook](azure-database.md) and
[acceptance record](azure-acceptance.md). Azure deployment remains blocked until
actual account, ownership, cost, human bootstrap and integration evidence is reviewed.
This release includes the seeded catalog, RAWG discovery and selection, pending-game
pages, measured-first compatibility checks, and persisted Gemini estimates. It excludes
admin login, RabbitMQ, enrichment jobs, and automatic performance ingestion.
Selected RAWG games remain pending: they have provider metadata and support compatibility
checks, but do not join the published catalog automatically. No approval API is exposed.

## Runtime and secrets

For local Compose, copy `infra/.env.example` to `infra/.env` and supply a strong
PostgreSQL password and the actual frontend origin. The frontend receives only the
public `VITE_API_URL` ending in `/api`; provider keys never enter browser variables
or image builds. Production Compose runs the scanned `BACKEND_IMAGE`, keeps
PostgreSQL private, and binds the API to host loopback for a local HTTPS reverse proxy.
Compose provides neither TLS termination nor an Azure deployment.

Azure uses distinct UAMIs, Entra database tokens and versionless native Key Vault
references. A human creates provider values outside Terraform after granting the
API identity vault access. The normal platform/release principals have neither
Key Vault secret-read nor SQL/RBAC administrator permission. The only inline API
secret managed by Terraform is generated Application Insights connection metadata.
SWA's deployment token is held separately as the protected GitHub environment secret
`AZURE_STATIC_WEB_APPS_API_TOKEN`; Terraform does not retrieve it. Retrieve/rotate it
through the authorized human procedure and never log it or place it in state/tfvars.
The API does not trust forwarded IP headers by default. For an ingress that replaces
`X-Forwarded-For`, validated `TRUST_PROXY=1` trusts exactly one hop. Enable this only
when clients cannot bypass that ingress to reach the API directly. For Azure or a
multi-proxy topology, verify the actual routing and trusted client-IP configuration
before enabling it; otherwise visitors may share the ingress's rate-limit bucket.

The guarded check, pending-check, RAWG discovery, and RAWG selection routes admit at
most 10 requests per minute per process/IP and 100 accepted requests per minute per
process across all IPs. Gemini admits 30 new calls per minute with two concurrent
calls; RAWG admits 60 new calls per minute with four concurrent calls. Identical
in-flight provider work joins the existing operation before consuming a provider
permit. Denied work fails fast and does not enter a queue. A provider timeout returns
the normal fallback promptly while its permit remains held until the underlying SDK
or fetch and response body settle. These fixed-window budgets are process-local,
reset on restart, and allow boundary bursts; they are not distributed quotas or
daily/monthly spending caps. NAT clients share an IP bucket, and a client abort
cannot guarantee provider billing cancellation.

Provider keys are optional and missing-key warnings occur once at startup. Bounded
fixed labels (`rate_limit.ip`, `rate_limit.global`, and
`provider.<name>.<budget|concurrency|timeout|failure>`) can be counted in the
backend logs; repeated labels are aggregated for 60 seconds and flushed on graceful
shutdown. The API validates provider responses, avoids raw provider payloads in
logs, and falls back when providers are absent or unavailable. RAWG uses in-flight
coalescing only; it intentionally has no completed-response TTL so local moderation
results stay fresh. Record the actual Gemini model/tier RPM, TPM, RPD, spend-cap and
billing settings, and the RAWG key's plan/allowance before launch. The application
defaults do not establish provider account hard limits.

For the opt-in Azure Monitor setup, cost limits, trace and log correlation, and
post-deployment checks, follow the [observability runbook](observability.md).

## Container App health probes

The backend exposes version-neutral health endpoints. `backend_port` defaults to
4000 and is used for the container `PORT`, HTTPS ingress target, and every HTTP
probe.

| Endpoint               | Dependency                  | Healthy response                          | Unavailable response             |
| ---------------------- | --------------------------- | ----------------------------------------- | -------------------------------- |
| `/api/health/live`     | Running Nest process only   | `200 {"status":"ok"}`                     | The process is not serving       |
| `/api/health/ready`    | PostgreSQL only             | `200 {"status":"ok"}`                     | `503 {"status":"unavailable"}`   |
| `/api/health/postgres` | PostgreSQL diagnostic check | Terminus `status`/`info`/`details` result | Terminus diagnostic error result |

Readiness has a 1000 ms PostgreSQL indicator timeout and never calls Gemini or
RAWG. Liveness performs no dependency I/O. Probe responses contain no database
errors, hostnames, credentials, provider details, or other public diagnostics.
The PostgreSQL endpoint remains diagnostic tooling and is not used for a restart
probe.

The production root owns a default-network Consumption environment and one Single
revision API, min0/max1, 0.5 CPU/1 GiB, HTTPS ingress on port4000 and100% latest traffic.
It declares Startup `/api/health/live` every5s with30 failures, Liveness on that path
every10s with3 failures, and Readiness `/api/health/ready` every5s with1 failure and1
success. Every probe timeout is2s. Scale-to-zero and platform/revision transitions
require actual cold-start and active-revision evidence; replica settings are not a
hard spending cap. Old publicly labeled revision endpoints are forbidden.

Use the [Terraform runbook](../../infra/terraform/README.md) to inventory and import
existing resource ownership before creating anything. AzAPI owns secret-sensitive
resources and exports only frontend/API hostnames. Release ignores only the API
container image property in Terraform; security, scale, environment, identity and
probes remain platform-owned. Do not dump state or raw plan values into public logs.
Before enabling `TRUST_PROXY=1`, inspect the selected subscription and deployed
Container App, confirm HTTP ingress is the only public API path, and verify that
internal callers cannot bypass ingress to reach Express with attacker-controlled
forwarding headers. Retain redacted mode/scale/traffic and controlled request-IP
observations in the release record. Repeat the checks after routing or topology
changes; local HTTP tests cannot prove Azure's external client network or bypass
paths.

When the running app loses PostgreSQL, readiness returns 503 while startup and
liveness continue to succeed for the running process. Restoring database
connectivity returns readiness to 200 without restarting the process. The
custom DataSource factory waits for the initial connection with five bounded attempts.
Each new pool connection acquires a fresh token in Entra mode and verifies TLS trust
and hostname. Migration/export connection checks additionally allow bounded firewall
propagation retries; failed credentials or SQL permissions block release.
## Database maintenance

Fresh local volumes still run `infra/init-scripts/` once; existing volumes do not
rerun initialization SQL. The tools CLI now adopts a complete current schema without
replaying legacy001, upgrades complete legacy schemas, or creates an empty schema.
Partial schemas fail for operator review. Every change uses one TypeORM ledger and
an advisory lock; the API never runs migrations, seed or synchronization on startup.

Use the [database tools runbook](../../infra/database/azure/README.md). Migrate with
`node /app/dist/database/maintenance.js migrate`; inspect with `show`. Seed is an
explicit human command `seed`, inserts missing stable records and preserves IDs and
operator edits. Back up and verify restore before upgrading an existing database.
The migrator owns only the application schema and has TEMPORARY privilege for seed
staging; it cannot administer roles or databases.

For a local production Compose database, pull the scanned tools digest and run it on
that Compose network using the central env file and service-name PostgreSQL host:

```sh
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml stop backend
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml up -d --wait postgres
docker run --rm --network can-i-run-it-prod_ciri-net-prod --env-file infra/.env \
  -e POSTGRES_HOST=postgres -e POSTGRES_PORT=5432 \
  ghcr.io/yuvalanteby/can-i-run-it-tools@sha256:<scanned-digest> \
  node /app/dist/database/maintenance.js migrate
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml pull backend
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml up -d --no-build
```

## Artifacts and release gates

PR checks preserve lint, type checking, unit/seeded-PG E2E tests, frontend build,
HIGH npm audits and HIGH/CRITICAL container scans. New checks validate the three
Terraform roots without cloud credentials, contract/maintenance tests, GitHub Actions
syntax, and the PG16 tools build/scan. These checks cannot configure repository
branch protection; require them before merging staging/main.

On trusted `main`, `.github/workflows/backend-cd-prod.yml` reruns all three reusable
checks, builds and scans both images before publishing either, then verifies anonymous
GHCR manifests. Set both package visibilities to public before enabling deployment:

- `ghcr.io/yuvalanteby/can-i-run-it-backend:sha-<full-commit>`
- `ghcr.io/yuvalanteby/can-i-run-it-tools:sha-<full-commit>`

Deployments use immutable digests, not mutable tags. Normal release is disabled until
`AZURE_DEPLOY_ENABLED=true` and protected bootstrap/acceptance gates are verified.
The release UAMI uses environment-bound OIDC, starts the scoped firewall Job and
requires terminal success, then starts the migration Job with this release's tools
digest and requires terminal success. A failed/concurrent migration blocks API update.
It never invokes seed. The image update PATCH preserves the existing API template
and changes only its image; it does not list secrets. The SPA is built against the
observed API origin and uploaded with its separately stored SWA token and checked
navigation fallback. Smoke verifies readiness, exact/denied CORS, DB catalog and a
human-verified measured compatibility tuple, actual module asset and deep links.

The known measured smoke tuple is protected metadata `AZURE_SMOKE_CHECK_JSON`.
Verify it against the actual database before enabling release and after dataset edits;
an absent tuple can enter the application's normal provider fallback before the smoke
rejects its non-measured response. Do not use arbitrary hardware/provider test requests.

Platform changes use `.github/workflows/azure-platform.yml`, main-only, with a dated
complete account/cost/reconciliation worksheet. Plan files and receipts are uploaded
to the private state container; review them there. Apply selects an exact same-commit
plan within24h, checks account/tenant/region/inputs/cost/binary SHA, and applies those
bytes. It cannot bootstrap RBAC, Entra administrator membership or provider values.

## Rollback and live evidence

Record previous/current API and tools digests, migration ledger, SPA artifact, terminal
Job execution names, revision/traffic checks and smoke evidence. If migration fails,
retain the prior API. For an API/SPA regression, use a protected trusted human/release
session to PATCH the previous scanned digest and upload the previous SPA artifact;
verify latest-ready revision, no old labels, readiness/CORS/catalog/compatibility again.
Do not automatically reverse schema migrations. Restore a verified export into an
isolated PG16 target first and use a reviewed forward fix or restore plan.

[Azure acceptance](azure-acceptance.md) lists all remaining real integration checks.
Nothing in local checks establishes provisioning, free entitlements or a guaranteed
one-year budget. Admin POST/PATCH remains [issue82](https://github.com/YuvalAnteby/Can-I-Run-It/issues/82).

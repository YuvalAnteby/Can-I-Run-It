# Demo release

This release includes the seeded catalog, RAWG discovery and selection, pending-game
pages, measured-first compatibility checks, and persisted Gemini estimates. It excludes
admin login, RabbitMQ, enrichment jobs, and automatic performance ingestion.
Selected RAWG games remain pending: they have provider metadata and support compatibility
checks, but do not join the published catalog automatically. No approval API is exposed.

## Runtime and secrets

Copy `infra/.env.example` to `infra/.env` and supply a strong database password.
Set `REACT_URL` to the Azure static frontend HTTPS origin. Build the frontend with
`VITE_API_URL` set to the public HTTPS API URL ending in `/api`.
`GEMINI_API_KEY` and `RAWG_API_KEY` are optional, backend-only runtime secrets.
Never set provider secrets in a `VITE_` variable: those variables become public JavaScript.
Both Docker build contexts exclude environment files. The frontend receives no runtime secrets.

The production Azure deployment (infrastructure, first deploy, release pipeline,
acceptance checks and teardown) is described in the
[Azure production runbook](azure.md). There, Terraform sets the API runtime
values and the release workflow builds the frontend.

The frontend is static content for Azure hosting; no frontend image is published.
Configure SPA route fallback to `index.html` on the static host. The backend image
is deployed separately, behind an HTTPS ingress. Production Compose keeps PostgreSQL
private and binds the API to host loopback port `${BACKEND_PORT:-4000}` for a local
HTTPS reverse proxy; it does not provide TLS or an Azure deployment.

The API does not trust forwarded IP headers by default. For an ingress that replaces
`X-Forwarded-For`, validated `TRUST_PROXY=1` trusts exactly one hop. Enable this only
when clients cannot bypass that ingress to reach the API directly. For Azure or a
multi-proxy topology, verify the actual routing and trusted client-IP configuration
before enabling it; otherwise visitors may share the ingress's rate-limit bucket.
The Azure deployment sets `TRUST_PROXY=1`: the Container App's external ingress
is the API's only public path.

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

The backend exposes version-neutral health endpoints. On Azure the API listens on
port 4000, which is the container `PORT`, the HTTPS ingress target, and the port
of every HTTP probe.

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

On Azure, Terraform configures these probes on `ca-ciri-api`: startup and
liveness on `/api/health/live`, readiness on `/api/health/ready`, each with a
failure threshold of at most 10. The app runs in single revision mode and
scales between zero and one replica with 0.5 CPU and 1 GiB memory. See the
[Azure production runbook](azure.md) for the exact resources and the
acceptance checks.

When the running app loses PostgreSQL, readiness returns 503 while startup and
liveness continue to succeed for the running process. Restoring database
connectivity returns readiness to 200 without restarting the process. The
custom DataSource factory still waits for its initial database connection before
Nest starts listening and has no retry loop. The startup probe budget allows a
slow successful startup, but it does not create application retries or guarantee
boot during an initial database outage; bootstrap behavior is unchanged.

## Existing databases

Fresh volumes use `backend/src/database/init-scripts/` and need no migrations. Existing volumes do
not rerun initialization SQL. Back up the database and stop the old API before upgrading.
For a database from `main` before this PR, set `BACKEND_IMAGE` in `infra/.env`
to the scanned GHCR `sha-<full-commit>` tag. Then run these once, in order.
The commands expand credentials inside the Postgres container, using its configured
environment; no host-shell export is required.

```sh
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml stop backend
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml up -d --wait postgres
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml exec -T postgres \
  sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < infra/migrations/001-v2-game-lifecycle.sql
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml exec -T postgres \
  sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < infra/migrations/002-demo-performance-source.sql
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml pull backend
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml up -d --no-build
```

The first migration preserves game IDs, publishes the existing catalog, and adds RAWG
identity/lifecycle fields. Do not rerun it on an already migrated staging database.
The second adds performance provenance and recognizes legacy rows with
`source_url = 'gemini'` as AI estimates. It preserves existing source values.
Neither migration creates a queue table or drops application data.

## Artifacts and merge gate

PR checks run lint, type checks, unit tests, seeded PostgreSQL E2E tests, dependency
audits, the frontend static build, and the backend production Docker build. High/critical npm and container-image
advisories fail CI. Images are scanned again before GHCR publication.
On a push to `main`, the production workflow reruns both reusable CI workflows before
publishing the backend image to GHCR:

- `ghcr.io/yuvalanteby/can-i-run-it-backend:sha-<full-commit>`

The backend also receives `latest`; use commit tags for deployment. Production
Compose requires `BACKEND_IMAGE` and has no build path, so it runs the scanned artifact
instead of rebuilding from source. Provider keys
are never build arguments. When the Azure repository variables are set, the same
workflow then deploys that image by digest to the API Container App; without
them the deploy job is skipped. Cloudflare Pages builds and hosts the frontend
from the same `main` commit. See the [Azure production runbook](azure.md). Require successful PR checks in branch
protection before merge. A PR cannot itself enforce repository branch-protection settings.

The release was curated onto `main` without importing excluded v2 commits as ancestors,
so they remain available for a later staging integration.

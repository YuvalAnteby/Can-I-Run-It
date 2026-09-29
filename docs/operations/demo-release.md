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

The frontend is static content for Azure hosting; no frontend image is published.
Configure SPA route fallback to `index.html` on the static host. The backend image
is deployed separately, behind an HTTPS ingress. Production Compose keeps PostgreSQL
private and binds the API to host loopback port `${BACKEND_PORT:-4000}` for a local
HTTPS reverse proxy; it does not provide TLS or an Azure deployment.

The API does not trust forwarded IP headers by default. For an ingress that replaces
`X-Forwarded-For`, `TRUST_PROXY=1` explicitly trusts exactly one hop. Enable this only
when clients cannot bypass that ingress to reach the API directly. For Azure or a
multi-proxy topology, verify the actual routing and trusted client-IP configuration
before enabling it; otherwise visitors may share the ingress's rate-limit bucket.

Compatibility checks and RAWG discovery/selection have per-process IP limits.
Each guarded route group also allows at most 100 accepted requests per minute across
all IPs, and Gemini allows at most 30 new calls per minute with concurrent identical
requests coalesced. These process-local budgets are not a distributed quota or a daily spending cap. Set provider quotas/budgets before
public deployment, and keep one API replica until shared limits are implemented.
The API uses provider timeouts, validates responses, renders text without raw HTML,
and falls back when providers are absent or unavailable.

## Existing databases

Fresh volumes use `infra/init-scripts/` and need no migrations. Existing volumes do
not rerun initialization SQL. Back up the database and stop the old API before upgrading.
For a database from `main` before this PR, run these once, in order, through the
Postgres service (replace `$POSTGRES_USER` / `$POSTGRES_DB` with your configured values):

```sh
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < infra/migrations/001-v2-game-lifecycle.sql
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  < infra/migrations/002-demo-performance-source.sql
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

The backend also receives `latest`; use commit tags for deployment. Provider keys
are never build arguments. This workflow publishes only the backend image; it does
not deploy the application or upload frontend files to Azure. Require successful PR checks in branch
protection before merge. A PR cannot itself enforce repository branch-protection settings.

The release was curated onto `main` without importing excluded v2 commits as ancestors,
so they remain available for a later staging integration.

# V1 Publishable Demo Design

## Goal

Make the published Can I Run It demo deterministic and honest about where its
results come from, while making a clean Docker checkout reproducible and
documenting the behavior users can rely on.

## Scope

This design covers GitHub issues #54, #55, #56, #57, #58, #59, #60, and #47.
The dependency order is database provenance and seed, compatibility contract,
endpoint protection, source-aware frontend, About page, production Compose,
then end-to-end verification and documentation.

It does not add accounts, authentication, Redis, queues, enrichment, admin
workflows, automatic ingestion, nearest-hardware matching, ML prediction, or
provider-specific infrastructure.

## Architecture

The existing NestJS `CheckService` remains the single orchestration point for
the measured, cached-provider, provider, and heuristic paths. Small shared
response-building helpers will apply the same verdict threshold and hardware
warning rules to every path. TypeORM entities and the ordered PostgreSQL init
scripts remain the schema source of truth; no new migration framework is
introduced.

The React application continues to use the existing Axios instance and React
Query mutation. The API returns explicit provenance and verdict fields; the
frontend renders those fields directly and never infers provenance from
boolean or missing fields.

## Database provenance and lookup

`performance_records.source` is a non-null `varchar` with a default of
`measured`. The string form allows future provider identifiers without another
database enum migration. Existing rows are backfilled to `measured`; seeded
rows explicitly use `measured`. `source_url` remains nullable and contains
URLs only.

Gemini rows use `source = 'gemini'`, `verified = false`, and a null
`fps_1_percent_low`. Heuristic and future ML results are never inserted into
`performance_records`.

The core exact lookup identity is exactly these six fields:

1. game
2. CPU
3. GPU
4. RAM
5. resolution
6. settings preset

The requested upscaler and upscaler quality are optional match preferences,
not identity requirements. A lookup first filters by the six core fields,
then orders measured rows before provider rows, prefers the requested
upscaler and quality when supplied, and finally prefers the newest row. This
preserves the rule that a matching measured row always outranks a Gemini row,
while allowing a result recorded with a different upscaler when no preferred
match exists. Target FPS, SSD, and storage capacity are never lookup identity
fields.

The check flow is:

1. Validate the public request and load the game, CPU, and GPU.
2. Resolve the requested requirement tier for contextual checks; absence of
   requirements is valid catalog data.
3. Run the six-field lookup with the ordering above.
4. Return a measured response when the selected row is measured.
5. Reuse a matching stored provider row when the selected row is a provider
   result.
6. Call Gemini only when no matching stored row exists; persist only its
   average FPS under `source = 'gemini'` when no measured match exists.
7. Use the requirements-based heuristic only when requirements provide enough
   context; otherwise return `Insufficient data`.

## API contract

The request adds `targetFps`, accepted only as `30`, `60`, `90`, `120`, or
`144`, with a default of `60`. The request may carry optional upscaler fields
for the lookup, while the current UI continues to default to `off`.
Requirement tier remains contextual and never supplies the verdict threshold.
CPU/GPU IDs, RAM, and resolution keep explicit boundary validation.

The response uses these fields:

```typescript
type CheckVerdict =
  | 'Can run'
  | "Can't run"
  | 'Likely can run'
  | "Likely can't run"
  | 'Insufficient data';

type CheckState = 'can' | 'cant' | 'insufficient';
type CheckSource = 'measured' | 'ai' | 'estimate';

interface CheckResponse {
  state: CheckState;
  verdict: CheckVerdict;
  sub: string;
  source: CheckSource | null;
  provider: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  targetFps: 30 | 60 | 90 | 120 | 144;
  fps: {
    low: number;
    med: number;
    high: number;
    ultra: number;
  } | null;
  gpuPass: boolean | null;
  cpuPass: boolean | null;
  ramPass: boolean | null;
  vramPass: boolean | null;
  ssdPass: boolean | null;
  notes: string[];
}
```

Measured rows use `source = 'measured'`, no provider, and the exact verdict
based on recorded average FPS versus the selected target. Provider rows use
`source = 'ai'` and the stored provider name, such as `gemini`. Heuristic rows
use `source = 'estimate'`. Insufficient responses have null source/provider/
confidence and no FPS values.

All predicted or measured paths use the selected preset's FPS and selected
target FPS. A VRAM shortage against the selected requirement changes the main
verdict to the failing wording even when the FPS threshold passes. SSD
mismatch produces an advisory note and never changes the main verdict.
CPU, GPU-model, and RAM checks remain advisory evidence for non-measured
responses. Storage capacity is not collected or evaluated.

## Public endpoint protection

`POST /api/v1/check` receives a singleton in-process rate-limit guard keyed by
the request IP. It allows 10 checks in each one-minute window and returns HTTP
429 with a retry hint after the limit. Catalog and health reads are not
guarded.
This deliberately has single-process scope; distributed deployments can
replace it with shared state when multiple backend instances require a global
limit.

Gemini uses an 8-second server timeout while the frontend Axios request
timeout is 10 seconds, so the backend can fall through before the browser
gives up. Missing keys, timeouts,
provider errors, and invalid provider payloads all return the normal fallback
or insufficient-data result. Provider credentials and internal exceptions are
never included in API responses or browser logs.

Production CORS accepts the configured frontend origin only. Development has
a localhost fallback. The Gemini key is read only by NestJS and is not
prefixed for Vite or copied into the frontend bundle.

## Frontend behavior

The check form adds a native target-FPS select with the five supported values
and a default of 60. The result card renders the API verdict and selected
target, plus:

- `Verified` for measured data
- `AI` for provider results, displaying the provider name
- `Estimate` for heuristic results
- separate VRAM failure and SSD advisory messages
- no FPS panel for insufficient data
- explicit loading, rate-limit, timeout/network, validation, and generic
  failure messages

The `/about` route is linked from the header and footer. It describes the
actual inputs, target-FPS behavior, result priority, badges, limitations,
VRAM/SSD rules, curated dataset, repository, and actual NestJS/React/
PostgreSQL/Docker/Gemini stack. It makes no claims about dataset scale,
automatic enrichment, ingestion, accounts, or current ML support.

## Deployment and documentation

The production Compose file mounts `infra/init-scripts/` into PostgreSQL,
waits on the database health check before starting the backend, keeps the
production volume persistent, and leaves TypeORM synchronization disabled.
The backend uses the Docker service name `postgres` for database access.

The tracked `infra/.env.example` documents database, port, CORS, Gemini, and
frontend API settings. The production frontend receives `VITE_API_URL` at
build time. The provider-neutral runbook documents build, start, health
verification, logs, updates, and database-volume recovery. No public demo URL
will be invented; the runbook will state that the URL is pending until one is
provided.

CI will install, lint, type-check, test, and production-build both backend and
frontend. Docker-backed backend tests will boot an empty PostgreSQL service
with the tracked schema and seed scripts, then exercise at least one real API
journey against the seeded catalog.

## Verification

Backend tests will cover DTO validation, exact lookup ordering, measured
priority, provider persistence/reuse, target-FPS verdicts, VRAM override, SSD
advisories, insufficient data, provider fallback, and rate limiting. The
Docker E2E suite will prove a seeded measured request through the real API.
Frontend tests will cover every badge, every verdict, warnings, insufficient
data, loading, and error states, plus the About route. The final verification
will run the root test command, both TypeScript checks, both linters, both
production builds, and the documented Docker test flow.

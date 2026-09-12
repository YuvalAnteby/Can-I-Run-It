# Backend

The backend is a NestJS 11 REST API written in TypeScript. It uses TypeORM with
PostgreSQL for the catalog and performance records, and optionally calls Gemini
when no stored result matches a compatibility request.

## Configuration

Development and production Docker stacks read the repository-level `infra/.env`;
the isolated test stack uses deterministic values from its Compose file. Do not
create a separate backend environment file. Start from `infra/.env.example` and
keep database credentials and `GEMINI_API_KEY` out of version control.

Within Compose, PostgreSQL is available to NestJS as `postgres:5432`.
Production schema synchronization is disabled; tracked SQL in
`infra/init-scripts/` creates and seeds a fresh PostgreSQL volume.

## Public compatibility API

`POST /api/v1/check` accepts JSON in this shape:

```json
{
    "gameSlug": "cyberpunk-2077",
    "hardware": {
        "cpuId": 1,
        "gpuId": 1,
        "ramGb": 32,
        "isSsd": true
    },
    "settings": {
        "resolutionWidth": 1920,
        "resolutionHeight": 1080,
        "tier": "recommended",
        "preset": "ultra",
        "targetFps": 60,
        "upscaler": "DLSS",
        "upscalerQuality": "quality"
    }
}
```

`tier`, `targetFps`, `upscaler`, and `upscalerQuality` are optional. Presets are
`low`, `medium`, `high`, or `ultra`. Target FPS accepts only `30`, `60`, `90`,
`120`, or `144` and defaults to `60`. Upscaler values are `off`, `DLSS`, `FSR`,
or `XeSS`; quality values are `quality`, `balanced`, `performance`, or
`ultra_performance`.

The stored-record identity is exactly:

1. game
2. CPU
3. GPU
4. RAM
5. resolution width and height
6. settings preset

Upscaler and quality only rank matching candidates. Target FPS, requirement
tier, SSD choice, and storage capacity do not change the lookup identity.
Measured rows rank before all provider rows, then an upscaler preference and
the newest record break ties.

A successful response contains the explicit verdict, provenance, selected
target, FPS data when available, hardware checks, and notes:

```json
{
    "state": "can",
    "verdict": "Can run",
    "sub": "Measured ~90fps at 1080p ultra",
    "source": "measured",
    "provider": null,
    "confidence": "high",
    "targetFps": 60,
    "fps": { "low": 200, "med": 150, "high": 120, "ultra": 90 },
    "gpuPass": null,
    "cpuPass": null,
    "ramPass": null,
    "vramPass": true,
    "ssdPass": true,
    "notes": []
}
```

The possible verdicts are `Can run`, `Can't run`, `Likely can run`,
`Likely can't run`, and `Insufficient data`. Provenance is:

- `measured`: a stored benchmark; exact verdict wording.
- `ai`: a stored or new provider estimate; `provider` currently identifies
  Gemini and verdict wording is qualified with “Likely”.
- `estimate`: the local requirements-based heuristic; low confidence and
  “Likely” verdict wording.
- `null`: insufficient data; `fps`, provider, confidence, and hardware checks
  are also null.

The selected preset's FPS is compared with `targetFps`. Insufficient VRAM forces
a failing verdict even when FPS meets the target. SSD mismatch adds an advisory
note only. Fresh Gemini estimates and local heuristic results may include
advisory CPU, GPU-model, and RAM comparisons; cached provider and measured rows
return those checks as `null`. Storage capacity is not accepted or evaluated.

The route allows ten requests per IP per one-minute window and returns HTTP 429
with `Retry-After` after the limit. This guard is per backend process, not a
distributed limit.

## Fallback behavior

The compatibility flow is measured record, stored provider record, Gemini,
then local heuristic. A valid new Gemini result is cached as unverified provider
data with its average FPS only; no 1% low value is fabricated. Heuristic results
are never stored.

Gemini is skipped or treated as unavailable when its key is missing, the
eight-second request times out, the provider errors, or its payload is invalid.
NestJS then uses the heuristic only when game requirements provide enough
context; otherwise it returns `Insufficient data` with no FPS values.
Additional providers and an ML prediction path are future work.

## Commands

Run package commands from `backend/`:

```bash
npm ci
npm run start:dev
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run start:prod
```

Local package execution requires a reachable PostgreSQL instance and matching
environment variables. The supported full-stack path is the repository Compose
setup documented in the [root README](../README.md).

With the default development ports:

- Swagger: <http://localhost:4000/api/docs>
- Database health: <http://localhost:4000/api/health/postgres>
- Compatibility check: <http://localhost:4000/api/v1/check>

## Tests and CI

Jest covers unit tests and Supertest covers E2E behavior. The isolated Compose
test command starts a clean PostgreSQL service with tracked schema/seed scripts,
runs unit tests, and exercises a seeded compatibility request through the real
API. CI also runs lint, type-check, production build, frontend checks, and a
Docker build.

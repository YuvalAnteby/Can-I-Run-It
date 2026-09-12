# Can I Run It

Can I Run It is a full-stack PC gaming compatibility checker. Choose a game,
CPU, GPU, RAM, storage type, resolution, graphics preset, and target FPS to get
a source-labelled compatibility result.

Public demo URL: pending.

## Architecture

- NestJS 11 and TypeORM provide the REST API and compatibility orchestration.
- React 19, Vite, React Query, Axios, and Tailwind CSS provide the browser UI.
- PostgreSQL 16 stores the game catalog, hardware, requirements, and performance
  records.
- Gemini is the optional AI fallback when no matching stored record exists.
- Docker Compose runs development, production, and isolated backend test stacks.
- GitHub Actions checks linting, types, tests, production builds, and the
  Docker-backed API journey.

The frontend calls the NestJS API; NestJS is the only service that accesses
PostgreSQL or the Gemini credential. Containers reach PostgreSQL as
`postgres:5432` on their Compose network.

## Compatibility behavior

The exact stored-record lookup identity has six parts: game, CPU, GPU, RAM,
resolution, and graphics preset. Target FPS, SSD choice, and storage capacity
are not lookup fields. Upscaler and upscaler quality are optional preferences:
a preferred match wins within the selected source group, but another matching
record may be used when the preference is unavailable.

Results are selected in this order:

1. A matching measured record (`Verified` in the UI).
2. A stored provider result, or a new Gemini result (`AI`).
3. A requirements-based heuristic (`Estimate`).
4. `Insufficient data` when neither provider data nor enough requirement data
   is available. This outcome has no FPS values or provenance badge.

Measured records always outrank provider records. Gemini results cache only the
average FPS as unverified provider data; heuristic results are not persisted.
The supported target FPS values are `30`, `60`, `90`, `120`, and `144`, with
`60` used by default. A VRAM shortage overrides an otherwise positive verdict.
An SSD mismatch is advisory and does not change the verdict. Storage capacity
is not collected or evaluated.

## Run with Docker

### Prerequisites

- Docker with Docker Compose
- Git

### Configuration

`infra/.env` is the single configuration file used by the development and
production Compose stacks. The isolated test stack uses deterministic values
from its Compose file instead. Copy the tracked template, then replace its
example values for your environment:

```bash
cp infra/.env.example infra/.env
```

Keep `POSTGRES_HOST=postgres` for containers. `REACT_URL` is the browser-facing
frontend origin allowed by production CORS. `VITE_API_URL` is compiled into the
production frontend and must be a browser-reachable backend URL ending in
`/api`. Set `GEMINI_API_KEY` to a valid key to enable Gemini, or leave it empty
to use the heuristic/insufficient-data fallback.

Do not commit `infra/.env`.

### Development

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --build
```

With the template's default ports, open:

- Frontend: <http://localhost:3000>
- API: <http://localhost:4000/api>
- Swagger: <http://localhost:4000/api/docs>
- PostgreSQL health: <http://localhost:4000/api/health/postgres>

Follow or stop the development stack with:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml logs -f
docker compose --env-file infra/.env -f infra/docker-compose.yml down
```

### Production

```bash
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml up -d --build
```

The production frontend is built with `VITE_API_URL`, starts only after the API
is healthy, and the API starts only after PostgreSQL is healthy. Production
TypeORM schema synchronization is disabled.

Useful production operations:

```bash
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml ps
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml logs -f
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml pull
docker compose --env-file infra/.env -f infra/docker-compose.prod.yml up -d --build
```

### Tests

The isolated test stack initializes PostgreSQL, runs backend unit tests, then
runs the real database E2E suite, including `POST /api/v1/check`:

```bash
docker compose -f infra/docker-compose.tests.yml up --build --exit-code-from backend --abort-on-container-exit
```

## Schema and seed data

The tracked files in `infra/init-scripts/` define the PostgreSQL schema and the
curated demo seed. PostgreSQL runs them in filename order when it initializes a
fresh Compose volume. They do not rerun on every container restart.

Development and production use persistent named volumes. To apply a fresh
bootstrap, first back up any data you need, then remove the relevant stack's
volume with `docker compose --env-file infra/.env -f <compose-file> down -v` and
start it again. The `-v` operation permanently deletes that stack's database
volume.

## API

The public compatibility route is `POST /api/v1/check`. See the
[backend guide](backend/README.md) for the request/response contract and API
limits. See the [frontend guide](frontend/README.md) for UI behavior and local
scripts.

## Current limits and future work

The tracked seed is curated, not exhaustive. Gemini is the only implemented AI
provider, uses an eight-second backend timeout, and can be unavailable because
of configuration, provider errors, or invalid responses. The fallback heuristic
is deliberately coarse and requires usable game requirements. The check route's
ten-requests-per-minute limit is in process, so it is not shared across multiple
backend replicas.

Future work includes additional AI providers, provider-neutral orchestration,
a trained ML performance model, broader measured coverage, and shared rate
limiting for multi-replica deployments.

## License

This project is licensed under the [Mozilla Public License 2.0](LICENSE).

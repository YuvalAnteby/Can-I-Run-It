# Azure Backend Database Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the API connect to Azure Postgres with a managed-identity token over verified TLS, and create its own schema through a TypeORM baseline migration, while local Compose, the tests Compose and the production image keep working unchanged.

**Architecture:** A pure, unit-tested `buildDatabaseOptions(env)` builder replaces the inline options in `database.providers.ts`. The canonical schema/seed SQL moves from `infra/init-scripts/` to `backend/src/database/init-scripts/` (copied into `dist/` as Nest assets); Compose mounts that directory as `docker-entrypoint-initdb.d`, and a baseline migration replays the same files only when `public.games` does not exist.

**Tech Stack:** NestJS 11, TypeORM 0.3.31, pg 8.16, `@azure/identity` 4.13, Jest 30.

**Spec:** `docs/superpowers/specs/2026-10-15-azure-lean-infra-design.md` (Workstream 2)

## Global Constraints

- `POSTGRES_AUTH_MODE`: `password` (default; local Compose unchanged) or `entra`.
- Entra: `password` is an async function calling `new ManagedIdentityCredential({ clientId: AZURE_CLIENT_ID }).getToken('https://ossrdbms-aad.database.windows.net/.default')`; one credential per builder call (it caches), a token per physical connection.
- `POSTGRES_SSL`: `disable` (default) or `verify-full` → `ssl: { rejectUnauthorized: true }` (Node's bundled roots, no CA file).
- Pool max 5. Invalid values fail fast at startup with a clear message.
- `migrationsRun: true`; one baseline migration applying 01–05; no-op when `to_regclass('public.games')` is not null.
- `@azure/identity` is an explicit dependency.
- Infra-enabling only: no business-logic changes; existing unit and E2E suites pass unchanged.
- Out of scope: `infra/terraform/`, `.github/`, `frontend/`, `docs/operations/` (report path changes instead).
- Conventional Commits, scope `backend`/`database`; no Co-Authored-By line.

## Review Focus

1. Existing local volume (schema created by init SQL) → baseline records itself and logs that it skipped; no `CREATE TYPE` "already exists" crash. Test: Task 2 "skips when games exists".
2. Fresh Azure database as the Entra admin → baseline creates `pg_trgm` and all tables inside one migration transaction. Test: Task 2 "runs 01–05 in order"; Docker run against an empty DB (Task 4).
3. Production image layout (`dist/` only) → SQL files are present at the path the migration resolves. Test: Task 2 "resolves every init script on disk" plus `ls dist/database/init-scripts` after `npm run build` (Task 3).
4. Entra mode with TLS disabled or missing `AZURE_CLIENT_ID`/host/user/db → startup throws naming the variable. Test: Task 1 validation cases.
5. Token request fails or returns null → connection attempt rejects with a clear error rather than sending an empty password. Test: Task 1 "rejects when no token".

---

### Task 1: Connection options builder

**Files:**
- Create: `backend/src/database/database.config.ts`
- Test: `backend/src/database/database.config.spec.ts`
- Modify: `backend/package.json`, `backend/package-lock.json` (`@azure/identity` `^4.13.3` in `dependencies`)

**Interfaces:**
- Produces: `export const POSTGRES_ENTRA_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default'`; `export function buildDatabaseOptions(env: NodeJS.ProcessEnv = process.env): PostgresConnectionOptions` returning `type 'postgres'`, host/port/username/database, `password` (string or async fn), `ssl` (`false` | `{ rejectUnauthorized: true }`), `poolSize: 5`, `entities`, `synchronize: false`, `migrations: [Baseline1792022400000]`, `migrationsRun: true`.
- Consumes: `Baseline1792022400000` from Task 2 (Task 1 may land first with `migrations: []` and Task 2 adds it).

- [ ] **Step 1: Write failing tests** (`jest.mock('@azure/identity')`):
  - defaults: `{}` → host `postgres`, port 5432, username `username`, password `changeme`, database `myciridb`, `ssl` false, `poolSize` 5, `synchronize` false, `migrationsRun` true.
  - password mode reads `POSTGRES_HOST/PORT/USER/PASSWORD/DB`.
  - `POSTGRES_SSL=verify-full` → `ssl` equals `{ rejectUnauthorized: true }`.
  - throws `/POSTGRES_AUTH_MODE/` for `token`; `/POSTGRES_SSL/` for `require`; `/POSTGRES_PORT/` for `abc` and `70000`.
  - entra: throws `/verify-full/` when SSL disabled; throws naming each of `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_DB`, `AZURE_CLIENT_ID` when missing; throws `/AZURE_CLIENT_ID/` for a non-GUID.
  - entra valid: `ManagedIdentityCredential` constructed once with `{ clientId }`; `password` is a function; calling it twice calls `getToken(POSTGRES_ENTRA_SCOPE)` twice and resolves the token string.
  - entra "rejects when no token": `getToken` resolves `null` → `password()` rejects `/token/`.
- [ ] **Step 2:** `npx jest src/database/database.config.spec.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement the builder; `npm install @azure/identity@^4.13.3`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(database): add Entra-aware connection options builder`.

### Task 2: Baseline migration and SQL move

**Files:**
- Move (`git mv`): `infra/init-scripts/0{1..5}-*.sql` → `backend/src/database/init-scripts/`
- Create: `backend/src/database/migrations/1792022400000-baseline.ts`
- Test: `backend/src/database/migrations/1792022400000-baseline.spec.ts`
- Modify: `backend/nest-cli.json` (`compilerOptions.assets: [{ "include": "database/init-scripts/*.sql", "watchAssets": true }]`)

**Interfaces:**
- Produces: `export class Baseline1792022400000 implements MigrationInterface` (`name = 'Baseline1792022400000'`); `export const INIT_SCRIPTS_DIR` (absolute, `path.resolve(__dirname, '../init-scripts')`); `export const INIT_SCRIPT_FILES` (the five filenames, in order).
- `up(queryRunner)`: `SELECT to_regclass('public.games') IS NOT NULL AS "exists"`; if true, log via Nest `Logger` that the schema exists and return; else `queryRunner.query(readFileSync(file))` for each file in order. `down()` is a no-op (re-running `up` against an existing schema is already a no-op).

- [ ] **Step 1: Write failing tests** with a fake `QueryRunner` (`{ query: jest.fn() }`):
  - "skips when games exists": first query returns `[{ exists: true }]` → `query` called exactly once.
  - "runs 01–05 in order": returns `[{ exists: false }]` → calls 2–6 receive the contents of `INIT_SCRIPT_FILES` in order (assert first contains `CREATE TYPE gpu_brand`, last contains `INSERT INTO game_engines`).
  - "resolves every init script on disk": each `path.join(INIT_SCRIPTS_DIR, f)` exists.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement, move SQL, wire into builder `migrations`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(database): add baseline migration from init scripts`.

### Task 3: Wire providers, Compose mounts, docs

**Files:**
- Modify: `backend/src/database/database.providers.ts` (`new DataSource(buildDatabaseOptions())`), keep `database.providers.spec.ts` passing.
- Modify: `infra/docker-compose.yml`, `infra/docker-compose.tests.yml`, `infra/docker-compose.prod.yml`: init mount → `../backend/src/database/init-scripts:/docker-entrypoint-initdb.d:ro`.
- `infra/Dockerfile.backend`: no change (assets land in `dist/database/init-scripts`, already copied).
- Modify: `backend/README.md`, root `README.md`, `AGENTS.md` (SQL path, env vars).

- [ ] **Step 1:** `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` → all pass; `ls dist/database/init-scripts` lists 5 files.
- [ ] **Step 2:** Commit `chore(database): run migrations at startup and share init SQL with Compose`.

### Task 4: Docker verification (no code)

- [ ] `docker compose -p ciri-ws2 -f infra/docker-compose.tests.yml up --build --abort-on-container-exit --exit-code-from backend` → exit 0; then `down -v`.
- [ ] Fresh dev DB: `docker compose -p ciri-ws2-dev -f infra/docker-compose.yml up -d --build postgres backend`; logs show baseline skipped; `SELECT name FROM migrations` lists `Baseline1792022400000`; `down -v`.
- [ ] Empty DB (no init mount): run the prod image against a bare `postgres:16-alpine`; `/api/health/ready` 200 and `SELECT count(*) FROM gpus` > 0; clean up.

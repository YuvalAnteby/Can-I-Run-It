# Project: Can I Run It (ciri)

A full-stack PC gaming compatibility checker. Users input their hardware specs; the system checks existing performance records in the DB and returns a compatibility result. Future phases will add an LLM fallback (Gemini/ChatGPT/Claude) and an ML model for performance prediction.

## Monorepo Structure

```
/
├── backend/          ← NestJS (TypeScript) REST API
├── frontend/         ← React + Vite (TypeScript) SPA
└── infra/
    ├── .env                      ← single source of truth for all env vars
    ├── .env.example
    ├── docker-compose.yml        ← dev
    ├── docker-compose.prod.yml   ← production
    ├── docker-compose.tests.yml  ← E2E test isolation
    ├── Dockerfile.backend
    ├── Dockerfile.frontend
    └── init-scripts/             ← postgres init SQL
```

## Tech Stack

| Layer      | Technology                                                                  |
| ---------- | --------------------------------------------------------------------------- |
| Backend    | NestJS, TypeScript, TypeORM, PostgreSQL                                     |
| Frontend   | React 19, Vite, TypeScript, Tailwind CSS                                    |
| Testing    | Jest + Supertest (backend), Vitest + React Testing Library + MSW (frontend) |
| Containers | Docker, docker-compose (dev / prod / tests)                                 |

## Roadmap (for context — do not implement ahead of schedule)

1. **MVP (current):** NestJS backend with CPU/GPU endpoints + React frontend. Checks existing DB records for compatibility.
2. **Phase 2:** Add LLM fallback (Gemini / ChatGPT / Claude API) when no DB record is found.
3. **Phase 3:** Add a FastAPI microservice for an ML model that predicts performance. NestJS orchestrates: check DB first → LLM fallback → ML model. Never put ML logic in the NestJS backend.

## Cross-Cutting Rules

- Never use `any` in TypeScript — applies to both backend and frontend.
- Always assume `"strict": true` in both `tsconfig.json` files.
- Never mix imports across the `backend/` and `frontend/` boundary.
- Never suggest running `npm install` or scripts without specifying which workspace (`backend` or `frontend`).
- When scaffolding a feature end-to-end, always generate backend first, then frontend.
- This is a portfolio project targeting the Israeli high-tech industry. Code quality, structure, and documentation standards should reflect production-grade work.

## Environment Variables

- All environment variables are defined in `infra/.env`. Never hardcode values that belong there.
- When adding a new env var: add it to `infra/.env.example`, note which service consumes it, and use the correct prefix (`VITE_` for frontend, no prefix for backend).

## Database

- Primary ORM is TypeORM.
- **Schema sync is intentional during MVP** (`synchronize: true` in dev). Do not replace with migrations until the schema stabilizes post-MVP.
- Raw SQL via `QueryRunner` or `DataSource.query()` is acceptable for complex reporting or performance-critical queries. Always add a comment explaining why raw SQL was necessary. Never use raw SQL for standard CRUD.
- The database runs in Docker. Never assume a locally installed PostgreSQL instance.
- All `POSTGRES_*` env vars are read from `infra/.env`.

## Docker

- Dev: `docker compose -f infra/docker-compose.yml up -d --build`
- Prod: `docker compose -f infra/docker-compose.prod.yml up -d --build`
- Tests: `docker compose -f infra/docker-compose.tests.yml up --abort-on-container-exit`
- Services communicate internally via Docker service names on `ciri-net` (e.g. `postgres:5432`).
- Never suggest connecting to `localhost` for inter-service communication inside Docker.

## Commit Message Convention

Always use Conventional Commits format:

```
<type>(optional scope): <short description>

Types: feat, fix, refactor, chore, test, docs, perf, ci
Examples:
  feat(cpu): add pagination to CPU search endpoint
  fix(frontend): correct nestClient base URL for prod
  chore(infra): update postgres image to 16-alpine
```

- Scope should match the affected area: `backend`, `frontend`, `infra`, or a module name (e.g. `cpu`, `gpu`).
- Never generate a generic commit message like "update files" or "fix bug".

## Output Format (applies to all code generation)

- For **NEW files**: Output the complete file.
- For **EXISTING files**: Do NOT output the entire file. Output only the specific newly generated code block, and explicitly state where it should be inserted (e.g., "Add this method below `findAll()` in `users.service.ts`").
- Ensure all generated code passes strict `tsconfig.json` and ESLint checks.

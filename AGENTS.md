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

## Git Instructions

- NEVER add yourself as co author
- Always use Conventional Commits format:

```
<type>(optional scope): <short description>

Types: feat, fix, refactor, chore, test, docs, perf, ci
Examples:
  feat(cpu): add pagination to CPU search endpoint
  fix(frontend): correct nestClient base URL for prod
  chore(infra): update postgres image to 16-alpine
```

- Scope should match the affected area: `backend`, `frontend`, `infra`, or a module name

## Docker Instructions

- Dev: `docker compose -f infra/docker-compose.yml up -d --build`
- Prod: `docker compose -f infra/docker-compose.prod.yml up -d --build`
- Tests: `docker compose -f infra/docker-compose.tests.yml up --abort-on-container-exit`
- Services communicate internally via Docker service names on `ciri-net` (e.g. `postgres:5432`).
- Never suggest connecting to `localhost` for inter-service communication inside Docker.

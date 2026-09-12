# Frontend

The frontend is a React 19 and Vite TypeScript SPA. React Router handles pages,
React Query and the shared Axios client handle API state, and Tailwind CSS
provides styling. Production assets are served by Nginx in Docker.

## Configuration

The Compose stacks use the repository-level `infra/.env` as the single
configuration file. `VITE_API_URL` must be a browser-reachable NestJS base URL
ending in `/api`; it is compiled into the production bundle. Provider keys and
database credentials belong to the backend/Compose environment and must never
be exposed through a `VITE_` variable.

For direct local Vite development, the client defaults to
`http://localhost:4000/api` when `VITE_API_URL` is absent. The full Docker setup
and default browser URLs are documented in the [root README](../README.md).

## Compatibility UI

The game detail form sends the selected game, CPU, GPU, RAM, SSD/HDD choice,
resolution, preset, optional requirement tier, and target FPS to
`POST /api/v1/check`. Target FPS choices are `30`, `60`, `90`, `120`, and `144`;
the default is `60`. The current UI does not expose upscaler controls, although
the API accepts upscaler and quality as optional stored-record preferences.

The result card renders the API contract directly:

- `Verified` identifies measured data.
- `AI` identifies provider data and displays the provider name.
- `Estimate` identifies the local heuristic.
- `Can run` and `Can't run` are measured verdicts.
- `Likely can run` and `Likely can't run` qualify AI and heuristic verdicts.
- `Insufficient data` has no provenance badge or FPS panel.

A VRAM shortage can change the main verdict to a failure. An SSD mismatch is a
separate advisory. Storage capacity is not collected. Loading, rate-limit,
timeout/network, and generic error states are shown explicitly.

The `/about` page explains the lookup order, provenance badges, target FPS,
VRAM/SSD rules, current stack, and V1 limits. The public demo URL is pending.

## Commands

Run package commands from `frontend/`:

```bash
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:watch
npm run build
npm run preview
```

The development and preview servers use port `3000` unless `REACT_PORT` is
set. `npm run build` writes the production bundle to `dist/`.

Vitest, React Testing Library, and MSW cover form behavior, API states, result
provenance/verdicts, warnings, and the About route. CI runs frontend lint,
type-check, tests, and production build before the Docker-backed backend job.

## Current limits

The UI relies on the curated catalog returned by the API and has no accounts,
automatic data ingestion, or ML-backed predictions. Gemini is the only current
AI provider; additional providers and ML results remain future work.

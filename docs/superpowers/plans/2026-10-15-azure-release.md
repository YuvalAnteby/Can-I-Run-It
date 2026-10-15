# Azure Release Workflows, Meta Tags and Runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pushes to `main` deploy the scanned API image (by digest) to the Container App and the SPA to the Blob static website; Terraform PRs are validated in CI; the operator has one runbook for the lean Azure setup.

**Architecture:** `backend-cd-prod.yml` keeps checks → build → Trivy → push and exposes the pushed image digest as a job output. Two new jobs (`deploy-api`, then `deploy-frontend`) use OIDC (`azure/login`) against the `production` environment and only run when the `AZURE_CLIENT_ID` repository variable is set. `terraform-ci.yml` runs credential-free Terraform checks. Docs only describe Terraform outputs and names fixed by the spec.

**Tech Stack:** GitHub Actions, Azure CLI, Terraform 1.9.8, Vite.

**Spec:** `docs/superpowers/specs/2026-10-15-azure-lean-infra-design.md` (Workstream 3)

## Global Constraints

- GitHub variables (exact names): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_API_APP_NAME`, `AZURE_FRONTEND_STORAGE_ACCOUNT`, `API_URL`, `FRONTEND_URL`; GitHub environment `production`.
- Variables are **repository** variables: a job-level `if:` cannot see environment-scoped variables, and the deploy jobs must be skipped when `vars.AZURE_CLIENT_ID` is empty.
- Every `uses:` in touched workflows is pinned to a full commit SHA with a trailing `# vN` comment:
  - `actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4`
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4`
  - `docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3`
  - `docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9 # v3`
  - `docker/metadata-action@c299e40c65443455700f0fdfc63efafe5b349051 # v5`
  - `docker/build-push-action@ca052bb54ab0790a636c9b5f226502c73d547a25 # v5`
  - `azure/login@7184910d9eb2b1c5e48f7073824a90609bb9b6d6 # v2`
  - `hashicorp/setup-terraform@b9cd54a3c349d3f38e8881555d616ced269862dd # v3`
- `id-token: write` only on `deploy-api` and `deploy-frontend`.
- No `${{ }}` expressions inside `run:` blocks; values reach shell through `env:`.
- No custom Node or shell scripts in the repo; inline `run:` only.
- Terraform `1.9.8`, `terraform_wrapper: false`.
- Do not edit `infra/terraform/**` or `backend/**`. Do not hard-code the init SQL path in the runbook ("applied automatically by the API's baseline migration").
- Commits: Conventional Commits, scopes `ci`, `frontend`, `docs`; no `Co-Authored-By` line (AGENTS.md).

## Review Focus

- A readiness 200 served by the *old* revision while the new one is still starting → the wait must also require `latestReadyRevisionName == latestRevisionName`.
- `FRONTEND_URL`/`API_URL` entered with a trailing slash → strip with `${VAR%/}` before appending paths.
- Mixed-case `github.repository` (`YuvalAnteby/Can-I-Run-It`) → image reference is lower-cased with `${GITHUB_REPOSITORY,,}`.
- Deep links (`/games/<slug>`) are served by the 404 document with HTTP 404 → only `/about` is made a real blob; smoke checks `/` and `/about` for 200.
- Stale `index.html` cached by browsers after a deploy → `index.html` and `about` are uploaded with `Cache-Control: no-cache`.

---

### Task 1: Terraform CI workflow

**Files:**
- Create: `.github/workflows/terraform-ci.yml`

- [ ] **Step 1:** Workflow `CI - Terraform`, trigger `pull_request` with `paths: ["infra/terraform/**", ".github/workflows/terraform-ci.yml"]`, `permissions: contents: read`, concurrency group per ref with cancel. One job, `defaults.run.working-directory: infra/terraform`, timeout 10 min: checkout → setup-terraform (`terraform_version: 1.9.8`, `terraform_wrapper: false`) → `terraform fmt -check -recursive` → `terraform init -backend=false -input=false` → `terraform validate` → `terraform test`.
- [ ] **Step 2:** Verify: YAML parses; actionlint clean; the four Terraform commands succeed locally against the current `infra/terraform`.
- [ ] **Step 3:** Commit `ci(terraform): validate and test Terraform on pull requests`.

### Task 2: Production deploy jobs

**Files:**
- Modify: `.github/workflows/backend-cd-prod.yml`

**Interfaces:**
- Produces: `build-and-push` job output `api_image` = `ghcr.io/<lower-case repo>-backend@sha256:<64 hex>`.

- [ ] **Step 1:** Rename workflow to `CD - Production Release`; add `workflow_dispatch`; pin all actions; keep checks/build/Trivy/push unchanged otherwise.
- [ ] **Step 2:** After the push step, step `digest` resolves `docker buildx imagetools inspect "<repo>:sha-$GITHUB_SHA" --format '{{.Manifest.Digest}}'`, validates `^sha256:[0-9a-f]{64}$`, writes `api_image` to `$GITHUB_OUTPUT`.
- [ ] **Step 3:** `deploy-api`: `needs: build-and-push`, `if: vars.AZURE_CLIENT_ID != '' && github.ref == 'refs/heads/main'`, `environment: { name: production, url: vars.API_URL }`, `permissions: id-token: write`, timeout 20. Steps: azure/login (client/tenant/subscription from vars) → `az containerapp update -n "$AZURE_API_APP_NAME" -g "$AZURE_RESOURCE_GROUP" --image "$API_IMAGE"` → wait loop: 30 × 10 s, success when `latestReadyRevisionName == latestRevisionName` and `curl` of `${API_URL%/}/api/health/ready` returns 200; otherwise fail with the last status. Env `AZURE_EXTENSION_USE_DYNAMIC_INSTALL=yes_without_prompt`.
- [ ] **Step 4:** `deploy-frontend`: `needs: deploy-api`, same `if`, `environment: { name: production, url: vars.FRONTEND_URL }`, `permissions: contents: read, id-token: write`. Steps: checkout → setup-node 24 (npm cache on `frontend/package-lock.json`) → `npm ci` → `npm run build` with `VITE_API_URL: ${{ vars.API_URL }}/api` (strip trailing slash in shell before build) → azure/login → `az storage blob upload-batch --account-name "$ACCOUNT" --auth-mode login -d '$web' -s frontend/dist --overwrite` → upload `frontend/dist/index.html` as `index.html` and `about` with `--content-type text/html --content-cache-control no-cache --overwrite` → smoke: `curl -fsS` on `${FRONTEND_URL%/}/` and `/about`, both containing `<div id="root">`.
- [ ] **Step 5:** Verify: YAML parses; actionlint clean (with shellcheck); grep confirms no `${{` inside `run:`; every `uses:` matches `@[0-9a-f]{40} # v`.
- [ ] **Step 6:** Commit `ci(release): deploy API and frontend to Azure on main`.

### Task 3: Open Graph meta tags

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1:** Add `description`, `og:type=website`, `og:site_name`, `og:title`, `og:description`, `og:image` (absolute `https://raw.githubusercontent.com/YuvalAnteby/Can-I-Run-It/main/frontend/public/logo512.png`, the repo is public and the frontend origin is not known at build time), `og:image:alt`, `twitter:card=summary`. Title text `Can I Run It`; description: "Check whether your PC can run a game: pick a game, CPU, GPU, RAM, resolution, preset and target FPS for a source-labelled compatibility result."
- [ ] **Step 2:** Verify: `npm run lint` and `npm run build` in `frontend/` pass; built `dist/index.html` contains the tags.
- [ ] **Step 3:** Commit `feat(frontend): add Open Graph and description meta tags`.

### Task 4: Runbook and doc links

**Files:**
- Create: `docs/operations/azure.md`
- Modify: `docs/operations/observability.md`, `docs/operations/demo-release.md`, `README.md`

- [ ] **Step 1:** `azure.md` sections: Overview (resources and names from spec), Prerequisites, Bootstrap state, `terraform.tfvars`/`backend.hcl`, First deploy order (spec's order), GitHub `production` environment (deployment branch `main`) and repository variables mapped from `terraform output -raw`, Routine releases, Acceptance checklist (spec's six items with commands), Ad-hoc database access (temporary Container Apps job, `postgres:16-alpine`, operator Entra token as job secret), Backup before credits end (`pg_dump -Fc` uploaded with a user-delegation SAS into the state account), Teardown (`terraform destroy`, Key Vault soft delete/purge), Cost guardrails. Schema text: "applied automatically by the API's baseline migration".
- [ ] **Step 2:** `observability.md`: replace the old "Opt in from Terraform" and alert descriptions with the spec's model (workspace + App Insights always created, one 5xx metric alert to the email action group, budget; no replica or log alerts), point to `azure.md`; fix `ContainerAppName == "ciri-backend"` to `ca-ciri-api`.
- [ ] **Step 3:** `demo-release.md`: replace app-only Terraform paragraphs with a pointer to `azure.md`; update the "does not deploy" artifacts paragraph; `README.md`: link the Azure runbook.
- [ ] **Step 4:** Verify: every relative link target exists; variable names match Global Constraints.
- [ ] **Step 5:** Commit `docs(ops): add Azure runbook and update release docs`.

# Lean Azure Infrastructure Design

## Goal

Run the Can I Run It demo on Azure for about 10 months on an Azure for
Students subscription ($100 credit, ~11 months of free services remaining),
fully described by Terraform, with pushes to `main` deploying the API and
frontend automatically. Target spend: about $1/month, hard ceiling $10/month.

This replaces the closed PRs #85–#90, which were over-engineered for a solo
demo. Salvaged ideas are noted inline.

## Constraints and decisions

| Topic | Decision |
|---|---|
| Subscription | Azure for Students. Allowed regions: polandcentral, denmarkeast, austriaeast, switzerlandnorth, israelcentral. |
| Region | `polandcentral` (Container Apps is not offered in Israel Central; Postgres B1ms verified in Poland Central). |
| Environments | Production only. `staging` stays local Compose + CI. |
| Lifetime | Always on. CI deploys app releases; infra changes are applied locally with `terraform apply`. |
| Existing Azure resources | None. Terraform creates everything except the state storage. |
| DB network | Private access: Postgres in a delegated subnet, private DNS zone. No public endpoint. |
| DB auth | Entra only. The API's user-assigned managed identity is a Postgres Entra administrator, set by Terraform. No database password anywhere. |
| Frontend | Blob Storage static website (Static Web Apps is not offered in the allowed regions). |
| Cost guardrails | No NAT gateway, Front Door, private endpoints, dedicated workload profiles or log-based alerts. |

## Non-goals

Firewall reconcilers, scheduled database exports, saved-plan delivery
pipelines, multi-role Entra database bootstrap, schema-adoption catalogs,
staging in Azure, custom domains, and any business-logic change.

## Architecture

```
GitHub Actions ──OIDC──▶ id-ciri-deploy ──▶ az containerapp update (API image)
                                       └──▶ az storage blob upload-batch ($web)

Browser ──▶ Blob static website (stciriweb…, $web)
   └──────▶ API Container App (ca-ciri-api, scale 0–1, external HTTPS ingress)
                 │ subnet snet-aca (delegated Microsoft.App/environments)
                 │ Entra token (id-ciri-api) + TLS verify-full
                 ▼
            Postgres Flexible B1ms, PG16, 32 GiB (psql-ciri-prod)
                 subnet snet-pg (delegated), private DNS zone
```

## Workstream 1 — Terraform

Location: `infra/terraform/` (replaces the current root; existing
`observability.tf` content is kept but adapted as described below).

### Bootstrap (outside Terraform)

`infra/terraform/bootstrap.ps1`, idempotent, run once by the operator after
`az login`:

- Resource group `rg-ciri-tfstate` in `polandcentral`.
- Storage account (globally unique name passed as parameter), StorageV2,
  Standard_LRS, TLS 1.2, no public blob access, shared key disabled, blob
  versioning and 7-day soft delete.
- Container `tfstate`.
- `Storage Blob Data Contributor` on the account for the signed-in user.
- Prints the `backend.hcl` values.

The root uses `backend "azurerm" {}` with `use_azuread_auth = true`; values are
passed with `terraform init -backend-config=backend.hcl` (gitignored; a
`backend.hcl.example` is committed).

### Providers

`azurerm` (pinned exact 4.x version, updated lock file), `random`. Provider
`storage_use_azuread = true` so static-website settings work without shared
keys. `required_version` stays `>= 1.9.0, < 2.0.0`.

### Resources

Names use prefix `ciri` and suffix `prod`; globally unique names add a
`random_string` suffix.

| Resource | Key settings |
|---|---|
| `azurerm_resource_group` `rg-ciri-prod` | `polandcentral` |
| VNet `vnet-ciri-prod` 10.20.0.0/16 | |
| Subnet `snet-aca` 10.20.0.0/26 | Delegated to `Microsoft.App/environments`; `default_outbound_access_enabled = true` (new VNets default to private subnets; Container Apps needs outbound for Gemini/RAWG). |
| Subnet `snet-pg` 10.20.1.0/28 | Delegated to `Microsoft.DBforPostgreSQL/flexibleServers`. |
| Private DNS zone `ciri-prod.private.postgres.database.azure.com` | Linked to the VNet. |
| Log Analytics workspace | Daily cap and retention from existing variables. |
| Application Insights | Workspace-based (existing `observability.tf`). |
| Container Apps environment `cae-ciri-prod` | Workload profiles with Consumption profile only, `infrastructure_subnet_id = snet-aca`, external, logs to Log Analytics. |
| User-assigned identity `id-ciri-api` | Used by the API for Key Vault and Postgres. |
| User-assigned identity `id-ciri-deploy` | Federated credential: issuer `https://token.actions.githubusercontent.com`, subject `repo:YuvalAnteby/Can-I-Run-It:environment:production`, audience `api://AzureADTokenExchange`. |
| Key Vault `kv-ciri-<suffix>` | RBAC mode, soft delete 7 days, **purge protection off**. Secrets: `gemini-api-key`, `rawg-api-key`, `applicationinsights-connection-string`. |
| Postgres Flexible `psql-ciri-prod-<suffix>` | v16, `B_Standard_B1ms`, 32768 MB, backup 7 days, no HA, no geo-redundant backup, `public_network_access_enabled = false`, `delegated_subnet_id`, `private_dns_zone_id`, authentication `active_directory_auth_enabled = true`, `password_auth_enabled = false`. `ignore_changes = [zone]`. |
| Postgres configuration `azure.extensions` | `PG_TRGM` (required by the schema). |
| Postgres database `ciri` | UTF8. |
| Postgres Entra admins | `id-ciri-api` (ServicePrincipal, principal name = identity name) and the operator (User, object ID + UPN from variables). |
| API Container App `ca-ciri-api` | See below. |
| Frontend storage account `stciriweb<suffix>` | StorageV2, LRS, TLS 1.2, `static_website { index_document = "index.html", error_404_document = "index.html" }`. |
| Action group | Email to `alert_email`. |
| Metric alert | API 5xx requests (Container App `Requests` metric, `statusCodeCategory = 5xx`), replaces #81's two log alerts. The replicas alert is removed (incompatible with scale-to-zero). |
| `azurerm_consumption_budget_resource_group` | $8/month, notify at 50/80/100% actual and 100% forecast. |

Role assignments:

- `id-ciri-api`: `Key Vault Secrets User` on the vault.
- `id-ciri-deploy`: `Reader` on `rg-ciri-prod`, `Contributor` on `ca-ciri-api`
  only, `Storage Blob Data Contributor` on the frontend storage account.
- Operator: `Key Vault Secrets Officer` on the vault (so Terraform can write
  secrets).

Key Vault reference RBAC must exist before the Container App is created
(`depends_on` plus a short `time_sleep` for propagation).

### API Container App

- `revision_mode = "Single"`, identity `id-ciri-api`.
- Ingress external, target port 4000, `transport = "auto"`.
- `min_replicas = var.api_min_replicas` (default 0), `max_replicas = 1`.
- Container `api`, 0.5 vCPU / 1 GiB, image `var.api_image`;
  `lifecycle { ignore_changes = [template[0].container[0].image] }` (CI owns
  the image after creation).
- Probes on `/api/health/live` (startup, liveness) and `/api/health/ready`
  (readiness), every `failure_count_threshold` ≤ 10.
- Environment:
  - `NODE_ENV=production`, `PORT=4000`, `TRUST_PROXY=1`
  - `POSTGRES_HOST` = server FQDN, `POSTGRES_PORT=5432`, `POSTGRES_DB=ciri`,
    `POSTGRES_USER` = `id-ciri-api` name, `POSTGRES_AUTH_MODE=entra`,
    `POSTGRES_SSL=verify-full`, `AZURE_CLIENT_ID` = `id-ciri-api` client ID
  - `REACT_URL` = frontend web endpoint without trailing slash
  - Abuse-protection and observability values (existing variables)
  - Secrets via Key Vault references with `id-ciri-api`: `GEMINI_API_KEY`,
    `RAWG_API_KEY`, `APPLICATIONINSIGHTS_CONNECTION_STRING`

### Variables

`location` (default `polandcentral`), `api_image` (required, digest or
`sha-` tag), `api_min_replicas`, `gemini_api_key` and `rawg_api_key`
(sensitive), `operator_object_id`, `operator_upn`, `alert_email`,
`monthly_budget_usd` (default 8), existing observability and abuse-protection
variables. Values live in a gitignored `terraform.tfvars`; a
`terraform.tfvars.example` is committed. Sensitive values end up in the
private, Entra-only state account; that is accepted for this demo.

### Outputs (contract for workstream 3)

| Output | Used as GitHub variable |
|---|---|
| `resource_group_name` | `AZURE_RESOURCE_GROUP` |
| `api_container_app_name` | `AZURE_API_APP_NAME` |
| `api_url` (`https://<fqdn>`) | `API_URL` |
| `frontend_storage_account_name` | `AZURE_FRONTEND_STORAGE_ACCOUNT` |
| `frontend_url` | `FRONTEND_URL` |
| `deploy_client_id` | `AZURE_CLIENT_ID` |
| `tenant_id` | `AZURE_TENANT_ID` |
| `subscription_id` | `AZURE_SUBSCRIPTION_ID` |
| `postgres_fqdn` | (informational) |

### Terraform tests

`terraform test` with mock providers asserts: Postgres not publicly
accessible and password auth disabled; API scale 0–1; every probe threshold
≤ 10; `TRUST_PROXY=1`; no NAT gateway or Front Door resources; budget present;
Key Vault purge protection off. Existing `observability.tftest.hcl` is
rewritten to match.

## Workstream 2 — Backend database configuration and migrations

Infra-enabling only; no business logic changes.

### Connection options

Replace the inline options in `backend/src/database/database.providers.ts`
with a tested builder (`database.config.ts`, salvaging the shape of #87's
`buildDatabaseOptions`, without its maintenance retries):

- `POSTGRES_AUTH_MODE`: `password` (default; local Compose unchanged) or
  `entra`.
- In `entra` mode, `password` is an async function that obtains a token from
  `ManagedIdentityCredential({ clientId: AZURE_CLIENT_ID })` for scope
  `https://ossrdbms-aad.database.windows.net/.default`. A new token per
  physical connection; the credential caches.
- `POSTGRES_SSL`: `disable` (default) or `verify-full`
  (`ssl: { rejectUnauthorized: true }`, Node's bundled roots).
- Pool `max` 5.
- Invalid values fail fast at startup with a clear message.
- `@azure/identity` becomes an explicit dependency.

### Migrations

- TypeORM migrations with `migrationsRun: true` (safe: API `max_replicas = 1`).
- One baseline migration applies the schema and seed from
  `infra/init-scripts` (01–05). It is a no-op when the schema already exists
  (e.g. `to_regclass('public.games')` is not null), so existing local Compose
  volumes just record the baseline.
- Single source of truth for the SQL: the implementer chooses how the backend
  image gets the SQL (e.g. moving the canonical files under `backend/` and
  pointing Compose's init mount there, or widening the Docker build context).
  Local Compose, the tests Compose and the production image must all keep
  working.
- Future schema changes are new TypeORM migrations.

### Tests

Unit tests for the builder (modes, validation, token callback with a mocked
credential, SSL). Existing unit and E2E suites pass unchanged.

## Workstream 3 — Release workflows, frontend tweaks and runbook

### `terraform-ci.yml`

On pull requests touching `infra/terraform/**`: `terraform fmt -check`,
`init -backend=false`, `validate`, `test`. No Azure credentials. Separate from
`backend-ci.yml`.

### `backend-cd-prod.yml`

Keeps the existing checks → build → Trivy scan → push of
`ghcr.io/<repo>-backend:sha-<sha>`. Adds:

1. `deploy-api` job: `environment: production`, `id-token: write`, skipped
   when `vars.AZURE_CLIENT_ID` is empty (so `main` stays green before Azure
   exists). `azure/login` (OIDC) → `az containerapp update --image
   <image>@<digest>` → wait for `${API_URL}/api/health/ready` to return 200
   (retry for up to ~5 minutes to cover cold start and migrations).
2. `deploy-frontend` job (after `deploy-api`): build with
   `VITE_API_URL=${API_URL}/api` → `az storage blob upload-batch
   --auth-mode login --destination '$web' --overwrite` → upload a copy of
   `index.html` as blob `about` (content type `text/html`) so `/about`
   returns 200 → smoke `curl` of `FRONTEND_URL`.

Actions are pinned to full commit SHAs. No custom Node scripts.

### Frontend tweaks

Static Open Graph and description meta tags in `frontend/index.html`
(title, description, image) so shared links preview correctly.

### Runbook `docs/operations/azure.md`

- Prerequisites (Azure CLI, Terraform, provider registration).
- Bootstrap, `tfvars`, first apply.
- First-deploy order: merge to `main` → CI pushes image → make the GHCR
  package public → `terraform apply` with that image → add the GitHub
  `production` environment and variables → re-run the release.
- Acceptance checklist: API ready; Postgres FQDN resolves only inside the VNet;
  API reaches Gemini/RAWG (egress); frontend loads and deep links render;
  CORS allows only the frontend origin; budget and alerts exist.
- Teardown (`terraform destroy`; Key Vault soft-delete note).
- Ad-hoc database access (temporary Container Apps job with
  `postgres:16-alpine` and an Entra token), and a manual `pg_dump` before
  credits end.
- Update `docs/operations/observability.md` and `demo-release.md` links for
  the alert changes and the new runbook.

## Cost estimate (monthly)

| Item | Cost |
|---|---|
| Postgres B1ms + 32 GiB | $0 (free services, 11 months) |
| Container Apps (scale to zero) | $0 (free grant) |
| Log Analytics / App Insights (capped) | $0 (5 GB free) |
| Private DNS zone | $0.50 |
| Storage (state + frontend), Key Vault | < $0.10 |
| Metric alert | $0.10 |
| **Total** | **≈ $0.70** |

## Manual operator steps

1. Install Azure CLI and Terraform; `az login`; register providers (done
   2026-10-15).
2. Run `bootstrap.ps1`.
3. Fill `terraform.tfvars` and `backend.hcl`.
4. Make the GHCR `-backend` package public.
5. `terraform init` / `plan` / `apply`.
6. Create the GitHub `production` environment and variables from the outputs.

## Risks to verify on first apply

- Container Apps egress from a VNet created after March 2026 (mitigated by
  `default_outbound_access_enabled`).
- Key Vault RBAC propagation before the Container App's first revision.
- Entra admin principal name for the managed identity must match
  `POSTGRES_USER`.
- Cold start (scale from zero + migrations check) within the readiness wait.

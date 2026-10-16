# Azure Lean Terraform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `infra/terraform/` with one root that creates the whole lean production stack (network, Postgres, Container App, frontend storage, Key Vault, identities, alerts, budget) plus a PowerShell state bootstrap.

**Architecture:** Single Terraform root, one file per concern, no modules. State lives in an Entra-only storage account created by `bootstrap.ps1`. Tests use `mock_provider` and `command = plan`/`apply` against mocks only; nothing touches Azure.

**Tech Stack:** Terraform `>= 1.9.0, < 2.0.0`, `hashicorp/azurerm = 4.81.0`, `hashicorp/random = 3.9.1`, `hashicorp/time = 0.14.2`, Azure CLI (bootstrap only), PowerShell 5.1+.

**Spec:** `docs/superpowers/specs/2026-10-15-azure-lean-infra-design.md` (Workstream 1)

## Global Constraints

- Region default `polandcentral`; names use prefix `ciri`, suffix `prod`; globally unique names add a 6-char lowercase `random_string`.
- `backend "azurerm" { use_azuread_auth = true }`; other backend values from `backend.hcl` (gitignored).
- Provider: `storage_use_azuread = true`.
- No NAT gateway, Front Door, private endpoints, dedicated workload profiles, log-based alerts, azapi, custom roles, `prevent_destroy`, Container Apps jobs.
- Every probe `failure_count_threshold` ≤ 10.
- Outputs exactly: `resource_group_name`, `api_container_app_name`, `api_url`, `frontend_storage_account_name`, `frontend_url`, `deploy_client_id`, `tenant_id`, `subscription_id`, `postgres_fqdn`.
- Only paths under `infra/terraform/` change (plus this plan).

## Decisions the spec leaves open (recorded deviations)

| Topic | Decision |
|---|---|
| Static website | Separate `azurerm_storage_account_static_website` resource (the inline `static_website` block is deprecated in 4.x). Same index / 404 values. |
| Key Vault RBAC flag | `rbac_authorization_enabled = true` (`enable_rbac_authorization` deprecated in 4.81). |
| Federated credential | `user_assigned_identity_id` (`parent_id` deprecated). |
| `time_sleep` | Adds provider `hashicorp/time` (spec requires a sleep; random alone cannot do it). |
| `subscription_id` | New required variable: azurerm 4.x refuses to run without it. `resource_provider_registrations = "none"` (operator already registered providers). |
| Abuse protection | No such variables existed in Terraform; add one `abuse_protection` object variable whose defaults equal `infra/.env.example`. |
| Observability | Always on (drop `observability_enabled`, `observability_location`, `observability_action_group_ids`); keep `observability_daily_cap_gb`, `observability_retention_days`, `observability_sampling_ratio`. Environment logs go to Log Analytics through the CAE `log_analytics_workspace_id`, replacing the diagnostic setting. |
| Budget start | `time_period.start_date` = first of the current month from `timestamp()`, with `ignore_changes = [time_period]`. |
| CAE infra RG | `infrastructure_resource_group_name = "ME_cae-ciri-prod"` set explicitly to avoid a replace-forcing diff on workload-profile environments. |
| Frontend storage | Also locked down: `shared_access_key_enabled = false`, `default_to_oauth_authentication = true`, `allow_nested_items_to_be_public = false` (the static website endpoint stays public). |

## File Structure

| File | Responsibility |
|---|---|
| `main.tf` | `terraform` block, backend, providers, `data.azurerm_client_config`, `random_string.suffix`, resource group, shared locals |
| `network.tf` | VNet, `snet-aca`, `snet-pg`, private DNS zone + VNet link |
| `identity.tf` | `id-ciri-api`, `id-ciri-deploy`, federated credential, deploy role assignments |
| `keyvault.tf` | Key Vault, three secrets, KV role assignments, `time_sleep.rbac` |
| `database.tf` | Postgres server, `azure.extensions`, database `ciri`, two Entra admins |
| `app.tf` | Container Apps environment, API Container App |
| `frontend.tf` | Frontend storage account + static website |
| `observability.tf` | Log Analytics, App Insights, action group, 5xx metric alert, budget |
| `variables.tf`, `outputs.tf` | Inputs / output contract |
| `production.tftest.hcl` | Spec guardrail assertions (plan mode) |
| `outputs.tftest.hcl` | Output contract and `REACT_URL` (apply against mocks) |
| `observability.tftest.hcl` | Rewritten observability assertions |
| `bootstrap.ps1`, `backend.hcl.example`, `terraform.tfvars.example`, `.gitignore`, `.terraform.lock.hcl` | Operator tooling |

## Review Focus

1. Postgres admin principal name differs from `POSTGRES_USER` → API cannot log in. Test: admin `principal_name` == env `POSTGRES_USER` == `"id-ciri-api"`.
2. Container App created before Key Vault RBAC exists → first revision fails to pull secrets. Test-by-review: Container App `depends_on` includes `time_sleep.rbac`; secrets use `versionless_id` + `identity`.
3. `REACT_URL` with trailing slash breaks CORS. Assert value is computed with `trimsuffix(..., "/")` (apply run with mocked `primary_web_endpoint = "https://stciriwebabc123.z36.web.core.windows.net/"`).
4. `api_image` given as a mutable tag like `latest`. Variable validation: must contain `@sha256:` or a `:sha-` tag; test `expect_failures` for `ghcr.io/x/y:latest`.
5. `api_min_replicas` set > 1 → violates max 1. Validation: 0 or 1 only; test `expect_failures`.

---

### Task 1: Root, network, identities, Key Vault, database, app, frontend, alerts

**Files:**
- Delete content and rewrite: `infra/terraform/main.tf`, `variables.tf`, `outputs.tf`, `observability.tf`
- Create: `infra/terraform/network.tf`, `identity.tf`, `keyvault.tf`, `database.tf`, `app.tf`, `frontend.tf`

**Interfaces (resource addresses later tasks and tests rely on):**
- `azurerm_resource_group.prod`, `azurerm_subnet.aca`, `azurerm_subnet.pg`, `azurerm_private_dns_zone.pg`
- `azurerm_user_assigned_identity.api`, `azurerm_user_assigned_identity.deploy`, `azurerm_federated_identity_credential.deploy_github`
- `azurerm_key_vault.main`, `azurerm_key_vault_secret.app["gemini-api-key"|"rawg-api-key"|"applicationinsights-connection-string"]`, `time_sleep.rbac`
- `azurerm_postgresql_flexible_server.main`, `azurerm_postgresql_flexible_server_active_directory_administrator.api` / `.operator`
- `azurerm_container_app_environment.main`, `azurerm_container_app.api` (container name `api`)
- `azurerm_storage_account.frontend`, `azurerm_storage_account_static_website.frontend`
- `azurerm_log_analytics_workspace.main`, `azurerm_application_insights.main`, `azurerm_monitor_action_group.email`, `azurerm_monitor_metric_alert.api_5xx`, `azurerm_consumption_budget_resource_group.prod`

- [ ] **Step 1:** Write all files per the spec's Resources table and the Decisions table above. Key values: VNet `10.20.0.0/16`; `snet-aca` `10.20.0.0/26` delegated `Microsoft.App/environments`, `default_outbound_access_enabled = true`; `snet-pg` `10.20.1.0/28` delegated `Microsoft.DBforPostgreSQL/flexibleServers` (both with `actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]`). Postgres server waits on the DNS VNet link; config → database → API admin → operator admin are serialized with `depends_on` (the server rejects concurrent operations). Probes: startup `/api/health/live` interval 10 / threshold 10 / initial delay 10; liveness `/api/health/live` interval 10 / threshold 3; readiness `/api/health/ready` interval 5 / threshold 3. Metric alert: namespace `Microsoft.App/containerApps`, metric `Requests`, `Total`, `GreaterThan 5`, dimension `statusCodeCategory Include ["5xx"]`, frequency `PT5M`, window `PT15M`. Budget notifications: 50/80/100 `Actual`, 100 `Forecasted`, `contact_emails = [var.alert_email]`.
- [ ] **Step 2:** `terraform fmt -recursive`, `terraform init -backend=false`, `terraform validate` → `Success! The configuration is valid.`
- [ ] **Step 3:** Commit `feat(terraform): define lean Azure production stack`.

### Task 2: Tests

**Files:** Rewrite `infra/terraform/observability.tftest.hcl`; create `infra/terraform/production.tftest.hcl`.

- [ ] **Step 1:** `production.tftest.hcl` (mock azurerm with `mock_data "azurerm_client_config"` giving UUID tenant/subscription/object IDs; `override_resource` where plan-time values are needed). Runs:
  - `postgres_is_private_and_entra_only`: `public_network_access_enabled == false`, `authentication[0].password_auth_enabled == false`, `active_directory_auth_enabled == true`.
  - `api_scales_zero_to_one`: `template[0].min_replicas == 0`, `max_replicas == 1`.
  - `probes_within_limits`: every startup/liveness/readiness `failure_count_threshold <= 10`.
  - `api_env_contract`: env `TRUST_PROXY == "1"`, `POSTGRES_AUTH_MODE == "entra"`, `POSTGRES_SSL == "verify-full"`, `POSTGRES_USER == "id-ciri-api"`; admin `principal_name == "id-ciri-api"`; `GEMINI_API_KEY`/`RAWG_API_KEY`/`APPLICATIONINSIGHTS_CONNECTION_STRING` use `secret_name` not `value`.
  - In a separate `outputs.tftest.hcl` (CI pins Terraform 1.9.8, so no `override_during`): `command = apply` against mocks whose `mock_resource` defaults give well-formed Azure IDs (the provider validates IDs passed between resources) and `primary_web_endpoint = "https://stciriwebabc123.z36.web.core.windows.net/"`; assert `REACT_URL == "https://stciriwebabc123.z36.web.core.windows.net"` and every output in the contract.
  - `no_costly_network_resources`: no `*.tf` file declares `azurerm_nat_gateway`, `azurerm_cdn_frontdoor_*`, `azurerm_frontdoor`, or `azurerm_private_endpoint` (regex over `file()` of `fileset(path.module, "*.tf")`).
  - `budget_present`: amount `== 8`, four notifications.
  - `key_vault_purge_protection_off`: `purge_protection_enabled == false`, `soft_delete_retention_days == 7`.
  - `rejects_mutable_image_tag`, `rejects_min_replicas_above_one`: `expect_failures`.
- [ ] **Step 2:** `observability.tftest.hcl`: workspace `PerGB2018` with cap/retention from variables; App Insights workspace-based with `sampling_percentage == 100`; env `TELEMETRY_ENABLED == "true"`, `OTEL_TRACES_SAMPLER_ARG == "0.1"`; 5xx alert uses the `statusCodeCategory`/`5xx` dimension; existing validation failure runs (sampling ratio 1.1, daily cap 0, retention 31).
- [ ] **Step 3:** `terraform test` → all pass. Commit `test(terraform): cover lean stack guardrails`.

### Task 3: Operator tooling and lock file

**Files:** Create `infra/terraform/bootstrap.ps1`, `backend.hcl.example`, `terraform.tfvars.example`; modify `.gitignore`; regenerate `.terraform.lock.hcl`.

- [ ] **Step 1:** `bootstrap.ps1 -StorageAccountName <name> [-Location polandcentral] [-ResourceGroupName rg-ciri-tfstate] [-ContainerName tfstate]`. Idempotent via show-then-create; every `az` call checks `$LASTEXITCODE`. Container created with `az storage container-rm` (control plane, no data-role propagation wait). Role assignment skipped when it already exists. Prints the `backend.hcl` body (key `ciri-prod.tfstate`).
- [ ] **Step 2:** `.gitignore` adds `backend.hcl`, `.terraform.tfstate.lock.info`; `*.tfvars` stays ignored (the `.example` files are not matched).
- [ ] **Step 3:** `terraform providers lock -platform=linux_amd64 -platform=windows_amd64`; `terraform fmt -check -recursive`; PowerShell parse check of `bootstrap.ps1` via `[System.Management.Automation.Language.Parser]::ParseFile`.
- [ ] **Step 4:** Commit `chore(terraform): add state bootstrap and operator examples`.

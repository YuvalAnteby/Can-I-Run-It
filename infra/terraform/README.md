# Terraform production platform

The three independent roots are production (`infra/terraform`), human state bootstrap
(`bootstrap/state`), and human privileges (`bootstrap/privileges`). Terraform 1.11.4,
AzureRM 4.25.0 and AzAPI 2.4.0 are pinned and locked. No apply has been performed.

Production owns SWA Free, a default-network Consumption-only environment, API Single
revision/0.5 CPU/1 GiB/min0/max1, four finite Jobs, five UAMIs, PG16/B1ms/32 GiB,
Key Vault, separate export/control containers, dedicated telemetry and email budgets.
There are no VNet/subnet/DNS/private endpoints/NAT/VM/ACR/dedicated profiles or paid
metric/log alert resources. PG starts deny-all; never enable the 0.0.0.0 bypass.

AzAPI manages SWA, accounts, containers, workspace, API and Jobs because AzureRM's
pinned resource readers call key and secret list operations. AzAPI exports only the
frontend/API hostnames; it makes no secret-list or deployment-token action calls.
Only the generated Application Insights connection string is stored as an API
secret value. Provider keys are versionless native vault URIs, created outside
Terraform. Do not add secret data sources, values, outputs or provisioners.
Application Insights server sampling stays at 100%; SDK trace sampling is 10% avoids
sampling the already sampled traces twice. The workspace and Insights cap at 0.1 GB/day,
retain 30 days, and console/system logging is routed exactly once. Caps can overshoot.

## Before cloud changes

Read the approved architecture/handoff and database runbook. Obtain real account,
region/SKU16/B1ms32GiB/free eligibility/provider registrations/quota evidence;
750 PostgreSQL hours/storage/backup grants and ACA grants are subscription-shared.
Prepare a dated unit-price/quantity/grant/expiry/estimate worksheet for every service,
requests, Jobs, transactions, ingestion and bandwidth. $7–8/month is a target, not
verified eligibility or pricing. Preserve student spending protection. No automatic
paid tier/region replacement. `entitlement_verified` defaults to false and blocks plans.
Only set true after reviewed account/inventory/cost evidence, never as a workaround.
CI also binds this input to the protected evidence and reviewed saved plan.

`credit_period_start/end` are the **actual** UTC credit timestamps used by Cost Query,
including across January 1. `budget_period_start` must be first-of-month in the actual
start month because Azure Budget API requires that. Subscription currency must beUSD
for the approved $100/$80/$90 thresholds. The annual budget's reporting boundary is
its first-month anchor; a mid-month offer can differ at the final renewal boundary.
Record the difference and verify email evaluation over the actual offer; use manual
exports/email fallback if Azure cannot represent that exact period. Budgets/cost lag
are not hard spending caps. Monthly warning is$8. Cost-triggered exports default off
(`verified_credit_cost_mapping=false`); only enable after observing actual billing
mapping/currency. Four-calendar-month and manual exports remain available.

Required production inputs: subscription_id,tenant_id,resource_group_name,name_prefix,
owner,postgres_server_name,key_vault_name,export_storage_account_name,backend_image,
tools_image,credit_period_start,end,budget_period_start,credit_currency,alert_email.
Only public `ghcr.io/...@sha256:<64 lowercase hex>` images are accepted. Verify anonymous
pulls, tools PG16, matching migration release image and scans before release.
Optional metadata: provider_secret_uris (RAWG_API_KEY/GEMINI_API_KEY only), exact
operator_ipv4_rules (max3), maintenance_schedules_enabled and verified cost mapping.
No provider passwords, tokens or keys go into tfvars, environment maps or plans.
All roots require protected state/plan files because generated telemetry settings and
resource identifiers can still be sensitive. `.gitignore` excludes local state/plans.

## Reconcile before creating

Azure CLI/profile was unavailable in the implementation environment. No inventory,
existing state or resource reconciliation is claimed. With a human authorized login,
list ARM resource IDs/types/names in the chosen subscription/group, Blob **metadata**
for known state keys and existing Terraform resource addresses. Do not dump state
values, list account/deployment keys or fetch Key Vault secret values. Check whether
previous app/environment/workspace/Insights live in existing state before proceeding.
Retain exactly one state owner per resource; stop if ownership is ambiguous.

Back up encrypted state through Blob versioning/access-controlled copy, then import
existing resources individually using their actual resource IDs, never guessed IDs.
Examples (replace identifiers with the verified inventory):

```sh
terraform import azurerm_resource_group.production /subscriptions/SUB/resourceGroups/RG
terraform import azapi_resource.backend '/subscriptions/SUB/resourceGroups/RG/providers/Microsoft.App/containerApps/APP?api-version=2024-03-01'
terraform import 'azapi_resource.maintenance["migration"]' '/subscriptions/SUB/resourceGroups/RG/providers/Microsoft.App/jobs/JOB?api-version=2024-03-01'
terraform import azurerm_container_app_environment.production /subscriptions/SUB/resourceGroups/RG/providers/Microsoft.App/managedEnvironments/ENV
terraform import azapi_resource.frontend '/subscriptions/SUB/resourceGroups/RG/providers/Microsoft.Web/staticSites/SWA?api-version=2024-04-01'
```

For an existing old root `azurerm_container_app.backend`, migrate state ownership
with a human-reviewed `terraform state rm azurerm_container_app.backend`, followed
immediately by the AzAPI import above; this forgets ownership, it does not delete the
app. Keep the protected backup and recover/import if interrupted. Do not retain both
old and new owners, recreate the environment, or remove resource protections merely
to make a plan pass. Import workspace/account/container IDs into corresponding AzAPI
addresses with their configured api-version. Import PG/database/UAMIs/operator rules
using AzureRM ARM IDs. Import privileged assignments/federation into their bootstrap
roots, not production. A native reference/SKU/network mismatch is a deployment
blocker; evaluate a reviewed migration and costs, never silent replacement.

## Human bootstrap and ownership order

1. Human verifies cost/account/inventory gates and registers required providers
   separately. Protect GitHub `production`: deployment branchmain only, reviewers,
   workflow/file branch protections. OIDC subjects are exact `repo:OWNER/REPO:environment:production`;
   that subject alone does **not** enforce the branch, GitHub environment policy does.
2. Human applies `bootstrap/state` with actual nonsecret inputs, then migrates its
   initially local state to its private account using an audited temporary backend
   declaration and `terraform init -migrate-state`. Use Entra human auth, `use_oidc=false`,
   `use_azuread_auth=true`, distinct keys `bootstrap-state.tfstate`/`bootstrap-privileges.tfstate`.
   Never place bootstrap states under ordinary platform principal's production state
   container: that principal's BlobDataContributor permits access to any object in it.
   Use the **separate private bootstrap container** created by state bootstrap;
   only the human account-scoped data grant applies there. Remove local copies after verified migration; retain protected recovery.
3. Human creates the production resource group once, imports it into the production
   root, and applies `bootstrap/privileges` with runtime_rbac_enabled=false. That root
   grants explicit infrastructure permission on this group and budget/preflight
   actions at subscription scope. Neither principal receives Owner/UserAccessAdmin.
   No ordinary CI RBAC/admin permissions. Federation/principals are owned by state
   bootstrap, not CI. Root statebackenduses platform OIDC/Entra locking.
4. Platform reviewed initial plan: provider_secret_uris={}, schedules false. This creates
   deny-all PG and manual Jobs. Human applies privileged root with actual executor
   principal IDs from the nonsecret output allowlist and runtime_rbac_enabled=true.
   It grants container data scopes, scoped native KV permissions, selected executor
   ARM reads/firewall actions, trusted Job starts, human PostgreSQL Entra administrator.
   Exporter needs both exports and control BlobDataContributor for its lease/metadata.
   Checker/controller have control only. Only explicitly verified cost-query support
   enables checker CostManagementReader at subscription scope. This broad read-only
   scope never belongs to API/exporter. Release may start/override trusted Job commands
   and update API code, so it has the corresponding identity execution trust.
5. Human creates provider values outside Terraform and verifies native reference RBAC;
   human runs SQL bootstrap under a temporary exact operator IP, grants/extensions,
   baseline/explicit seed then reruns SQL privilege checks. Always remove operator
   firewall/elevation on success **and failure**. ARM RBAC does not grant SQL privileges.
6. Reconcile app+migration+export `properties.outboundIpAddresses` independently using
   REST Jobs2026-07-01; run finite firewallJob and actual TLS/Entra connectivity checks.
   Terraform owns only `ciri-operator-*`; controller owns `ciri-auto-*`. Keep replaced IPs
   one interval, fail closed on discovery, no environment inboundIP substitutions.
   Enable providerURIrefs/hourly firewall/daily02UTCchecker in a reviewed final plan
   after all dependencies accepted. Do not start scheduled Jobs before this phase.

Production `backend_url`, `frontend_url`, postgres host/db/resource IDs, executor
client/principal maps/individual IDs and export/container/control names are nonsecret
outputs. Human fills protected GitHub release resource-ID variables from only that explicit
output allowlist; release never reads Terraform state or plans. Platform owns tfstate
locking/private plans. Human bootstrap states must remain in human-only `bootstrap`
container. Use exact backend keys, no SAS/shared account keys in workflows.

## Lifecycle and maintenance

Only `body.properties.template.containers[0].image` on the API has ignore_changes;
scale/security/identity/probes/env stay Terraform-owned. Default Job tools digests
remain Terraform-owned, no Job-template ignore. Release starts migration with matching
immutable tools image override and waits terminal success before API image updates.
Migration: `node /app/dist/database/maintenance.js migrate`; initialseed is explicit
`seed`. Maintenance: `node /app/maintenance/cli.mjs firewall|export-check|export`.
DBtools600s0.5CPU1Gi/control60s0.25CPU0.5Gi, singlecompletion/parallelism, retry0.
Checker cannot wait indefinitely for firewall; timeout preserves due state.

Shared Azure env: POSTGRES_AUTH_MODE=entra, POSTGRES_SSL_MODE=verify-full,
POSTGRES_DB,POSTGRES_USER perSQLrole, AZURE_CLIENT_ID ownUAMI. APIpool5/tools2.
Maintenance receives MAINTENANCE_AUTH_MODE=managed-identity,AZURE_SUBSCRIPTION_ID,
DB_EXECUTOR_RESOURCE_IDS JSON[API,migration,export],POSTGRES_SERVER_RESOURCE_ID,
EXPORT_STORAGE_ACCOUNT,EXPORT_CONTAINER,CONTROL_CONTAINER,FIREWALL_JOB_RESOURCE_ID,
EXPORT_JOB_RESOURCE_ID,CREDIT_PERIOD_START/END/CURRENCY,VERIFIED_CREDIT_COST_MAPPING,
RELEASE_TOOLS_IMAGE_DIGEST; exporter additionallyPGhost/port/db/user and trustedrootfile.
Controller/checker receive no DB settings/provider secrets. Rotate KV values outsideTF,
verify native refresh (can take~30 minutes), and explicitly restart revision in emergency
using metadata-only app patch. Never read/list provider values for verification.

## Local verification

Using Docker (Terraform CLI was absent), from each root:

```sh
terraform fmt -recursive -check
terraform init -backend=false -lockfile=readonly
terraform validate
terraform test
terraform test -verbose -json # mocked plans only; protect any real plans
```

All `tests/*.tftest.hcl` mock AzureRM/AzAPI: no cloud provisioning, credentials or fees.
The original app-only root was tested first and failed minReplicas1 vsrequired0.
Production suite covers services/SKUs/network/scale/nativeURIs/schedules/finiteJobs/
telemetry/storage and rejection of mutableimages/bypass/private/ranges/secretvalues/
unverifiedsubscriptions. State suite checks stateprotection/federation separation;
privilege suite checks scoped permissions and forbids roleadmin/secretlist grants.
Mockplans validate provider schemas and configuration, not real Azure acceptance.

Still unobserved: actual subscription eligibility/prices/quota/inventory, remote state
leases/auth/recovery, GitHub branch/environment policy, actual ARM API/region support,
UAMI/nativeKV/EntraSQL grants/tokenrefresh/TLS/egress, costquerymapping/emails, SWA
publicdeployment, Jobs execution and 24–48h/billing/cold-start observations. No cloud
apply is authorized by these local checks; user reviews concrete realplan/evidence.

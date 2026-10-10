# Human Azure bootstrap

This root is the protected, human-operated foundation. It creates the dedicated
Standard LRS Terraform state account, separate production and bootstrap state
containers, and two user-assigned identities with distinct protected GitHub
environment federation:

- platform: `repo:YuvalAnteby/Can-I-Run-It:environment:azure-platform`
- release: `repo:YuvalAnteby/Can-I-Run-It:environment:production`

It deliberately creates no role assignments, PostgreSQL Entra administrator,
SQL grants, provider secrets, or deployment tokens. The authorized human
creates the reviewed custom roles from [`roles/`](roles/) and performs the
assignments below after the production resources and output IDs exist. This
keeps RBAC administration and the PostgreSQL administrator outside ordinary
platform and release applies.

## Foundation creation and state handoff

Register the resource providers once with the authorized human identity, then
run this root with local state only while the state account is being created.
Both Terraform providers have automatic registration disabled, so this list is
the human-owned subscription operation for the bootstrap root:

```powershell
$providers = @(
  "Microsoft.App", "Microsoft.Web", "Microsoft.DBforPostgreSQL",
  "Microsoft.Storage", "Microsoft.KeyVault", "Microsoft.OperationalInsights",
  "Microsoft.Insights", "Microsoft.Consumption", "Microsoft.ManagedIdentity"
)
foreach ($provider in $providers) {
  az provider register --namespace $provider
}

# backend.tf declares azurerm, so -backend=false would only skip initialization
# and the first apply would still fail with "Backend initialization required".
# Move that declaration out of the module for a real local-backend phase.
$backendFile = Join-Path (Get-Location) "backend.tf"
$backendHold = Join-Path $env:TEMP "ciri-bootstrap-backend.tf"
$stateBackup = Join-Path $env:TEMP "ciri-bootstrap-state-$([guid]::NewGuid()).json"
if (-not (Test-Path -LiteralPath $backendFile)) { throw "backend.tf is missing" }
if (Test-Path -LiteralPath $backendHold) { throw "A prior bootstrap backend hold exists: $backendHold" }
Move-Item -LiteralPath $backendFile -Destination $backendHold -ErrorAction Stop
try {
  terraform init -reconfigure
  if ($LASTEXITCODE -ne 0) { throw "terraform init failed ($LASTEXITCODE)" }
  terraform apply `
    -var='subscription_id=<subscription-id>' `
    -var='tenant_id=<tenant-id>' `
    -var='state_storage_account_name=<globally-unique-name>'
  if ($LASTEXITCODE -ne 0) { throw "terraform apply failed ($LASTEXITCODE)" }

  # Pull the local state before the finally block restores backend.tf.
  terraform state pull | Set-Content -NoNewline -Encoding utf8 -ErrorAction Stop $stateBackup
  if ($LASTEXITCODE -ne 0) { throw "terraform state pull failed ($LASTEXITCODE)" }
  Get-FileHash -Algorithm SHA256 -ErrorAction Stop $stateBackup
  # After copying the file into approved encrypted human-only storage and
  # checking the hash there: Remove-Item -LiteralPath $stateBackup -Force
} finally {
  if (Test-Path -LiteralPath $backendHold) {
    Move-Item -LiteralPath $backendHold -Destination $backendFile -ErrorAction Stop
  }
}

# Back up the local state before migrating it. Keep this file outside the
# checkout, move it only into approved encrypted human-only storage, record its
# hash, and remove the local copy. Never commit it or place it in either state
# container.

if (-not (Test-Path -LiteralPath $backendFile)) { throw "backend.tf was not restored" }
```

The bootstrap state is human-only. After verifying the hash in the approved
encrypted recovery store, remove the temporary local backup. Restore the same
checkout and backend declaration if a migration is interrupted; initialize the
same remote key again and inspect `terraform state pull`, the state addresses,
and a no-destroy plan before continuing. If the remote key is lost while Azure
resources remain, use the encrypted backup to verify the expected resource IDs,
then import each existing resource under the addresses in `main.tf` and review
the no-destroy plan before rerunning bootstrap. Never initialize the production
key for bootstrap recovery.

Before the first human production apply, grant that human identity data access
to the separate production state container. This is independent of the
bootstrap container assignment below and must be in place before initializing
the production root:

```powershell
az role assignment create `
  --assignee-object-id <human-object-id> `
  --assignee-principal-type User `
  --role "Storage Blob Data Contributor" `
  --scope <state-container-resource-id>
```

Grant the authorized human identity `Storage Blob Data Contributor` only on the
bootstrap container, then migrate this root to the separate bootstrap key. The
platform identity receives data access only to the production state container;
it cannot read this foundation key.

```powershell
az role assignment create `
  --assignee-object-id <human-object-id> `
  --assignee-principal-type User `
  --role "Storage Blob Data Contributor" `
  --scope <bootstrap-state-container-resource-id>

terraform init -migrate-state `
  -backend-config="storage_account_name=<state-account>" `
  -backend-config="container_name=bootstrap-state" `
  -backend-config="key=bootstrap/ciri-bootstrap.tfstate" `
  -backend-config="resource_group_name=ciri-tfstate-rg" `
  -backend-config="subscription_id=<subscription-id>" `
  -backend-config="tenant_id=<tenant-id>" `
  -backend-config="use_azuread_auth=true"
if ($LASTEXITCODE -ne 0) { throw "terraform state migration failed ($LASTEXITCODE)" }
```

Keep the encrypted backup and the backend coordinates in the human recovery
store. On recovery, restore the checkout, initialize the same bootstrap key,
run `terraform state pull`, and verify the subscription, state account,
container names, UAMI principal IDs, and both federated subjects before any
plan. If state is lost but resources remain, import each existing resource
under the addresses in `main.tf` and inspect a no-destroy plan before rerunning
bootstrap. Never initialize the production key for bootstrap recovery.

Initialize the production root only after this handoff. Its backend key is
distinct from the bootstrap key:

```powershell
terraform -chdir=.. init `
  -backend-config="storage_account_name=<state-account>" `
  -backend-config="container_name=terraform-state" `
  -backend-config="key=ciri-production.tfstate" `
  -backend-config="resource_group_name=ciri-tfstate-rg" `
  -backend-config="subscription_id=<subscription-id>" `
  -backend-config="tenant_id=<tenant-id>" `
  -backend-config="use_azuread_auth=true"
```

## Staged production apply for Key Vault references

The backend Container App uses native Key Vault references. Azure resolves those
references while the app resource is created, so its backend UAMI must already
have `Key Vault Secrets User`; ordinary platform CI cannot create that RBAC
assignment. Create the platform with no provider references first, grant the
human-approved role, then add only URI metadata and apply again:

```powershell
# Stage 1: create the platform without provider Key Vault references.
# Keep maintenance_schedules_enabled=false and do not add provider secret URIs
# to the ignored production tfvars file yet.
terraform -chdir=.. apply `
  -var-file=production.auto.tfvars.json `
  -var='provider_secret_uris={}' `
  -var='maintenance_schedules_enabled=false'

$backendPrincipalId = terraform -chdir=.. output -raw backend_identity_principal_id
$keyVaultResourceId = terraform -chdir=.. output -raw key_vault_resource_id

# Stage 2: the authorized human grants the reference-resolution data role.
az role assignment create `
  --assignee-object-id $backendPrincipalId `
  --assignee-principal-type ServicePrincipal `
  --role "Key Vault Secrets User" `
  --scope $keyVaultResourceId

# Wait for the assignment to be visible before updating the app.
$grant = $null
for ($attempt = 0; $attempt -lt 30 -and -not $grant; $attempt++) {
  $grant = az role assignment list `
    --assignee-object-id $backendPrincipalId `
    --scope $keyVaultResourceId `
    --query "[?roleDefinitionName=='Key Vault Secrets User'] | [0]" `
    --output json | ConvertFrom-Json
  if (-not $grant -and $attempt -lt 29) { Start-Sleep -Seconds 10 }
}
if (-not $grant) { throw "Key Vault Secrets User assignment was not visible after five minutes" }

# Provision the provider values directly in Key Vault through the authorized
# secret-management process. Never put values in Terraform variables or state.
# Then record only their versionless/versioned URIs in the ignored tfvars file,
# for example:
# provider_secret_uris = {
#   GEMINI_API_KEY = "https://<vault-name>.vault.azure.net/secrets/gemini-api-key"
#   RAWG_API_KEY   = "https://<vault-name>.vault.azure.net/secrets/rawg-api-key"
# }

# Stage 3: native references now resolve under the backend UAMI.
terraform -chdir=.. apply `
  -var-file=production.auto.tfvars.json `
  -var='maintenance_schedules_enabled=false'
```

Keep the schedules disabled until the SQL/Entra bootstrap, exact firewall
rules, image publication, and runtime connectivity checks have passed. If the
first apply is rerun after URI metadata has been added, repeat the RBAC/readiness
check before allowing Terraform to update the Container App.

## Custom roles and human assignments

The JSON role definitions are intentionally subscription-assignable but should
be assigned at the narrow scopes shown below. Materialize the subscription ID
into a temporary copy before registering each role; do not edit the tracked
templates with tenant or subscription data:

```powershell
$subscriptionId = "<subscription-id>"
$scope = "/subscriptions/$subscriptionId"
Get-ChildItem .\roles\*.json | ForEach-Object {
  $role = Get-Content $_.FullName -Raw | ConvertFrom-Json
  $role.AssignableScopes = @($scope)
  $temporary = Join-Path $env:TEMP $_.Name
  $role | ConvertTo-Json -Depth 20 | Set-Content $temporary
  az role definition create --role-definition $temporary
}
```

The platform role contains only the selected resource provider management
actions. It excludes `Microsoft.Authorization/*`, PostgreSQL
`flexibleServers/administrators/*`, Key Vault secret access, and storage key
actions. The budget role contains only subscription budget actions. Firewall,
Job-runner, release, and cost-reader roles are separate so a Job operator does
not receive platform or RBAC administration.

Before ordinary platform CI is enabled, verify its principal can read the
subscription metadata required by the pinned providers. Start with the narrow
`Microsoft.Resources/subscriptions/read` action; add
`Microsoft.Resources/subscriptions/locations/read` only if an authenticated
plan shows that location metadata is required. These are separate deployment
gates from provider registration. Do not add `*/register/action`, Owner, or
User Access Administrator permissions to ordinary CI.

The first production apply is human-operated because the production resource
group does not exist until that apply. After the human reviews the plan and
outputs, assign the platform workflow only the production resource-group role,
the production state-container data role, and the subscription-scoped budget
role:

```powershell
az role assignment create --assignee-object-id <platform-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Platform Operator" --scope <production-resource-group-id>
az role assignment create --assignee-object-id <platform-principal-id> --assignee-principal-type ServicePrincipal --role "Storage Blob Data Contributor" --scope <state-container-resource-id>
az role assignment create --assignee-object-id <platform-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Budget Manager" --scope /subscriptions/<subscription-id>
```

Assign the runtime and control permissions at the output resource IDs. These
are executable scopes, not placeholders for a broader resource-group role:

```powershell
# API Key Vault reference resolution
az role assignment create --assignee-object-id <backend-principal-id> --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" --scope <key-vault-resource-id>

# Exporter: SQL grants are configured separately; Blob access is exports only
az role assignment create --assignee-object-id <exporter-principal-id> --assignee-principal-type ServicePrincipal --role "Storage Blob Data Contributor" --scope <exports-container-resource-id>

# Firewall control: ARM reads/writes on selected resources plus control metadata
az role assignment create --assignee-object-id <firewall-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Firewall Operator" --scope <postgres-server-resource-id>
az role assignment create --assignee-object-id <firewall-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Firewall Operator" --scope <backend-resource-id>
az role assignment create --assignee-object-id <firewall-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Firewall Operator" --scope <migration-job-resource-id>
az role assignment create --assignee-object-id <firewall-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Firewall Operator" --scope <export-job-resource-id>
az role assignment create --assignee-object-id <firewall-principal-id> --assignee-principal-type ServicePrincipal --role "Storage Blob Data Contributor" --scope <control-container-resource-id>

# Export checker: control metadata, export reads, cost query, and selected Job starts
az role assignment create --assignee-object-id <export-check-principal-id> --assignee-principal-type ServicePrincipal --role "Storage Blob Data Contributor" --scope <control-container-resource-id>
az role assignment create --assignee-object-id <export-check-principal-id> --assignee-principal-type ServicePrincipal --role "Storage Blob Data Reader" --scope <exports-container-resource-id>
az role assignment create --assignee-object-id <export-check-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Cost Reader" --scope /subscriptions/<subscription-id>
az role assignment create --assignee-object-id <export-check-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Job Runner" --scope <firewall-job-resource-id>
az role assignment create --assignee-object-id <export-check-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Job Runner" --scope <export-job-resource-id>

# Release: protected workflow can update/start trusted app and Job resources
az role assignment create --assignee-object-id <release-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Release Operator" --scope <backend-resource-id>
az role assignment create --assignee-object-id <release-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Release Operator" --scope <migration-job-resource-id>
az role assignment create --assignee-object-id <release-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Release Operator" --scope <export-job-resource-id>
az role assignment create --assignee-object-id <release-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Release Operator" --scope <firewall-job-resource-id>
az role assignment create --assignee-object-id <release-principal-id> --assignee-principal-type ServicePrincipal --role "Ciri Release Operator" --scope <export-check-job-resource-id>
```

Container App write and Job start/write are broader than an image-only
permission: an actor able to update a Container App or Job can change more
configuration or command fields and can execute the attached identity. The
release environment therefore remains protected, its workflow is reviewed,
and Terraform's lifecycle rule limits only Terraform's API image ownership;
Azure RBAC cannot enforce a single JSON field. Do not assign Contributor,
Owner, User Access Administrator, or any wildcard secret-read role.

## PostgreSQL human bootstrap

Configure the Entra administrator only with the authorized human identity,
after the server exists and before SQL grants:

```powershell
az postgres flexible-server microsoft-entra-admin create `
  --resource-group <resource-group-name> `
  --server-name <postgres-server-name> `
  --object-id <human-object-id> `
  --tenant-id <tenant-id> `
  --display-name <human-login> `
  --type User
```

Add the human's current public IPv4 as a temporary exact PostgreSQL firewall
rule, run `infra/database/azure/bootstrap-roles.sql` with TLS and Entra, run
the migration Job, and remove the temporary rule in both success and failure
paths. SQL grants, extension setup, migration, and seed remain deployment
gates and are never ordinary Terraform or release resources.

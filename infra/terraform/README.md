# Azure production Terraform

This root owns the CIRI production platform: a Static Web Apps Free frontend,
default-network Container Apps Consumption environment, one Single-revision API
at 0.5 CPU/1 GiB with min 0/max 1 and external HTTPS port 4000, PostgreSQL 16
B1ms with 32 GiB and seven-day local backups, native Key Vault references,
private export/control Blob storage, monitoring, budgets, and four finite
maintenance Jobs.

The plan is intentionally gated. Before an apply, verify the subscription/tenant,
West Europe quota and SKU availability, credit period/currency, cost worksheet,
provider secret URIs, image digests, and existing resource/state inventory. Set
`entitlement_verified=true` only after those checks. No resource has been
provisioned by this repository implementation.

Provider/admin secret values never enter variables or state reads. Supply only
versionless/versioned Key Vault URIs through `provider_secret_uris`; the API uses
native Key Vault references under its backend UAMI. Images must be immutable
`@sha256:` digests. The application image is lifecycle-ignored at the one
`template.containers[0].image` field so release CI can update that field only;
Terraform retains ownership of scale, probes, identity, configuration, and the
default tools digest.

The first production apply must leave `provider_secret_uris` empty. After the
backend UAMI exists, the authorized human grants it `Key Vault Secrets User` at
the dedicated vault scope, provisions the provider values outside Terraform,
and records only their URI metadata in the ignored tfvars file. Apply the URI
references only after the role assignment is visible; see the executable staged
sequence in [`bootstrap/README.md`](bootstrap/README.md).

The frontend origin comes from the Static Web Apps resource's assigned
`properties.defaultHostname`; it is not derived from the resource name. The
same assigned HTTPS origin is rendered into the API `REACT_URL` environment
setting and the `static_web_app_origin` output.

The firewall and export-check schedules are defined but disabled by default.
Enable `maintenance_schedules_enabled=true` only after human Entra/SQL bootstrap,
exact operator/source rules, UAMI grants, image publication, firewall
reconciliation, and connectivity checks pass. The disabled state creates manual
Jobs and avoids an unprepared scheduled DB execution.

Terraform creates Container Apps Jobs with `Microsoft.App/jobs@2025-01-01`.
Firewall reconciliation must read Job `properties.outboundIpAddresses` through
the `Microsoft.App/jobs@2026-07-01` ARM endpoint; the API App continues to use
the `2025-01-01` Container Apps endpoint. Do not substitute older CLI output for
the Job discovery call.

Use the separate [`bootstrap`](bootstrap/README.md) root for protected state and
OIDC identity federation. It intentionally does not contain persistent RBAC or
PostgreSQL-admin assignments. The authorized human grants those narrowly scoped
roles after reviewing these outputs and the real resource inventory.

## Backend and safe local inputs

Initialize with `infra/terraform/bootstrap` first, then pass Azure Blob backend
settings outside the repository:

```powershell
terraform init `
  -backend-config="storage_account_name=<state-account>" `
  -backend-config="container_name=terraform-state" `
  -backend-config="key=ciri-production.tfstate" `
  -backend-config="resource_group_name=ciri-tfstate-rg" `
  -backend-config="subscription_id=<subscription-id>" `
  -backend-config="tenant_id=<tenant-id>" `
  -backend-config="use_azuread_auth=true"
```

Keep local values in an ignored `production.auto.tfvars.json` containing only
identifiers and URIs. Do not put `POSTGRES_PASSWORD`, API keys, SWA tokens,
connection strings, state keys, or provider credentials in it.

## Existing-resource handoff

The old root managed `azurerm_container_app.backend` in an externally supplied
environment. The approved platform now owns the resource group and environment
and represents the API/Jobs through AzAPI to keep the API version and Job egress
fields explicit. AzAPI and AzureRM resource types cannot be moved with
`terraform state mv`; back up and lock the remote state, then use a reviewed
state-remove/import transition after matching each live resource by name,
parent, image, identity, and revision mode:

```powershell
terraform state pull > .\ciri-production-state-backup.json
terraform state rm azurerm_container_app.backend
terraform import azapi_resource.backend <backend-resource-id>
terraform state rm 'azurerm_log_analytics_workspace.observability[0]'
terraform import azapi_resource.observability <workspace-resource-id>
```

The workspace keeps the old names `${container_app_name}-logs` and
`${container_app_name}-insights`. The same-type index transitions are declared
with `moved` blocks for
`azurerm_application_insights.observability[0]` and
`azurerm_monitor_diagnostic_setting.observability[0]`. The old diagnostic
binding becomes `azurerm_monitor_diagnostic_setting.environment_logs`.
The removed baseline alert bindings must be explicitly reviewed and removed
from state because the approved platform has no paid alert rules:

```powershell
terraform state rm 'azurerm_monitor_metric_alert.replicas[0]'
terraform state rm 'azurerm_monitor_scheduled_query_rules_alert_v2.http_errors[0]'
terraform state rm 'azurerm_monitor_scheduled_query_rules_alert_v2.platform_health[0]'
```

After a human confirms the paid alerts are no longer wanted, delete those
three orphaned Azure Monitor resources by their queried resource IDs. State
removal alone intentionally does not destroy them, and the platform root will
never recreate them:

```powershell
az resource delete --ids <replicas-metric-alert-resource-id>
az resource delete --ids <http-errors-scheduled-query-alert-resource-id>
az resource delete --ids <platform-health-scheduled-query-alert-resource-id>
```

If an existing Container Apps environment is adopted, import it into
`azurerm_container_app_environment.production` after checking its network and
Consumption profile. Review the complete plan for zero unintended destroys,
especially workspace, Application Insights, diagnostic-setting, and alert
bindings, before applying. Never apply against unknown state or create a
duplicate environment.

The database starts with no automatic executor firewall rules. Create only
exact human operator rules in `operator_ipv4_rules`; the firewall Job owns its
separate automatic prefix after deployment. Never add an Azure-services bypass,
internet-wide range, VNet, NAT, private endpoint, dedicated profile, ACR, or
other unapproved network/compute resource.

The Container Apps environment uses the Azure Monitor diagnostic-setting route
for exactly `ContainerAppConsoleLogs` and `ContainerAppSystemLogs`; it does not
also configure direct Log Analytics delivery. This keeps one stdout ingestion
path and avoids duplicate monitoring records.

Export retention is owned by the export CLI. It reads completion manifests,
keeps the newest two valid completed sets, and removes abandoned incomplete
prefixes only after validating that they are not referenced by a completion
manifest. Terraform keeps Blob soft-delete protection but does not apply a
blind lifecycle TTL that could delete a valid four-month export.

The annual budget is anchored at a separately supplied first-of-month
`budget_period_start`, because Azure Cost Management budget periods use
calendar-month boundaries. It is an approximation for the independently
verified credit period: `credit_period_start` remains the actual period used by
the checker and export metadata. Notifications at 80% and 90% plus the
separate monthly burn warning do not stop spending, and Cost
Management/credit mapping remains an Azure verification gate. Outputs are
identifiers, URLs, and resource metadata only; no deployment token or secret
is output.

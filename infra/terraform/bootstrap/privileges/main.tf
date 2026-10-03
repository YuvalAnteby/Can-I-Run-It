terraform {
  required_version = "= 1.11.4"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 4.25.0"
    }
  }
}
provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  tenant_id                       = var.tenant_id
  resource_provider_registrations = "none"
  storage_use_azuread             = true
}
variable "subscription_id" { type = string }
variable "tenant_id" { type = string }
variable "resource_group_name" { type = string }
variable "name_prefix" { type = string }
variable "postgres_server_name" { type = string }
variable "key_vault_name" { type = string }
variable "export_storage_account_name" { type = string }
variable "platform_principal_id" { type = string }
variable "release_principal_id" { type = string }
variable "human_admin_object_id" { type = string }
variable "human_admin_login" { type = string }
variable "executor_principal_ids" {
  type    = map(string)
  default = {}
  validation {
    condition     = !var.runtime_rbac_enabled || alltrue([for name in ["backend", "migration", "export", "firewall", "export-check"] : can(regex("^[0-9a-fA-F-]{36}$", lookup(var.executor_principal_ids, name, "")))])
    error_message = "Runtime phase requires all five actual executor principal IDs from nonsecret outputs."
  }
}
variable "runtime_rbac_enabled" {
  type    = bool
  default = false
}
variable "cost_query_enabled" {
  type        = bool
  default     = false
  description = "Enable only after real subscription Cost Query/currency/credit mapping acceptance."
}
locals {
  subscription_scope = "/subscriptions/${var.subscription_id}"
  group_scope        = "${local.subscription_scope}/resourceGroups/${var.resource_group_name}"
  prefix             = "${local.group_scope}/providers"
  app_id             = "${local.prefix}/Microsoft.App/containerApps/${var.name_prefix}-api"
  job_ids            = { for name in ["migration", "export", "firewall", "export-check"] : name => "${local.prefix}/Microsoft.App/jobs/${var.name_prefix}-${name}" }
  postgres_id        = "${local.prefix}/Microsoft.DBforPostgreSQL/flexibleServers/${var.postgres_server_name}"
  storage_id         = "${local.prefix}/Microsoft.Storage/storageAccounts/${var.export_storage_account_name}"
  blob_scopes        = { for name in ["exports", "control"] : name => "${local.storage_id}/blobServices/default/containers/${name}" }
  vault_id           = "${local.prefix}/Microsoft.KeyVault/vaults/${var.key_vault_name}"
}
# Human must create/import the production group once before this first phase.
# Explicit actions avoid Contributor's RBAC/admin and secret-list side effects.
resource "azurerm_role_definition" "platform" {
  name              = "${var.name_prefix}-platform-infrastructure"
  scope             = local.group_scope
  assignable_scopes = [local.group_scope]
  permissions {
    actions = [
      "Microsoft.Resources/subscriptions/resourceGroups/read", "Microsoft.Resources/subscriptions/resourceGroups/write",
      "Microsoft.App/managedEnvironments/read", "Microsoft.App/managedEnvironments/write", "Microsoft.App/managedEnvironments/delete", "Microsoft.App/containerApps/read", "Microsoft.App/containerApps/write", "Microsoft.App/containerApps/delete", "Microsoft.App/jobs/read", "Microsoft.App/jobs/write", "Microsoft.App/jobs/delete",
      "Microsoft.ManagedIdentity/userAssignedIdentities/read", "Microsoft.ManagedIdentity/userAssignedIdentities/write", "Microsoft.ManagedIdentity/userAssignedIdentities/delete", "Microsoft.ManagedIdentity/userAssignedIdentities/assign/action",
      "Microsoft.DBforPostgreSQL/flexibleServers/read", "Microsoft.DBforPostgreSQL/flexibleServers/write", "Microsoft.DBforPostgreSQL/flexibleServers/delete", "Microsoft.DBforPostgreSQL/flexibleServers/configurations/*", "Microsoft.DBforPostgreSQL/flexibleServers/databases/*", "Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/*",
      "Microsoft.KeyVault/vaults/read", "Microsoft.KeyVault/vaults/write", "Microsoft.KeyVault/vaults/delete",
      "Microsoft.Storage/storageAccounts/read", "Microsoft.Storage/storageAccounts/write", "Microsoft.Storage/storageAccounts/delete", "Microsoft.Storage/storageAccounts/blobServices/read", "Microsoft.Storage/storageAccounts/blobServices/write", "Microsoft.Storage/storageAccounts/blobServices/containers/read", "Microsoft.Storage/storageAccounts/blobServices/containers/write", "Microsoft.Storage/storageAccounts/blobServices/containers/delete",
      "Microsoft.OperationalInsights/workspaces/read", "Microsoft.OperationalInsights/workspaces/write", "Microsoft.OperationalInsights/workspaces/delete",
      "Microsoft.Insights/components/read", "Microsoft.Insights/components/write", "Microsoft.Insights/components/delete", "Microsoft.Insights/diagnosticSettings/*",
      "Microsoft.Web/staticSites/read", "Microsoft.Web/staticSites/write", "Microsoft.Web/staticSites/delete"
    ]
  }
}
resource "azurerm_role_assignment" "platform" {
  scope              = local.group_scope
  role_definition_id = azurerm_role_definition.platform.role_definition_resource_id
  principal_id       = var.platform_principal_id
}
resource "azurerm_role_definition" "budget" {
  name              = "${var.name_prefix}-budget-management"
  scope             = local.subscription_scope
  assignable_scopes = [local.subscription_scope]
  permissions { actions = ["Microsoft.Consumption/budgets/read", "Microsoft.Consumption/budgets/write", "Microsoft.Consumption/budgets/delete"] }
}
resource "azurerm_role_assignment" "budget" {
  scope              = local.subscription_scope
  role_definition_id = azurerm_role_definition.budget.role_definition_resource_id
  principal_id       = var.platform_principal_id
}
resource "azurerm_role_definition" "release_app" {
  name              = "${var.name_prefix}-release-app"
  scope             = local.group_scope
  assignable_scopes = [local.group_scope]
  permissions { actions = ["Microsoft.App/containerApps/read", "Microsoft.App/containerApps/write", "Microsoft.App/containerApps/revisions/read"] }
}
resource "azurerm_role_assignment" "release_app" {
  count              = var.runtime_rbac_enabled ? 1 : 0
  scope              = local.app_id
  role_definition_id = azurerm_role_definition.release_app.role_definition_resource_id
  principal_id       = var.release_principal_id
}
resource "azurerm_role_definition" "job_operator" {
  name              = "${var.name_prefix}-trusted-job-operator"
  scope             = local.group_scope
  assignable_scopes = [local.group_scope]
  permissions { actions = ["Microsoft.App/jobs/read", "Microsoft.App/jobs/start/action", "Microsoft.App/jobs/executions/read"] }
}
resource "azurerm_role_assignment" "release_jobs" {
  for_each           = var.runtime_rbac_enabled ? local.job_ids : {}
  scope              = each.value
  role_definition_id = azurerm_role_definition.job_operator.role_definition_resource_id
  principal_id       = var.release_principal_id
}
resource "azurerm_role_definition" "executor_read" {
  name              = "${var.name_prefix}-executor-discovery"
  scope             = local.group_scope
  assignable_scopes = [local.group_scope]
  permissions { actions = ["Microsoft.App/containerApps/read", "Microsoft.App/jobs/read"] }
}
resource "azurerm_role_assignment" "firewall_executor_read" {
  for_each           = var.runtime_rbac_enabled ? { api = local.app_id, migration = local.job_ids.migration, export = local.job_ids.export } : {}
  scope              = each.value
  role_definition_id = azurerm_role_definition.executor_read.role_definition_resource_id
  principal_id       = var.executor_principal_ids["firewall"]
}
resource "azurerm_role_definition" "firewall" {
  name              = "${var.name_prefix}-database-firewall"
  scope             = local.group_scope
  assignable_scopes = [local.group_scope]
  permissions { actions = ["Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/read", "Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/write", "Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/delete"] }
}
resource "azurerm_role_assignment" "firewall" {
  count              = var.runtime_rbac_enabled ? 1 : 0
  scope              = local.postgres_id
  role_definition_id = azurerm_role_definition.firewall.role_definition_resource_id
  principal_id       = var.executor_principal_ids["firewall"]
}
resource "azurerm_role_assignment" "checker_jobs" {
  for_each           = var.runtime_rbac_enabled ? { firewall = local.job_ids.firewall, export = local.job_ids.export } : {}
  scope              = each.value
  role_definition_id = azurerm_role_definition.job_operator.role_definition_resource_id
  principal_id       = var.executor_principal_ids["export-check"]
}
resource "azurerm_role_assignment" "control_data" {
  for_each             = var.runtime_rbac_enabled ? toset(["firewall", "export", "export-check"]) : toset([])
  scope                = local.blob_scopes.control
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.executor_principal_ids[each.key]
}
resource "azurerm_role_assignment" "export_data" {
  count                = var.runtime_rbac_enabled ? 1 : 0
  scope                = local.blob_scopes.exports
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.executor_principal_ids["export"]
}
resource "azurerm_role_assignment" "backend_secrets" {
  count                = var.runtime_rbac_enabled ? 1 : 0
  scope                = local.vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.executor_principal_ids["backend"]
}

resource "azurerm_role_assignment" "checker_cost" {
  count                = var.runtime_rbac_enabled && var.cost_query_enabled ? 1 : 0
  scope                = local.subscription_scope
  role_definition_name = "Cost Management Reader"
  principal_id         = var.executor_principal_ids["export-check"]
}
resource "azurerm_postgresql_flexible_server_active_directory_administrator" "human" {
  count               = var.runtime_rbac_enabled ? 1 : 0
  server_name         = var.postgres_server_name
  resource_group_name = var.resource_group_name
  tenant_id           = var.tenant_id
  object_id           = var.human_admin_object_id
  principal_name      = var.human_admin_login
  principal_type      = "User"
}
# Read-only subscription metadata and regional SKU listing; never provider registration.
resource "azurerm_role_definition" "inventory" {
  name              = "${var.name_prefix}-subscription-preflight"
  scope             = local.subscription_scope
  assignable_scopes = [local.subscription_scope]
  permissions {
    actions = ["Microsoft.Resources/subscriptions/read", "Microsoft.Resources/subscriptions/providers/read", "Microsoft.DBforPostgreSQL/locations/capabilities/read"]
  }
}
resource "azurerm_role_assignment" "inventory" {
  scope              = local.subscription_scope
  role_definition_id = azurerm_role_definition.inventory.role_definition_resource_id
  principal_id       = var.platform_principal_id
}
resource "azurerm_role_definition" "swa_read" {
  name              = "${var.name_prefix}-release-spa-read"
  scope             = local.group_scope
  assignable_scopes = [local.group_scope]
  permissions { actions = ["Microsoft.Web/staticSites/read"] }
}
resource "azurerm_role_assignment" "release_swa_read" {
  count              = var.runtime_rbac_enabled ? 1 : 0
  scope              = "${local.prefix}/Microsoft.Web/staticSites/${var.name_prefix}-web"
  role_definition_id = azurerm_role_definition.swa_read.role_definition_resource_id
  principal_id       = var.release_principal_id
}

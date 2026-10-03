terraform {
  required_version = "= 1.11.4"
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "= 2.4.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 4.25.0"
    }
  }
  backend "azurerm" {
    use_azuread_auth = true
    use_oidc         = true
  }
}
provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  tenant_id                       = var.tenant_id
  resource_provider_registrations = "none"
  storage_use_azuread             = true
}
locals {
  tags            = { project = "ciri", environment = "production", owner = var.owner }
  resource_prefix = "/subscriptions/${var.subscription_id}/resourceGroups/${var.resource_group_name}/providers"
  app_id          = "${local.resource_prefix}/Microsoft.App/containerApps/${var.name_prefix}-api"
  job_ids         = { for name in ["migration", "export", "firewall", "export-check"] : name => "${local.resource_prefix}/Microsoft.App/jobs/${var.name_prefix}-${name}" }
  postgres_id     = "${local.resource_prefix}/Microsoft.DBforPostgreSQL/flexibleServers/${var.postgres_server_name}"
  db_environment = {
    POSTGRES_AUTH_MODE = "entra"
    POSTGRES_HOST      = azurerm_postgresql_flexible_server.database.fqdn
    POSTGRES_PORT      = "5432"
    POSTGRES_DB        = var.postgres_database
    POSTGRES_SSL_MODE  = "verify-full"
    POSTGRES_POOL_MAX  = "2"
  }
  control_environment = {
    MAINTENANCE_AUTH_MODE        = "managed-identity"
    AZURE_SUBSCRIPTION_ID        = var.subscription_id
    DB_EXECUTOR_RESOURCE_IDS     = jsonencode([local.app_id, local.job_ids.migration, local.job_ids.export])
    POSTGRES_SERVER_RESOURCE_ID  = local.postgres_id
    EXPORT_STORAGE_ACCOUNT       = var.export_storage_account_name
    EXPORT_CONTAINER             = "exports"
    CONTROL_CONTAINER            = "control"
    FIREWALL_JOB_RESOURCE_ID     = local.job_ids.firewall
    EXPORT_JOB_RESOURCE_ID       = local.job_ids.export
    CREDIT_PERIOD_START          = var.credit_period_start
    CREDIT_PERIOD_END            = var.credit_period_end
    CREDIT_CURRENCY              = var.credit_currency
    VERIFIED_CREDIT_COST_MAPPING = tostring(var.verified_credit_cost_mapping)
    RELEASE_TOOLS_IMAGE_DIGEST   = var.tools_image
  }
  jobs = {
    migration    = { cpu = 0.5, memory = "1Gi", timeout = 600, cron = null, command = ["node", "/app/dist/database/maintenance.js", "migrate"], env = merge(local.db_environment, { POSTGRES_USER = "ciri-migrator" }) }
    export       = { cpu = 0.5, memory = "1Gi", timeout = 600, cron = null, command = ["node", "/app/maintenance/cli.mjs", "export"], env = merge(local.control_environment, local.db_environment, { POSTGRES_USER = "ciri-exporter", POSTGRES_SSL_ROOT_CERT = "/etc/ssl/certs/ca-certificates.crt" }) }
    firewall     = { cpu = 0.25, memory = "0.5Gi", timeout = 60, cron = "0 * * * *", command = ["node", "/app/maintenance/cli.mjs", "firewall"], env = local.control_environment }
    export-check = { cpu = 0.25, memory = "0.5Gi", timeout = 60, cron = "0 2 * * *", command = ["node", "/app/maintenance/cli.mjs", "export-check"], env = local.control_environment }
  }
}
resource "azurerm_resource_group" "production" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.tags
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.entitlement_verified
      error_message = "Requires observed subscription/grants/region/SKU/quota, resource inventory and reviewed dated costs before apply."
    }
  }
}
resource "azapi_resource" "frontend" {
  type      = "Microsoft.Web/staticSites@2024-04-01"
  name      = "${var.name_prefix}-web"
  parent_id = azurerm_resource_group.production.id
  location  = var.location
  body = {
    sku        = { name = "Free", tier = "Free" }
    properties = {}
  }
  response_export_values = ["properties.defaultHostname"]
  tags                   = local.tags
}
resource "azurerm_user_assigned_identity" "executor" {
  for_each            = toset(["backend", "migration", "export", "firewall", "export-check"])
  name                = "${var.name_prefix}-${each.key}-identity"
  resource_group_name = azurerm_resource_group.production.name
  location            = var.location
  tags                = local.tags
}
resource "azapi_resource" "observability" {
  type      = "Microsoft.OperationalInsights/workspaces@2023-09-01"
  name      = "${var.name_prefix}-logs"
  parent_id = azurerm_resource_group.production.id
  location  = var.location
  body = {
    properties = {
      sku              = { name = "PerGB2018" }
      retentionInDays  = 30
      workspaceCapping = { dailyQuotaGb = 0.1 }
      features         = { disableLocalAuth = true }
    }
  }
  response_export_values = []
  tags                   = local.tags
}
resource "azurerm_application_insights" "observability" {
  name                 = "${var.name_prefix}-insights"
  resource_group_name  = azurerm_resource_group.production.name
  location             = var.location
  application_type     = "web"
  workspace_id         = azapi_resource.observability.id
  retention_in_days    = 30
  daily_data_cap_in_gb = 0.1
  sampling_percentage  = 100
  tags                 = local.tags
}
resource "azurerm_container_app_environment" "production" {
  name                = "${var.name_prefix}-environment"
  resource_group_name = azurerm_resource_group.production.name
  location            = var.location
  logs_destination    = "azure-monitor"
  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
  tags = local.tags
}
resource "azurerm_monitor_diagnostic_setting" "environment_logs" {
  name                           = "console-and-system"
  target_resource_id             = azurerm_container_app_environment.production.id
  log_analytics_workspace_id     = azapi_resource.observability.id
  log_analytics_destination_type = "Dedicated"
  enabled_log { category = "ContainerAppConsoleLogs" }
  enabled_log { category = "ContainerAppSystemLogs" }
}
resource "azurerm_key_vault" "providers" {
  name                          = var.key_vault_name
  resource_group_name           = azurerm_resource_group.production.name
  location                      = var.location
  tenant_id                     = var.tenant_id
  sku_name                      = "standard"
  enable_rbac_authorization     = true
  public_network_access_enabled = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 7
  tags                          = local.tags
  lifecycle { prevent_destroy = true }
}
resource "azapi_resource" "exports_account" {
  type      = "Microsoft.Storage/storageAccounts@2023-05-01"
  name      = var.export_storage_account_name
  parent_id = azurerm_resource_group.production.id
  location  = var.location
  body = {
    kind = "StorageV2"
    sku  = { name = "Standard_LRS" }
    properties = {
      accessTier                   = "Hot"
      minimumTlsVersion            = "TLS1_2"
      allowSharedKeyAccess         = false
      defaultToOAuthAuthentication = true
      allowBlobPublicAccess        = false
      supportsHttpsTrafficOnly     = true
    }
  }
  response_export_values = []
  tags                   = local.tags
  lifecycle { prevent_destroy = true }
}
resource "azapi_resource" "exports_blob_service" {
  type                   = "Microsoft.Storage/storageAccounts/blobServices@2023-05-01"
  name                   = "default"
  parent_id              = azapi_resource.exports_account.id
  body                   = { properties = { isVersioningEnabled = false, deleteRetentionPolicy = { enabled = false }, containerDeleteRetentionPolicy = { enabled = false } } }
  response_export_values = []
}
resource "azapi_resource" "exports_container" {
  for_each               = toset(["exports", "control"])
  type                   = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01"
  name                   = each.key
  parent_id              = azapi_resource.exports_blob_service.id
  body                   = { properties = { publicAccess = "None" } }
  response_export_values = []
  lifecycle { prevent_destroy = true }
}
resource "azurerm_postgresql_flexible_server" "database" {
  name                          = var.postgres_server_name
  resource_group_name           = azurerm_resource_group.production.name
  location                      = var.location
  version                       = "16"
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  auto_grow_enabled             = false
  backup_retention_days         = 7
  geo_redundant_backup_enabled  = false
  public_network_access_enabled = true
  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false
    tenant_id                     = var.tenant_id
  }
  tags = local.tags
  lifecycle { prevent_destroy = true }
}
resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.database.id
  value     = "PG_TRGM"
}
resource "azurerm_postgresql_flexible_server_database" "application" {
  name      = var.postgres_database
  server_id = azurerm_postgresql_flexible_server.database.id
  charset   = "UTF8"
  collation = "en_US.utf8"
  lifecycle { prevent_destroy = true }
}
# ciri-auto-* firewall rules are exclusively owned by the finite controller.
resource "azurerm_postgresql_flexible_server_firewall_rule" "operator" {
  for_each         = var.operator_ipv4_rules
  name             = "ciri-operator-${each.key}"
  server_id        = azurerm_postgresql_flexible_server.database.id
  start_ip_address = each.value
  end_ip_address   = each.value
}
resource "azapi_resource" "backend" {
  type      = "Microsoft.App/containerApps@2024-03-01"
  name      = "${var.name_prefix}-api"
  parent_id = azurerm_resource_group.production.id
  location  = var.location
  tags      = local.tags
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.executor["backend"].id]
  }
  body = {
    properties = {
      managedEnvironmentId = azurerm_container_app_environment.production.id
      workloadProfileName  = "Consumption"
      configuration = {
        activeRevisionsMode = "Single"
        ingress             = { external = true, allowInsecure = false, targetPort = 4000, transport = "http", traffic = [{ latestRevision = true, weight = 100 }] }
        secrets             = concat([for name, uri in var.provider_secret_uris : { name = lower(replace(name, "_", "-")), keyVaultUrl = uri, identity = azurerm_user_assigned_identity.executor["backend"].id }], [{ name = "applicationinsights-connection-string", value = azurerm_application_insights.observability.connection_string }])
      }
      template = {
        scale = { minReplicas = 0, maxReplicas = 1 }
        containers = [{
          name      = "api"
          image     = var.backend_image
          resources = { cpu = 0.5, memory = "1Gi" }
          env = concat([for name, value in merge(local.db_environment, {
            NODE_ENV            = "production", PORT = "4000", POSTGRES_USER = "ciri-runtime", POSTGRES_POOL_MAX = "5",
            AZURE_CLIENT_ID     = azurerm_user_assigned_identity.executor["backend"].client_id,
            REACT_URL           = "https://${azapi_resource.frontend.output.properties.defaultHostname}",
            TELEMETRY_ENABLED   = "true", LOG_LEVEL = "info", OTEL_SERVICE_NAME = "ciri-backend",
            OTEL_TRACES_SAMPLER = "microsoft.fixed_percentage", OTEL_TRACES_SAMPLER_ARG = "0.1"
          }) : { name = name, value = value }], [for name, uri in var.provider_secret_uris : { name = name, secretRef = lower(replace(name, "_", "-")) }], [{ name = "APPLICATIONINSIGHTS_CONNECTION_STRING", secretRef = "applicationinsights-connection-string" }])
          probes = [
            { type = "Startup", httpGet = { path = "/api/health/live", port = 4000, scheme = "HTTP" }, periodSeconds = 5, failureThreshold = 30, timeoutSeconds = 2 },
            { type = "Liveness", httpGet = { path = "/api/health/live", port = 4000, scheme = "HTTP" }, periodSeconds = 10, failureThreshold = 3, timeoutSeconds = 2 },
            { type = "Readiness", httpGet = { path = "/api/health/ready", port = 4000, scheme = "HTTP" }, periodSeconds = 5, failureThreshold = 1, successThreshold = 1, timeoutSeconds = 2 }
          ]
        }]
      }
    }
  }
  response_export_values = ["properties.configuration.ingress.fqdn"]
  lifecycle { ignore_changes = [body.properties.template.containers[0].image] }
}
resource "azapi_resource" "maintenance" {
  for_each  = local.jobs
  type      = "Microsoft.App/jobs@2024-03-01"
  name      = "${var.name_prefix}-${each.key}"
  parent_id = azurerm_resource_group.production.id
  location  = var.location
  tags      = local.tags
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.executor[each.key].id]
  }
  body = {
    properties = {
      environmentId       = azurerm_container_app_environment.production.id
      workloadProfileName = "Consumption"
      configuration = {
        replicaTimeout        = each.value.timeout
        replicaRetryLimit     = 0
        triggerType           = each.value.cron != null && var.maintenance_schedules_enabled ? "Schedule" : "Manual"
        manualTriggerConfig   = each.value.cron != null && var.maintenance_schedules_enabled ? null : { parallelism = 1, replicaCompletionCount = 1 }
        scheduleTriggerConfig = each.value.cron != null && var.maintenance_schedules_enabled ? { cronExpression = each.value.cron, parallelism = 1, replicaCompletionCount = 1 } : null
      }
      template = {
        containers = [{
          name      = each.key
          image     = var.tools_image
          resources = { cpu = each.value.cpu, memory = each.value.memory }
          command   = each.value.command
          env       = [for name, value in merge(each.value.env, { AZURE_CLIENT_ID = azurerm_user_assigned_identity.executor[each.key].client_id, NODE_ENV = "production" }) : { name = name, value = value }]
        }]
      }
    }
  }
  response_export_values = []
}

resource "azurerm_consumption_budget_subscription" "credit" {
  name            = "${var.name_prefix}-credit-period"
  subscription_id = "/subscriptions/${var.subscription_id}"
  amount          = 100
  time_grain      = "Annually"
  time_period {
    start_date = var.budget_period_start
    end_date   = var.credit_period_end
  }
  dynamic "notification" {
    for_each = toset([80, 90])
    content {
      enabled        = true
      threshold      = notification.value
      operator       = "GreaterThanOrEqualTo"
      contact_emails = [var.alert_email]
    }
  }
}
resource "azurerm_consumption_budget_subscription" "monthly" {
  name            = "${var.name_prefix}-monthly-burn"
  subscription_id = "/subscriptions/${var.subscription_id}"
  amount          = 8
  time_grain      = "Monthly"
  time_period {
    start_date = var.budget_period_start
    end_date   = var.credit_period_end
  }
  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    contact_emails = [var.alert_email]
  }
}

provider "azapi" {
  skip_provider_registration = true
  subscription_id            = var.subscription_id
  tenant_id                  = var.tenant_id
}

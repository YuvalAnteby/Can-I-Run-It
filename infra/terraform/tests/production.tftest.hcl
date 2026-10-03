mock_provider "azapi" {}
mock_provider "azurerm" {
  mock_resource "azurerm_resource_group" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production" }
  }
  mock_resource "azurerm_user_assigned_identity" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.ManagedIdentity/userAssignedIdentities/ciri-identity", client_id = "22222222-2222-2222-2222-222222222222", principal_id = "33333333-3333-3333-3333-333333333333" }
  }
  mock_resource "azurerm_container_app_environment" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.App/managedEnvironments/ciri-environment" }
  }
  mock_resource "azurerm_storage_account" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.Storage/storageAccounts/ciriexports" }
  }
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.OperationalInsights/workspaces/ciri-logs" }
  }
  mock_resource "azurerm_postgresql_flexible_server" {
    defaults = { id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.DBforPostgreSQL/flexibleServers/ciri-pg", fqdn = "ciri-pg.postgres.database.azure.com" }
  }
}
variables {
  subscription_id             = "11111111-1111-1111-1111-111111111111"
  tenant_id                   = "22222222-2222-2222-2222-222222222222"
  resource_group_name         = "ciri-production"
  name_prefix                 = "ciri"
  owner                       = "test"
  postgres_server_name        = "ciri-pg"
  key_vault_name              = "ciri-vault"
  export_storage_account_name = "ciriexports"
  backend_image               = "ghcr.io/example/ciri@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  tools_image                 = "ghcr.io/example/ciri-tools@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  credit_period_start         = "2026-10-03T00:00:00Z"
  budget_period_start         = "2026-10-01T00:00:00Z"
  credit_period_end           = "2027-10-03T00:00:00Z"
  credit_currency             = "USD"
  alert_email                 = "test@example.com"
  entitlement_verified        = true
}
run "fixed_platform_plan" {
  command = plan
  assert {
    condition     = azapi_resource.backend.body.properties.template.scale.minReplicas == 0 && azapi_resource.backend.body.properties.template.scale.maxReplicas == 1 && azapi_resource.backend.body.properties.configuration.activeRevisionsMode == "Single" && azapi_resource.backend.body.properties.template.containers[0].resources.cpu == 0.5 && azapi_resource.backend.body.properties.template.containers[0].resources.memory == "1Gi"
    error_message = "API must stay Single revision, min0/max1 and 0.5CPU/1Gi."
  }
  assert {
    condition     = azapi_resource.backend.body.properties.configuration.ingress.external && !azapi_resource.backend.body.properties.configuration.ingress.allowInsecure && azapi_resource.backend.body.properties.configuration.ingress.targetPort == 4000
    error_message = "Ingress must be external HTTPS port4000."
  }
  assert {
    condition     = azapi_resource.frontend.body.sku.tier == "Free" && azapi_resource.frontend.body.sku.name == "Free" && length(azurerm_container_app_environment.production.workload_profile) == 1 && one(azurerm_container_app_environment.production.workload_profile).workload_profile_type == "Consumption" && azurerm_container_app_environment.production.infrastructure_subnet_id == null
    error_message = "SWA Free and default-network Consumption only are fixed."
  }
  assert {
    condition     = azurerm_postgresql_flexible_server.database.version == "16" && azurerm_postgresql_flexible_server.database.sku_name == "B_Standard_B1ms" && azurerm_postgresql_flexible_server.database.storage_mb == 32768 && !azurerm_postgresql_flexible_server.database.auto_grow_enabled && azurerm_postgresql_flexible_server.database.backup_retention_days == 7 && !azurerm_postgresql_flexible_server.database.geo_redundant_backup_enabled && length(azurerm_postgresql_flexible_server.database.high_availability) == 0 && azurerm_postgresql_flexible_server.database.authentication[0].active_directory_auth_enabled && !azurerm_postgresql_flexible_server.database.authentication[0].password_auth_enabled && length(azurerm_postgresql_flexible_server_firewall_rule.operator) == 0
    error_message = "PG16/B1ms32GiB Entra-only/no HA/no bypass deny-all initial server required."
  }
  assert {
    condition     = azapi_resource.observability.body.properties.workspaceCapping.dailyQuotaGb == 0.1 && azapi_resource.observability.body.properties.retentionInDays == 30 && azurerm_application_insights.observability.daily_data_cap_in_gb == 0.1 && length(azurerm_monitor_diagnostic_setting.environment_logs.enabled_log) == 2 && length(azurerm_monitor_diagnostic_setting.environment_logs.metric) == 0
    error_message = "Telemetry must retain30d cap0.1GB and console/system only."
  }
  assert {
    condition     = !azapi_resource.exports_account.body.properties.allowSharedKeyAccess && !azapi_resource.exports_account.body.properties.allowBlobPublicAccess && azapi_resource.exports_account.body.sku.name == "Standard_LRS" && !azapi_resource.exports_blob_service.body.properties.isVersioningEnabled && alltrue([for container in azapi_resource.exports_container : container.body.properties.publicAccess == "None"])
    error_message = "Export/control storage must use private Entra LRS without accumulating versioned dumps."
  }
  assert {
    condition     = length(azapi_resource.maintenance) == 4 && alltrue([for name, job in azapi_resource.maintenance : job.body.properties.configuration.replicaRetryLimit == 0 && job.body.properties.configuration.manualTriggerConfig.parallelism == 1 && job.body.properties.configuration.manualTriggerConfig.replicaCompletionCount == 1 && job.body.properties.configuration.triggerType == "Manual" && job.body.properties.workloadProfileName == "Consumption" && job.body.properties.template.containers[0].image == var.tools_image && !can(job.body.properties.configuration.secrets)])
    error_message = "Four finite identity-isolated Jobs must initially be manual, pinned and secret-free."
  }
  assert {
    condition     = alltrue([for name in ["migration", "export"] : azapi_resource.maintenance[name].body.properties.configuration.replicaTimeout == 600 && azapi_resource.maintenance[name].body.properties.template.containers[0].resources.cpu == 0.5 && azapi_resource.maintenance[name].body.properties.template.containers[0].resources.memory == "1Gi"]) && alltrue([for name in ["firewall", "export-check"] : azapi_resource.maintenance[name].body.properties.configuration.replicaTimeout == 60 && azapi_resource.maintenance[name].body.properties.template.containers[0].resources.cpu == 0.25 && azapi_resource.maintenance[name].body.properties.template.containers[0].resources.memory == "0.5Gi"])
    error_message = "DB jobs600s0.5CPU1Gi; control jobs60s0.25CPU0.5Gi."
  }
  assert {
    condition     = local.control_environment.CREDIT_PERIOD_START == "2026-10-03T00:00:00Z" && local.control_environment.VERIFIED_CREDIT_COST_MAPPING == "false" && azurerm_consumption_budget_subscription.credit.time_period[0].start_date == "2026-10-01T00:00:00Z"
    error_message = "Actual credit start stays separate from first-month budget; threshold mapping is opt-in."
  }
}
run "schedules_and_native_secret_references" {
  command = plan
  variables {
    maintenance_schedules_enabled = true
    provider_secret_uris          = { GEMINI_API_KEY = "https://ciri-vault.vault.azure.net/secrets/gemini" }
    operator_ipv4_rules           = { temporary = "8.8.8.8" }
  }
  assert {
    condition     = azapi_resource.maintenance["firewall"].body.properties.configuration.scheduleTriggerConfig.cronExpression == "0 * * * *" && azapi_resource.maintenance["export-check"].body.properties.configuration.scheduleTriggerConfig.cronExpression == "0 2 * * *"
    error_message = "Control schedules must be hourly and daily02UTC only."
  }
  assert {
    condition     = azapi_resource.backend.body.properties.configuration.secrets[0].name == "gemini-api-key" && azapi_resource.backend.body.properties.configuration.secrets[0].keyVaultUrl == "https://ciri-vault.vault.azure.net/secrets/gemini" && !contains(keys(azapi_resource.backend.body.properties.configuration.secrets[0]), "value") && azurerm_postgresql_flexible_server_firewall_rule.operator["temporary"].start_ip_address == azurerm_postgresql_flexible_server_firewall_rule.operator["temporary"].end_ip_address
    error_message = "Provider value must remain a native vault URI; operator IP must remain exact."
  }
}
run "reject_unverified_subscription" {
  command = plan
  variables { entitlement_verified = false }
  expect_failures = [azurerm_resource_group.production]
}
run "reject_bypass" {
  command = plan
  variables { operator_ipv4_rules = { forbidden = "0.0.0.0" } }
  expect_failures = [var.operator_ipv4_rules]
}
run "reject_public_range" {
  command = plan
  variables { operator_ipv4_rules = { forbidden = "8.8.8.8/24" } }
  expect_failures = [var.operator_ipv4_rules]
}
run "reject_private_source" {
  command = plan
  variables { operator_ipv4_rules = { forbidden = "172.16.0.1" } }
  expect_failures = [var.operator_ipv4_rules]
}
run "reject_mutable_image" {
  command = plan
  variables { backend_image = "ghcr.io/example/ciri:latest" }
  expect_failures = [var.backend_image]
}
run "reject_provider_secret_value" {
  command = plan
  variables { provider_secret_uris = { GEMINI_API_KEY = "unsafe-plaintext" } }
  expect_failures = [var.provider_secret_uris]
}
run "reject_unknown_secret" {
  command = plan
  variables { provider_secret_uris = { POSTGRES_PASSWORD = "https://ciri-vault.vault.azure.net/secrets/password" } }
  expect_failures = [var.provider_secret_uris]
}
run "reject_paid_region_substitution" {
  command = plan
  variables { location = "eastus" }
  expect_failures = [var.location]
}




run "reject_shared_cgnat_source" {
  command = plan
  variables { operator_ipv4_rules = { forbidden = "100.64.0.1" } }
  expect_failures = [var.operator_ipv4_rules]
}

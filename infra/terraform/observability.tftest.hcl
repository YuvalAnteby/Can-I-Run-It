mock_provider "azapi" {}

mock_provider "azurerm" {
  mock_resource "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production"
    }
  }
  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.ManagedIdentity/userAssignedIdentities/ciri-identity"
      client_id    = "22222222-2222-2222-2222-222222222222"
      principal_id = "33333333-3333-3333-3333-333333333333"
    }
  }
  mock_resource "azurerm_container_app_environment" {
    defaults = {
      id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.App/managedEnvironments/ciri-environment"
    }
  }
  mock_resource "azurerm_postgresql_flexible_server" {
    defaults = {
      id   = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-production/providers/Microsoft.DBforPostgreSQL/flexibleServers/ciri-pg"
      fqdn = "ciri-pg.postgres.database.azure.com"
    }
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

run "telemetry_keeps_conservative_caps_and_log_only_routing" {
  command = plan

  assert {
    condition = (
      azapi_resource.observability.body.properties.workspaceCapping.dailyQuotaGb == 0.1 &&
      azapi_resource.observability.body.properties.retentionInDays == 30 &&
      azurerm_application_insights.observability.daily_data_cap_in_gb == 0.1 &&
      azurerm_application_insights.observability.retention_in_days == 30 &&
      azurerm_application_insights.observability.sampling_percentage == 100
    )
    error_message = "observability must retain 30 days, cap ingestion at 0.1 GB/day, and leave SDK sampling as the sole sampler"
  }

  assert {
    condition = (
      length(azurerm_monitor_diagnostic_setting.environment_logs.enabled_log) == 2 &&
      alltrue([
        for category in azurerm_monitor_diagnostic_setting.environment_logs.enabled_log :
        category.category == "ContainerAppConsoleLogs" || category.category == "ContainerAppSystemLogs"
      ]) &&
      length(azurerm_monitor_diagnostic_setting.environment_logs.metric) == 0
    )
    error_message = "diagnostic routing must collect only Container Apps console and system logs without metrics"
  }

  assert {
    condition = (
      azapi_resource.backend.body.properties.template.scale.minReplicas == 0 &&
      azapi_resource.backend.body.properties.template.scale.maxReplicas == 1 &&
      azapi_resource.backend.body.properties.configuration.activeRevisionsMode == "Single"
    )
    error_message = "the telemetry fixture must preserve the conservative min0/max1 Single revision API scale"
  }
}

run "native_provider_secret_reference_is_not_inline" {
  command = plan

  variables {
    provider_secret_uris = {
      GEMINI_API_KEY = "https://ciri-vault.vault.azure.net/secrets/gemini"
    }
  }

  assert {
    condition = (
      azapi_resource.backend.body.properties.configuration.secrets[0].keyVaultUrl == "https://ciri-vault.vault.azure.net/secrets/gemini" &&
      !contains(keys(azapi_resource.backend.body.properties.configuration.secrets[0]), "value")
    )
    error_message = "provider credentials must remain native Key Vault URI references and never be Terraform values"
  }
}

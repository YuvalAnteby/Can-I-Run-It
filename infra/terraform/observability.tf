resource "azapi_resource" "observability" {
  type      = "Microsoft.OperationalInsights/workspaces@2023-09-01"
  name      = "${var.container_app_name}-logs"
  parent_id = azurerm_resource_group.production.id
  location  = var.location

  schema_validation_enabled = false

  body = {
    properties = {
      sku = {
        name = "PerGB2018"
      }
      retentionInDays = var.observability_retention_days
      workspaceCapping = {
        dailyQuotaGb = var.observability_daily_cap_gb
      }
    }
  }
}

resource "azurerm_application_insights" "observability" {
  name                 = "${var.container_app_name}-insights"
  location             = var.location
  resource_group_name  = azurerm_resource_group.production.name
  application_type     = "web"
  workspace_id         = azapi_resource.observability.id
  retention_in_days    = var.observability_retention_days
  daily_data_cap_in_gb = var.observability_daily_cap_gb
  sampling_percentage  = 100
  tags                 = local.tags
}

resource "azurerm_monitor_diagnostic_setting" "environment_logs" {
  name                           = "${var.container_app_name}-observability"
  target_resource_id             = azurerm_container_app_environment.production.id
  log_analytics_workspace_id     = azapi_resource.observability.id
  log_analytics_destination_type = "Dedicated"

  enabled_log {
    category = "ContainerAppConsoleLogs"
  }

  enabled_log {
    category = "ContainerAppSystemLogs"
  }
}

mock_provider "azurerm" {}

variables {
  container_app_name           = "ciri-api"
  resource_group_name          = "ciri-rg"
  container_app_environment_id = "/subscriptions/test/resourceGroups/ciri-rg/providers/Microsoft.App/managedEnvironments/ciri"
  backend_image                = "ciri:test"
}

run "disabled_creates_no_monitoring_resources" {
  command = plan

  assert {
    condition     = length(azurerm_log_analytics_workspace.observability) == 0
    error_message = "disabled observability must not create a Log Analytics workspace"
  }

  assert {
    condition     = length(azurerm_application_insights.observability) == 0
    error_message = "disabled observability must not create Application Insights"
  }

  assert {
    condition     = length(azurerm_monitor_diagnostic_setting.observability) == 0
    error_message = "disabled observability must not create diagnostic routing"
  }
}

run "enabled_uses_conservative_caps_and_single_sampling" {
  command = plan

  variables {
    observability_enabled        = true
    observability_location       = "westeurope"
    observability_daily_cap_gb   = 0.1
    observability_retention_days = 30
    observability_sampling_ratio = 0.1
  }

  assert {
    condition = (
      azurerm_log_analytics_workspace.observability[0].sku == "PerGB2018" &&
      azurerm_log_analytics_workspace.observability[0].retention_in_days == 30 &&
      azurerm_log_analytics_workspace.observability[0].daily_quota_gb == 0.1
    )
    error_message = "observability workspace must use the bounded SKU, retention, and daily cap"
  }

  assert {
    condition = (
      azurerm_application_insights.observability[0].application_type == "web" &&
      azurerm_application_insights.observability[0].retention_in_days == 30 &&
      azurerm_application_insights.observability[0].daily_data_cap_in_gb == 0.1
    )
    error_message = "Application Insights must use the bounded retention and daily cap"
  }

  assert {
    condition = alltrue([
      for category in azurerm_monitor_diagnostic_setting.observability[0].enabled_log :
      category.category == "ContainerAppConsoleLogs" || category.category == "ContainerAppSystemLogs"
    ]) && length(azurerm_monitor_diagnostic_setting.observability[0].metric) == 0
    error_message = "diagnostic routing must collect only the two Container Apps log categories"
  }

  assert {
    condition = (
      contains(
        [for env in azurerm_container_app.backend.template[0].container[0].env : env.name],
        "TELEMETRY_ENABLED"
      ) &&
      contains(
        [for env in azurerm_container_app.backend.template[0].container[0].env : env.name],
        "APPLICATIONINSIGHTS_CONNECTION_STRING"
      ) &&
      contains(
        [for env in azurerm_container_app.backend.template[0].container[0].env : env.name],
        "OTEL_TRACES_SAMPLER_ARG"
      ) &&
      contains(
        [for env in azurerm_container_app.backend.template[0].container[0].env : env.name],
        "OTEL_TRACES_SAMPLER"
      ) &&
      alltrue([
        for env in azurerm_container_app.backend.template[0].container[0].env :
        env.name != "TELEMETRY_ENABLED" || env.value == "true"
      ]) &&
      alltrue([
        for env in azurerm_container_app.backend.template[0].container[0].env :
        env.name != "OTEL_TRACES_SAMPLER_ARG" || env.value == "0.1"
      ]) &&
      alltrue([
        for env in azurerm_container_app.backend.template[0].container[0].env :
        env.name != "OTEL_TRACES_SAMPLER" || env.value == "microsoft.fixed_percentage"
      ])
    )
    error_message = "enabled monitoring must set TELEMETRY_ENABLED=true"
  }

  assert {
    condition = (
      azurerm_application_insights.observability[0].sampling_percentage == 100 &&
      contains(
        [
          for env in azurerm_container_app.backend.template[0].container[0].env :
          try(env.secret_name, "")
          if env.name == "APPLICATIONINSIGHTS_CONNECTION_STRING"
        ],
        "applicationinsights-connection-string"
      ) &&
      alltrue([
        for env in azurerm_container_app.backend.template[0].container[0].env :
        env.name != "APPLICATIONINSIGHTS_CONNECTION_STRING" || try(env.value, null) == null
      ]) &&
      contains(
        [for secret in azurerm_container_app.backend.secret : secret.name],
        "applicationinsights-connection-string"
      )
    )
    error_message = "SDK sampling must be the sole sampling layer and the connection string must use a Container App secret"
  }

  assert {
    condition = (
      azurerm_monitor_metric_alert.replicas[0].severity == 1 &&
      azurerm_monitor_metric_alert.replicas[0].criteria[0].threshold == 1 &&
      azurerm_monitor_scheduled_query_rules_alert_v2.http_errors[0].severity == 2 &&
      azurerm_monitor_scheduled_query_rules_alert_v2.platform_health[0].severity == 2 &&
      strcontains(azurerm_monitor_scheduled_query_rules_alert_v2.http_errors[0].criteria[0].query, "Errors >= 5") &&
      strcontains(azurerm_monitor_scheduled_query_rules_alert_v2.http_errors[0].criteria[0].query, "ErrorRate >= 0.2") &&
      strcontains(azurerm_monitor_scheduled_query_rules_alert_v2.http_errors[0].criteria[0].query, "ErrorBuckets >= 2") &&
      strcontains(azurerm_monitor_scheduled_query_rules_alert_v2.platform_health[0].criteria[0].query, "TotalEvents >= 3 and Buckets >= 2") &&
      strcontains(azurerm_monitor_scheduled_query_rules_alert_v2.platform_health[0].criteria[0].query, "where Buckets >= 2")
    )
    error_message = "observability alerts must keep the documented replica and scheduled-query thresholds"
  }
}

run "enabled_rejects_reserved_runtime_keys" {
  command = plan

  variables {
    observability_enabled  = true
    observability_location = "westeurope"
    environment_variables  = { TELEMETRY_ENABLED = "false" }
  }

  expect_failures = [azurerm_container_app.backend]
}

run "enabled_rejects_case_insensitive_generated_secret_collision" {
  command = plan

  variables {
    observability_enabled  = true
    observability_location = "westeurope"
    secret_environment_variables = {
      applicationinsights_connection_string = "value"
    }
  }

  expect_failures = [azurerm_container_app.backend]
}

run "rejects_invalid_sampling_ratio" {
  command = plan

  variables {
    observability_sampling_ratio = 1.1
  }

  expect_failures = [var.observability_sampling_ratio]
}

run "rejects_non_positive_daily_cap" {
  command = plan

  variables {
    observability_daily_cap_gb = 0
  }

  expect_failures = [var.observability_daily_cap_gb]
}

run "enabled_requires_region" {
  command = plan

  variables {
    observability_enabled = true
  }

  expect_failures = [var.observability_location]
}

resource "azurerm_log_analytics_workspace" "observability" {
  count = var.observability_enabled ? 1 : 0

  name                = "${var.container_app_name}-logs"
  location            = var.observability_location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = var.observability_retention_days
  daily_quota_gb      = var.observability_daily_cap_gb
}

resource "azurerm_application_insights" "observability" {
  count = var.observability_enabled ? 1 : 0

  name                 = "${var.container_app_name}-insights"
  location             = var.observability_location
  resource_group_name  = var.resource_group_name
  application_type     = "web"
  workspace_id         = azurerm_log_analytics_workspace.observability[0].id
  retention_in_days    = var.observability_retention_days
  daily_data_cap_in_gb = var.observability_daily_cap_gb
  sampling_percentage  = 100
}

resource "azurerm_monitor_diagnostic_setting" "observability" {
  count = var.observability_enabled ? 1 : 0

  name                           = "${var.container_app_name}-observability"
  target_resource_id             = var.container_app_environment_id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.observability[0].id
  log_analytics_destination_type = "Dedicated"

  enabled_log {
    category = "ContainerAppConsoleLogs"
  }

  enabled_log {
    category = "ContainerAppSystemLogs"
  }
}

resource "azurerm_monitor_metric_alert" "replicas" {
  count = var.observability_enabled ? 1 : 0

  name                = "${var.container_app_name}-replicas"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_container_app.backend.id]
  description         = "The CIRI backend has had fewer than one replica for five minutes."
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"
  auto_mitigate       = true

  criteria {
    metric_namespace       = "Microsoft.App/containerApps"
    metric_name            = "Replicas"
    aggregation            = "Average"
    operator               = "LessThan"
    threshold              = 1
    skip_metric_validation = true
  }

  dynamic "action" {
    for_each = toset(var.observability_action_group_ids)

    content {
      action_group_id = action.value
    }
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "http_errors" {
  count = var.observability_enabled ? 1 : 0

  name                      = "${var.container_app_name}-http-errors"
  display_name              = "${var.container_app_name} HTTP 5xx errors"
  resource_group_name       = var.resource_group_name
  location                  = var.observability_location
  scopes                    = [azurerm_log_analytics_workspace.observability[0].id]
  severity                  = 2
  evaluation_frequency      = "PT5M"
  window_duration           = "PT15M"
  query_time_range_override = "PT15M"
  auto_mitigation_enabled   = true

  criteria {
    query                   = <<-KQL
      let app = "${var.container_app_name}";
      ContainerAppConsoleLogs
      | where TimeGenerated > ago(15m)
      | where ContainerAppName == app
      | extend Payload = parse_json(Log)
      | where tostring(Payload.event) == "http.request.completed"
      | where tostring(Payload.route) !in ("/api/health/live", "/api/health/ready", "/api/health/postgres")
      | summarize Count = count(), Errors = countif(toint(Payload.statusCode) between (500 .. 599)) by Bucket = bin(TimeGenerated, 5m)
      | where Count > 0
      | extend ErrorRate = todouble(Errors) / Count
      | summarize ErrorBuckets = countif(Errors >= 5 and ErrorRate >= 0.2)
      | where ErrorBuckets >= 2
      | project Count = 1
    KQL
    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0
  }

  action {
    action_groups = var.observability_action_group_ids
  }
}

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "platform_health" {
  count = var.observability_enabled ? 1 : 0

  name                      = "${var.container_app_name}-platform-health"
  display_name              = "${var.container_app_name} platform health"
  resource_group_name       = var.resource_group_name
  location                  = var.observability_location
  scopes                    = [azurerm_log_analytics_workspace.observability[0].id]
  severity                  = 2
  evaluation_frequency      = "PT5M"
  window_duration           = "PT15M"
  query_time_range_override = "PT15M"
  auto_mitigation_enabled   = true

  criteria {
    query                   = <<-KQL
      let app = "${var.container_app_name}";
      let platform = materialize(
        ContainerAppSystemLogs
        | where TimeGenerated > ago(15m)
        | where ContainerAppName == app
        | where Reason in ("Unhealthy", "ContainerCrashing", "BackOff") or Log has_any ("Unhealthy", "ContainerCrashing", "BackOff")
        | summarize Events = count() by Bucket = bin(TimeGenerated, 5m)
        | summarize TotalEvents = sum(Events), Buckets = countif(Events > 0)
        | where TotalEvents >= 3 and Buckets >= 2
        | project Count = 1
      );
      let readiness = materialize(
        ContainerAppConsoleLogs
        | where TimeGenerated > ago(15m)
        | where ContainerAppName == app
        | extend Payload = parse_json(Log)
        | where tostring(Payload.event) == "http.request.completed"
        | where tostring(Payload.route) == "/api/health/ready"
        | where toint(Payload.statusCode) >= 400 or tostring(Payload.outcome) == "aborted"
        | summarize Failures = count() by Bucket = bin(TimeGenerated, 5m)
        | summarize Buckets = countif(Failures > 0)
        | where Buckets >= 2
        | project Count = 1
      );
      union platform, readiness
      | summarize Count = max(Count)
      | where Count > 0
    KQL
    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0
  }

  action {
    action_groups = var.observability_action_group_ids
  }
}

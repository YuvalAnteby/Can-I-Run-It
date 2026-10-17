resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.name}-${local.env}"
  location            = azurerm_resource_group.prod.location
  resource_group_name = azurerm_resource_group.prod.name
  sku                 = "PerGB2018"
  retention_in_days   = var.observability_retention_days
  daily_quota_gb      = var.observability_daily_cap_gb
  tags                = local.tags
}

resource "azurerm_application_insights" "main" {
  name                 = "appi-${local.name}-${local.env}"
  location             = azurerm_resource_group.prod.location
  resource_group_name  = azurerm_resource_group.prod.name
  application_type     = "web"
  workspace_id         = azurerm_log_analytics_workspace.main.id
  retention_in_days    = var.observability_retention_days
  daily_data_cap_in_gb = var.observability_daily_cap_gb
  # The backend SDK samples (OTEL_TRACES_SAMPLER_ARG); no second layer here.
  sampling_percentage = 100
  tags                = local.tags
}

resource "azurerm_monitor_action_group" "email" {
  name                = "ag-${local.name}-${local.env}"
  resource_group_name = azurerm_resource_group.prod.name
  short_name          = "ciri-prod"
  tags                = local.tags

  email_receiver {
    name                    = "operator"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

# Metric alerts are cheap; log-based alerts are not. No replica alert: the API
# scales to zero by design.
resource "azurerm_monitor_metric_alert" "api_5xx" {
  name                = "${local.api_app_name}-5xx"
  resource_group_name = azurerm_resource_group.prod.name
  scopes              = [azurerm_container_app.api.id]
  description         = "The API returned more than 5 HTTP 5xx responses in 15 minutes."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  auto_mitigate       = true
  tags                = local.tags

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "Requests"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 5

    dimension {
      name     = "statusCodeCategory"
      operator = "Include"
      values   = ["5xx"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }
}

# Signals that the 0.25 vCPU / 0.5 GiB API needs to grow to 0.5 vCPU / 1 GiB
# (edit cpu/memory in app.tf). Separate rules so either one alerts on its own.
resource "azurerm_monitor_metric_alert" "api_capacity" {
  for_each = {
    memory = {
      metric      = "WorkingSetBytes"
      threshold   = 419430400 # 400 MiB of the 512 MiB limit
      description = "API memory averaged above 400 MiB for 15 minutes; consider 0.5 vCPU / 1 GiB."
    }
    cpu = {
      metric      = "UsageNanoCores"
      threshold   = 200000000 # 0.2 of the 0.25 vCPU limit
      description = "API CPU averaged above 0.2 vCPU for 15 minutes; consider 0.5 vCPU / 1 GiB."
    }
  }

  name                = "${local.api_app_name}-${each.key}-high"
  resource_group_name = azurerm_resource_group.prod.name
  scopes              = [azurerm_container_app.api.id]
  description         = each.value.description
  severity            = 3
  frequency           = "PT5M"
  window_size         = "PT15M"
  auto_mitigate       = true
  tags                = local.tags

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = each.value.metric
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = each.value.threshold
  }

  action {
    action_group_id = azurerm_monitor_action_group.email.id
  }
}

resource "azurerm_consumption_budget_resource_group" "prod" {
  name              = "budget-${local.name}-${local.env}"
  resource_group_id = azurerm_resource_group.prod.id
  amount            = var.monthly_budget_usd
  time_grain        = "Monthly"

  time_period {
    start_date = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
  }

  dynamic "notification" {
    for_each = {
      actual_50      = { threshold = 50, type = "Actual" }
      actual_80      = { threshold = 80, type = "Actual" }
      actual_100     = { threshold = 100, type = "Actual" }
      forecasted_100 = { threshold = 100, type = "Forecasted" }
    }

    content {
      enabled        = true
      operator       = "GreaterThanOrEqualTo"
      threshold      = notification.value.threshold
      threshold_type = notification.value.type
      contact_emails = [var.alert_email]
    }
  }

  lifecycle {
    # Azure rejects a start date change after creation.
    ignore_changes = [time_period]
  }
}

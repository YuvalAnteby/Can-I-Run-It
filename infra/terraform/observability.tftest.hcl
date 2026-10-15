mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id       = "00000000-0000-0000-0000-000000000001"
      subscription_id = "00000000-0000-0000-0000-000000000002"
      object_id       = "00000000-0000-0000-0000-000000000003"
      client_id       = "00000000-0000-0000-0000-000000000004"
    }
  }
}

mock_provider "random" {}
mock_provider "time" {}

variables {
  subscription_id    = "00000000-0000-0000-0000-000000000002"
  api_image          = "ghcr.io/yuvalanteby/can-i-run-it-backend:sha-0123456789abcdef0123456789abcdef01234567"
  gemini_api_key     = "test-gemini"
  rawg_api_key       = "test-rawg"
  operator_object_id = "00000000-0000-0000-0000-000000000003"
  operator_upn       = "operator@example.com"
  alert_email        = "alerts@example.com"
}

run "uses_conservative_caps_and_single_sampling" {
  command = plan

  assert {
    condition = (
      azurerm_log_analytics_workspace.main.sku == "PerGB2018" &&
      azurerm_log_analytics_workspace.main.retention_in_days == 30 &&
      azurerm_log_analytics_workspace.main.daily_quota_gb == 0.1
    )
    error_message = "Log Analytics must use the bounded SKU, retention, and daily cap"
  }

  assert {
    condition = (
      azurerm_application_insights.main.application_type == "web" &&
      azurerm_application_insights.main.retention_in_days == 30 &&
      azurerm_application_insights.main.daily_data_cap_in_gb == 0.1 &&
      azurerm_application_insights.main.sampling_percentage == 100
    )
    error_message = "Application Insights must be capped and leave sampling to the SDK"
  }

  assert {
    condition     = azurerm_container_app_environment.main.logs_destination == "log-analytics"
    error_message = "Container Apps environment logs must go to the capped Log Analytics workspace"
  }

  assert {
    condition = {
      for e in azurerm_container_app.api.template[0].container[0].env : e.name => e.value
      if contains(["TELEMETRY_ENABLED", "OTEL_TRACES_SAMPLER", "OTEL_TRACES_SAMPLER_ARG", "OTEL_SERVICE_NAME", "LOG_LEVEL"], e.name)
      } == {
      TELEMETRY_ENABLED       = "true"
      OTEL_TRACES_SAMPLER     = "microsoft.fixed_percentage"
      OTEL_TRACES_SAMPLER_ARG = "0.1"
      OTEL_SERVICE_NAME       = "ciri-backend"
      LOG_LEVEL               = "info"
    }
    error_message = "Telemetry must be enabled with the fixed-percentage SDK sampler"
  }
}

run "alerts_on_api_5xx_with_a_metric_alert" {
  command = plan

  assert {
    condition = (
      azurerm_monitor_metric_alert.api_5xx.criteria[0].metric_namespace == "Microsoft.App/containerApps" &&
      azurerm_monitor_metric_alert.api_5xx.criteria[0].metric_name == "Requests" &&
      azurerm_monitor_metric_alert.api_5xx.criteria[0].dimension[0].name == "statusCodeCategory" &&
      azurerm_monitor_metric_alert.api_5xx.criteria[0].dimension[0].values == tolist(["5xx"])
    )
    error_message = "The 5xx alert must use the Container App Requests metric filtered to 5xx"
  }

  assert {
    condition = (
      length(azurerm_monitor_action_group.email.email_receiver) == 1 &&
      azurerm_monitor_action_group.email.email_receiver[0].email_address == "alerts@example.com"
    )
    error_message = "Alerts must email alert_email"
  }
}

run "abuse_protection_defaults_match_env_example" {
  command = plan

  assert {
    condition = {
      for e in azurerm_container_app.api.template[0].container[0].env : e.name => e.value
      if(startswith(e.name, "EXPENSIVE_") || startswith(e.name, "GEMINI_") || startswith(e.name, "RAWG_")) && !endswith(e.name, "_API_KEY")
      } == {
      EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE = "10"
      EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE = "100"
      GEMINI_REQUESTS_PER_MINUTE           = "30"
      RAWG_REQUESTS_PER_MINUTE             = "60"
      GEMINI_MAX_CONCURRENT                = "2"
      RAWG_MAX_CONCURRENT                  = "4"
      GEMINI_TIMEOUT_MS                    = "8000"
      RAWG_TIMEOUT_MS                      = "3000"
    }
    error_message = "Abuse-protection defaults must match infra/.env.example"
  }
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

run "rejects_unsupported_retention" {
  command = plan

  variables {
    observability_retention_days = 31
  }

  expect_failures = [var.observability_retention_days]
}

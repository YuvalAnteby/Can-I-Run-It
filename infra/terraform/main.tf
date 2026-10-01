terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 4.25.0"
    }
  }
}

provider "azurerm" {
  features {}
}

locals {
  fixed_environment_keys = toset(["NODE_ENV", "PORT"])
  observability_environment_keys = toset([
    "TELEMETRY_ENABLED",
    "LOG_LEVEL",
    "OTEL_SERVICE_NAME",
    "OTEL_TRACES_SAMPLER",
    "OTEL_TRACES_SAMPLER_ARG",
    "APPLICATIONINSIGHTS_CONNECTION_STRING",
  ])
  fixed_environment_conflicts = setunion(
    setintersection(toset(keys(var.environment_variables)), local.fixed_environment_keys),
    setintersection(toset(keys(var.secret_environment_variables)), local.fixed_environment_keys),
  )
  duplicate_environment_keys = setintersection(
    toset(keys(var.environment_variables)),
    toset(keys(var.secret_environment_variables)),
  )
  observability_environment_conflicts = setunion(
    setintersection(toset(keys(var.environment_variables)), local.observability_environment_keys),
    setintersection(toset(keys(var.secret_environment_variables)), local.observability_environment_keys),
  )
  secret_environment_keys = nonsensitive(keys(var.secret_environment_variables))
  secret_environment_names = {
    for key in local.secret_environment_keys : key => replace(lower(key), "_", "-")
  }
  all_secret_names = concat(
    values(local.secret_environment_names),
    var.observability_enabled ? ["applicationinsights-connection-string"] : [],
  )
  observability_secret_name_conflict = contains(
    toset(values(local.secret_environment_names)),
    "applicationinsights-connection-string",
  )
}

resource "azurerm_container_app" "backend" {
  name                         = var.container_app_name
  resource_group_name          = var.resource_group_name
  container_app_environment_id = var.container_app_environment_id
  revision_mode                = "Single"

  lifecycle {
    precondition {
      condition     = length(local.fixed_environment_conflicts) == 0
      error_message = "environment_variables and secret_environment_variables cannot contain NODE_ENV or PORT."
    }
    precondition {
      condition     = length(local.duplicate_environment_keys) == 0
      error_message = "An environment key cannot be present in both environment_variables and secret_environment_variables."
    }
    precondition {
      condition     = !var.observability_enabled || length(local.observability_environment_conflicts) == 0
      error_message = "environment_variables and secret_environment_variables cannot contain reserved observability keys when observability_enabled is true."
    }
    precondition {
      condition     = !var.observability_enabled || !local.observability_secret_name_conflict
      error_message = "secret_environment_variables cannot reserve applicationinsights-connection-string when observability_enabled is true."
    }
    precondition {
      condition = length(local.all_secret_names) == length(distinct(local.all_secret_names)) && alltrue([
        for name in local.all_secret_names : length(name) <= 64 && can(regex("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$", name))
      ])
      error_message = "Secret environment keys and the generated observability secret must produce unique valid Azure Container App secret names of at most 64 characters."
    }
  }

  dynamic "secret" {
    for_each = local.secret_environment_names

    content {
      name  = secret.value
      value = var.secret_environment_variables[secret.key]
    }
  }

  dynamic "secret" {
    for_each = var.observability_enabled ? { APPLICATIONINSIGHTS_CONNECTION_STRING = true } : {}

    content {
      name  = "applicationinsights-connection-string"
      value = azurerm_application_insights.observability[0].connection_string
    }
  }

  ingress {
    external_enabled = true
    target_port      = var.backend_port
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "backend"
      image  = var.backend_image
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PORT"
        value = tostring(var.backend_port)
      }

      dynamic "env" {
        for_each = var.environment_variables

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.secret_environment_names

        content {
          name        = env.key
          secret_name = env.value
        }
      }

      dynamic "env" {
        for_each = var.observability_enabled ? {
          TELEMETRY_ENABLED       = "true"
          LOG_LEVEL               = "info"
          OTEL_SERVICE_NAME       = "ciri-backend"
          OTEL_TRACES_SAMPLER     = "microsoft.fixed_percentage"
          OTEL_TRACES_SAMPLER_ARG = tostring(var.observability_sampling_ratio)
        } : {}

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.observability_enabled ? { APPLICATIONINSIGHTS_CONNECTION_STRING = true } : {}

        content {
          name        = env.key
          secret_name = "applicationinsights-connection-string"
        }
      }

      startup_probe {
        transport               = "HTTP"
        port                    = var.backend_port
        path                    = "/api/health/live"
        initial_delay           = 10
        interval_seconds        = 10
        failure_count_threshold = 30
        timeout                 = 2
      }

      liveness_probe {
        transport               = "HTTP"
        port                    = var.backend_port
        path                    = "/api/health/live"
        initial_delay           = 10
        interval_seconds        = 10
        failure_count_threshold = 3
        timeout                 = 2
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = var.backend_port
        path                    = "/api/health/ready"
        interval_seconds        = 5
        failure_count_threshold = 1
        success_count_threshold = 1
        timeout                 = 2
      }
    }
  }
}

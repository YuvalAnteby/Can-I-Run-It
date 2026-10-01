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
  fixed_environment_conflicts = setunion(
    setintersection(toset(keys(var.environment_variables)), local.fixed_environment_keys),
    setintersection(toset(keys(var.secret_environment_variables)), local.fixed_environment_keys),
  )
  duplicate_environment_keys = setintersection(
    toset(keys(var.environment_variables)),
    toset(keys(var.secret_environment_variables)),
  )
  secret_environment_keys = nonsensitive(keys(var.secret_environment_variables))
  secret_environment_names = {
    for key in local.secret_environment_keys : key => replace(lower(key), "_", "-")
  }
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
      condition = length(local.secret_environment_names) == length(distinct(values(local.secret_environment_names))) && alltrue([
        for name in values(local.secret_environment_names) : length(name) <= 64 && can(regex("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$", name))
      ])
      error_message = "Secret environment keys must produce unique valid Azure Container App secret names of at most 64 characters."
    }
  }

  dynamic "secret" {
    for_each = local.secret_environment_names

    content {
      name  = secret.value
      value = var.secret_environment_variables[secret.key]
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

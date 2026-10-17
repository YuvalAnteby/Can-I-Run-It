resource "azurerm_container_app_environment" "main" {
  name                               = "cae-${local.name}-${local.env}"
  location                           = azurerm_resource_group.prod.location
  resource_group_name                = azurerm_resource_group.prod.name
  infrastructure_subnet_id           = azurerm_subnet.aca.id
  infrastructure_resource_group_name = "ME_cae-${local.name}-${local.env}"
  internal_load_balancer_enabled     = false
  logs_destination                   = "log-analytics"
  log_analytics_workspace_id         = azurerm_log_analytics_workspace.main.id
  tags                               = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

locals {
  api_env = merge(
    {
      NODE_ENV    = "production"
      PORT        = tostring(local.api_port)
      TRUST_PROXY = "1"

      POSTGRES_HOST      = azurerm_postgresql_flexible_server.main.fqdn
      POSTGRES_PORT      = "5432"
      POSTGRES_DB        = local.postgres_db_name
      POSTGRES_USER      = azurerm_user_assigned_identity.api.name
      POSTGRES_AUTH_MODE = "entra"
      POSTGRES_SSL       = "verify-full"
      AZURE_CLIENT_ID    = azurerm_user_assigned_identity.api.client_id

      REACT_URL = trimsuffix(var.frontend_url, "/")

      TELEMETRY_ENABLED       = "true"
      LOG_LEVEL               = "info"
      OTEL_SERVICE_NAME       = "ciri-backend"
      OTEL_TRACES_SAMPLER     = "microsoft.fixed_percentage"
      OTEL_TRACES_SAMPLER_ARG = tostring(var.observability_sampling_ratio)
    },
    {
      EXPENSIVE_REQUESTS_PER_IP_PER_MINUTE = tostring(var.abuse_protection.expensive_requests_per_ip_per_minute)
      EXPENSIVE_REQUESTS_GLOBAL_PER_MINUTE = tostring(var.abuse_protection.expensive_requests_global_per_minute)
      GEMINI_REQUESTS_PER_MINUTE           = tostring(var.abuse_protection.gemini_requests_per_minute)
      RAWG_REQUESTS_PER_MINUTE             = tostring(var.abuse_protection.rawg_requests_per_minute)
      GEMINI_MAX_CONCURRENT                = tostring(var.abuse_protection.gemini_max_concurrent)
      RAWG_MAX_CONCURRENT                  = tostring(var.abuse_protection.rawg_max_concurrent)
      GEMINI_TIMEOUT_MS                    = tostring(var.abuse_protection.gemini_timeout_ms)
      RAWG_TIMEOUT_MS                      = tostring(var.abuse_protection.rawg_timeout_ms)
    },
  )
}

resource "azurerm_container_app" "api" {
  name                         = local.api_app_name
  resource_group_name          = azurerm_resource_group.prod.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  revision_mode                = "Single"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  dynamic "secret" {
    for_each = local.key_vault_secret_env

    content {
      name                = secret.key
      key_vault_secret_id = azurerm_key_vault_secret.app[secret.key].versionless_id
      identity            = azurerm_user_assigned_identity.api.id
    }
  }

  ingress {
    external_enabled           = true
    target_port                = local.api_port
    transport                  = "auto"
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.api_min_replicas
    max_replicas = 1

    # Keeps one warm replica 07:30-23:00 Israel time every day so visitors skip
    # the cold start; outside the window the API scales to zero.
    custom_scale_rule {
      name             = "warm-hours"
      custom_rule_type = "cron"
      metadata = {
        timezone        = "Asia/Jerusalem"
        start           = "30 7 * * *"
        end             = "0 23 * * *"
        desiredReplicas = "1"
      }
    }

    # A custom rule replaces the default HTTP rule; without this the API could
    # not wake from zero outside the warm window.
    http_scale_rule {
      name                = "http"
      concurrent_requests = "10"
    }

    container {
      name   = "api"
      image  = var.api_image
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = local.api_env

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.key_vault_secret_env

        content {
          name        = env.value
          secret_name = env.key
        }
      }

      # Probed early and often so a cold start is routed as soon as it is up;
      # still allows ~53 s (scale from zero + migrations check).
      startup_probe {
        transport               = "HTTP"
        port                    = local.api_port
        path                    = "/api/health/live"
        initial_delay           = 3
        interval_seconds        = 5
        timeout                 = 3
        failure_count_threshold = 10
      }

      liveness_probe {
        transport               = "HTTP"
        port                    = local.api_port
        path                    = "/api/health/live"
        initial_delay           = 10
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 3
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = local.api_port
        path                    = "/api/health/ready"
        interval_seconds        = 5
        timeout                 = 3
        failure_count_threshold = 3
        success_count_threshold = 1
      }
    }
  }

  lifecycle {
    # CI owns the image after the first apply.
    ignore_changes = [template[0].container[0].image]
  }

  # The first revision runs migrations, so the database, pg_trgm allowlist and
  # the API's Entra admin role must exist before it starts.
  depends_on = [
    time_sleep.rbac,
    azurerm_postgresql_flexible_server_configuration.extensions,
    azurerm_postgresql_flexible_server_database.ciri,
    azurerm_postgresql_flexible_server_active_directory_administrator.api,
  ]
}

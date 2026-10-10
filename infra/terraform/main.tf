terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "= 2.2.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 4.25.0"
    }
  }
}

moved {
  from = azurerm_application_insights.observability[0]
  to   = azurerm_application_insights.observability
}

moved {
  from = azurerm_monitor_diagnostic_setting.observability[0]
  to   = azurerm_monitor_diagnostic_setting.environment_logs
}

provider "azurerm" {
  features {}

  resource_provider_registrations = "none"
  subscription_id                 = var.subscription_id
}

provider "azapi" {
  skip_provider_registration = true
  subscription_id            = var.subscription_id
}

locals {
  tags = merge({
    environment = var.environment
    owner       = var.owner
    project     = var.project
    managed_by  = "terraform"
  }, var.tags)

  static_web_app_origin = "https://${azapi_resource.frontend.output.properties.defaultHostname}"
  backend_url           = "https://${var.container_app_name}.${azurerm_container_app_environment.production.default_domain}"

  provider_secret_names = {
    for key in keys(var.provider_secret_uris) : key => replace(lower(key), "_", "-")
  }

  observability_secret = {
    name  = "applicationinsights-connection-string"
    value = azurerm_application_insights.observability.connection_string
  }

  backend_environment = merge({
    NODE_ENV                = "production"
    PORT                    = tostring(var.backend_port)
    POSTGRES_HOST           = azurerm_postgresql_flexible_server.database.fqdn
    POSTGRES_PORT           = "5432"
    POSTGRES_DB             = var.postgres_database_name
    POSTGRES_USER           = "ciri-runtime"
    POSTGRES_AUTH_MODE      = "entra"
    POSTGRES_SSL_MODE       = "verify-full"
    POSTGRES_POOL_MAX       = tostring(var.backend_pool_max)
    AZURE_CLIENT_ID         = azurerm_user_assigned_identity.backend.client_id
    REACT_URL               = local.static_web_app_origin
    TELEMETRY_ENABLED       = "true"
    LOG_LEVEL               = "info"
    OTEL_SERVICE_NAME       = "ciri-backend"
    OTEL_TRACES_SAMPLER     = "microsoft.fixed_percentage"
    OTEL_TRACES_SAMPLER_ARG = tostring(var.observability_sampling_ratio)
  }, var.environment_variables)

  backend_env = [
    for key, value in local.backend_environment : {
      name  = key
      value = value
    }
  ]

  backend_secret_refs = concat(
    [
      for key, name in local.provider_secret_names : {
        name      = key
        secretRef = name
      }
    ],
    [local.observability_secret_ref],
  )

  observability_secret_ref = {
    name      = "APPLICATIONINSIGHTS_CONNECTION_STRING"
    secretRef = local.observability_secret.name
  }

  base_control_environment = {
    POSTGRES_SERVER_RESOURCE_ID  = azurerm_postgresql_flexible_server.database.id
    AZURE_STORAGE_ACCOUNT        = var.export_storage_account_name
    AZURE_CONTROL_CONTAINER      = var.control_container_name
    AZURE_EXPORTS_CONTAINER      = var.exports_container_name
    AZURE_SUBSCRIPTION_ID        = var.subscription_id
    CREDIT_PERIOD_START          = var.credit_period_start
    CREDIT_PERIOD_END            = var.credit_period_end
    CREDIT_CURRENCY              = var.credit_currency
    TOOLS_IMAGE_DIGEST           = var.tools_image
    VERIFIED_CREDIT_COST_MAPPING = tostring(var.credit_cost_mapping_verified)
  }

  backend_resource_id = "${azurerm_resource_group.production.id}/providers/Microsoft.App/containerApps/${var.container_app_name}"
  maintenance_resource_ids = {
    for name in keys(local.maintenance_commands) : name => "${azurerm_resource_group.production.id}/providers/Microsoft.App/jobs/${var.name_prefix}-${name}"
  }

  control_environment = merge(local.base_control_environment, {
    FIREWALL_SOURCE_RESOURCE_IDS = jsonencode([
      local.backend_resource_id,
      local.maintenance_resource_ids["migration"],
      local.maintenance_resource_ids["export"],
    ])
    FIREWALL_JOB_RESOURCE_ID = local.maintenance_resource_ids["firewall"]
    EXPORT_JOB_RESOURCE_ID   = local.maintenance_resource_ids["export"]
  })

  db_environment = {
    POSTGRES_HOST      = azurerm_postgresql_flexible_server.database.fqdn
    POSTGRES_PORT      = "5432"
    POSTGRES_DB        = var.postgres_database_name
    POSTGRES_AUTH_MODE = "entra"
    POSTGRES_SSL_MODE  = "verify-full"
  }

  maintenance_environment = {
    migration = merge(local.db_environment, {
      POSTGRES_USER      = "ciri-migrator"
      POSTGRES_POOL_MAX  = "1"
      AZURE_CLIENT_ID    = azurerm_user_assigned_identity.maintenance["migration"].client_id
      TOOLS_IMAGE_DIGEST = var.tools_image
    })
    export = merge(local.db_environment, {
      POSTGRES_USER           = "ciri-exporter"
      POSTGRES_POOL_MAX       = "1"
      AZURE_CLIENT_ID         = azurerm_user_assigned_identity.maintenance["export"].client_id
      AZURE_STORAGE_ACCOUNT   = var.export_storage_account_name
      AZURE_EXPORTS_CONTAINER = var.exports_container_name
      TOOLS_IMAGE_DIGEST      = var.tools_image
    })
    firewall = {
      FIREWALL_SOURCE_RESOURCE_IDS = jsonencode([
        local.backend_resource_id,
        local.maintenance_resource_ids["migration"],
        local.maintenance_resource_ids["export"],
      ])
      POSTGRES_SERVER_RESOURCE_ID = local.base_control_environment.POSTGRES_SERVER_RESOURCE_ID
      AZURE_STORAGE_ACCOUNT       = local.base_control_environment.AZURE_STORAGE_ACCOUNT
      AZURE_CONTROL_CONTAINER     = local.base_control_environment.AZURE_CONTROL_CONTAINER
      AZURE_SUBSCRIPTION_ID       = local.base_control_environment.AZURE_SUBSCRIPTION_ID
      AZURE_CLIENT_ID             = azurerm_user_assigned_identity.maintenance["firewall"].client_id
    }
    "export-check" = {
      AZURE_STORAGE_ACCOUNT        = local.base_control_environment.AZURE_STORAGE_ACCOUNT
      AZURE_CONTROL_CONTAINER      = local.base_control_environment.AZURE_CONTROL_CONTAINER
      AZURE_EXPORTS_CONTAINER      = local.base_control_environment.AZURE_EXPORTS_CONTAINER
      FIREWALL_JOB_RESOURCE_ID     = local.maintenance_resource_ids["firewall"]
      EXPORT_JOB_RESOURCE_ID       = local.maintenance_resource_ids["export"]
      AZURE_SUBSCRIPTION_ID        = local.base_control_environment.AZURE_SUBSCRIPTION_ID
      CREDIT_PERIOD_START          = local.base_control_environment.CREDIT_PERIOD_START
      CREDIT_PERIOD_END            = local.base_control_environment.CREDIT_PERIOD_END
      CREDIT_CURRENCY              = local.base_control_environment.CREDIT_CURRENCY
      TOOLS_IMAGE_DIGEST           = local.base_control_environment.TOOLS_IMAGE_DIGEST
      VERIFIED_CREDIT_COST_MAPPING = local.base_control_environment.VERIFIED_CREDIT_COST_MAPPING
      AZURE_CLIENT_ID              = azurerm_user_assigned_identity.maintenance["export-check"].client_id
    }
  }

  maintenance_commands = {
    migration      = ["node", "dist/database/maintenance.js", "migrate"]
    export         = ["node", "dist/maintenance/export.js"]
    firewall       = ["node", "dist/maintenance/firewall.js"]
    "export-check" = ["node", "dist/maintenance/export-check.js"]
  }

  maintenance_resources = {
    migration      = { timeout = 600, cpu = 0.5, memory = "1Gi" }
    export         = { timeout = 600, cpu = 0.5, memory = "1Gi" }
    firewall       = { timeout = 60, cpu = 0.25, memory = "0.5Gi" }
    "export-check" = { timeout = 60, cpu = 0.25, memory = "0.5Gi" }
  }

  maintenance_trigger = {
    for name in keys(local.maintenance_commands) : name => (
      var.maintenance_schedules_enabled && name == "firewall" ? {
        triggerType         = "Schedule"
        manualTriggerConfig = null
        scheduleTriggerConfig = {
          cronExpression         = "0 * * * *"
          parallelism            = 1
          replicaCompletionCount = 1
        }
        } : var.maintenance_schedules_enabled && name == "export-check" ? {
        triggerType         = "Schedule"
        manualTriggerConfig = null
        scheduleTriggerConfig = {
          cronExpression         = "0 2 * * *"
          parallelism            = 1
          replicaCompletionCount = 1
        }
        } : {
        triggerType = "Manual"
        manualTriggerConfig = {
          parallelism            = 1
          replicaCompletionCount = 1
        }
        scheduleTriggerConfig = null
      }
    )
  }

  reserved_backend_keys = setunion(
    toset([
      "NODE_ENV", "PORT", "POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB",
      "POSTGRES_USER", "POSTGRES_AUTH_MODE", "POSTGRES_SSL_MODE", "POSTGRES_POOL_MAX",
      "AZURE_CLIENT_ID", "REACT_URL", "TELEMETRY_ENABLED", "LOG_LEVEL",
      "OTEL_SERVICE_NAME", "OTEL_TRACES_SAMPLER", "OTEL_TRACES_SAMPLER_ARG",
      "APPLICATIONINSIGHTS_CONNECTION_STRING", "GEMINI_API_KEY", "RAWG_API_KEY",
      "POSTGRES_PASSWORD",
    ]),
    toset(keys(var.provider_secret_uris)),
  )
}

resource "azurerm_resource_group" "production" {
  name     = var.resource_group_name
  location = var.location
  tags     = local.tags

  lifecycle {
    precondition {
      condition     = var.entitlement_verified
      error_message = "Set entitlement_verified=true only after the subscription, region, SKU quota, and credit worksheet gates are verified."
    }
  }
}

resource "azurerm_container_app_environment" "production" {
  name                       = var.container_app_environment_name
  location                   = var.location
  resource_group_name        = azurerm_resource_group.production.name
  log_analytics_workspace_id = null
  logs_destination           = "azure-monitor"
  tags                       = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

resource "azapi_resource" "backend" {
  type      = "Microsoft.App/containerApps@2025-01-01"
  name      = var.container_app_name
  parent_id = azurerm_resource_group.production.id
  location  = var.location

  schema_validation_enabled = false
  response_export_values    = ["properties.configuration.ingress.fqdn", "properties.outboundIpAddresses"]

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.backend.id]
  }

  body = {
    tags = local.tags
    properties = {
      managedEnvironmentId = azurerm_container_app_environment.production.id
      workloadProfileName  = "Consumption"
      configuration = {
        activeRevisionsMode = "Single"
        ingress = {
          external      = true
          targetPort    = var.backend_port
          transport     = "Auto"
          allowInsecure = false
          traffic = [{
            latestRevision = true
            weight         = 100
          }]
        }
        secrets = concat(
          [
            for key, uri in var.provider_secret_uris : {
              name        = local.provider_secret_names[key]
              keyVaultUrl = uri
              identity    = azurerm_user_assigned_identity.backend.id
            }
          ],
          [local.observability_secret],
        )
      }
      template = {
        scale = {
          minReplicas = 0
          maxReplicas = 1
        }
        containers = [{
          name  = "backend"
          image = var.backend_image
          resources = {
            cpu    = 0.5
            memory = "1Gi"
          }
          env = concat(local.backend_env, local.backend_secret_refs)
          probes = [
            {
              type                = "Startup"
              httpGet             = { path = "/api/health/live", port = var.backend_port }
              periodSeconds       = 10
              failureThreshold    = 30
              initialDelaySeconds = 10
              timeoutSeconds      = 2
            },
            {
              type                = "Liveness"
              httpGet             = { path = "/api/health/live", port = var.backend_port }
              periodSeconds       = 10
              failureThreshold    = 3
              initialDelaySeconds = 10
              timeoutSeconds      = 2
            },
            {
              type             = "Readiness"
              httpGet          = { path = "/api/health/ready", port = var.backend_port }
              periodSeconds    = 5
              failureThreshold = 1
              successThreshold = 1
              timeoutSeconds   = 2
            },
          ]
        }]
      }
    }
  }

  lifecycle {
    ignore_changes = [body.properties.template.containers[0].image]

    precondition {
      condition = length(setintersection(
        toset(keys(var.environment_variables)),
        local.reserved_backend_keys,
      )) == 0
      error_message = "environment_variables cannot override reserved production API settings or provider secret environment names."
    }
  }
}

resource "azapi_resource" "frontend" {
  type      = "Microsoft.Web/staticSites@2022-09-01"
  name      = var.static_web_app_name
  parent_id = azurerm_resource_group.production.id
  location  = var.location

  schema_validation_enabled = false
  response_export_values    = ["properties.defaultHostname"]

  body = {
    sku = {
      name = "Free"
      tier = "Free"
    }
    properties = {
      allowConfigFileUpdates = false
      publicNetworkAccess    = "Enabled"
    }
  }
}

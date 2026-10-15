# Guardrails from docs/superpowers/specs/2026-10-15-azure-lean-infra-design.md.
# Everything runs against mock providers; no Azure credentials are used.

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

run "postgres_is_private_and_entra_only" {
  command = plan

  assert {
    condition     = azurerm_postgresql_flexible_server.main.public_network_access_enabled == false
    error_message = "Postgres must not have a public endpoint"
  }

  assert {
    condition = (
      azurerm_postgresql_flexible_server.main.authentication[0].password_auth_enabled == false &&
      azurerm_postgresql_flexible_server.main.authentication[0].active_directory_auth_enabled == true
    )
    error_message = "Postgres must use Entra auth only"
  }

  assert {
    condition = (
      azurerm_postgresql_flexible_server.main.sku_name == "B_Standard_B1ms" &&
      azurerm_postgresql_flexible_server.main.storage_mb == 32768 &&
      azurerm_postgresql_flexible_server.main.version == "16" &&
      length(azurerm_postgresql_flexible_server.main.high_availability) == 0 &&
      azurerm_postgresql_flexible_server.main.geo_redundant_backup_enabled == false
    )
    error_message = "Postgres must stay on the free-tier shape (B1ms, 32 GiB, PG16, no HA, no geo backup)"
  }

  assert {
    condition     = azurerm_postgresql_flexible_server_configuration.extensions.value == "PG_TRGM"
    error_message = "pg_trgm must be allow-listed for the schema"
  }
}

run "api_scales_zero_to_one" {
  command = plan

  assert {
    condition = (
      azurerm_container_app.api.template[0].min_replicas == 0 &&
      azurerm_container_app.api.template[0].max_replicas == 1
    )
    error_message = "API must scale between 0 and 1 replicas"
  }

  assert {
    condition = (
      azurerm_container_app.api.template[0].container[0].cpu == 0.5 &&
      azurerm_container_app.api.template[0].container[0].memory == "1Gi" &&
      azurerm_container_app.api.ingress[0].external_enabled == true &&
      azurerm_container_app.api.ingress[0].target_port == 4000
    )
    error_message = "API must run 0.5 vCPU / 1 GiB with external ingress on port 4000"
  }
}

run "probes_within_platform_limits" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for c in azurerm_container_app.api.template[0].container : [
        for p in concat(c.startup_probe, c.liveness_probe, c.readiness_probe) :
        p.failure_count_threshold <= 10
      ]
    ]))
    error_message = "Every probe failure_count_threshold must be <= 10"
  }

  assert {
    condition = (
      length(azurerm_container_app.api.template[0].container[0].startup_probe) == 1 &&
      length(azurerm_container_app.api.template[0].container[0].liveness_probe) == 1 &&
      azurerm_container_app.api.template[0].container[0].readiness_probe[0].path == "/api/health/ready" &&
      azurerm_container_app.api.template[0].container[0].startup_probe[0].path == "/api/health/live" &&
      azurerm_container_app.api.template[0].container[0].liveness_probe[0].path == "/api/health/live"
    )
    error_message = "Probes must target /api/health/live (startup, liveness) and /api/health/ready (readiness)"
  }
}

run "api_environment_contract" {
  command = plan

  assert {
    condition = {
      for e in azurerm_container_app.api.template[0].container[0].env : e.name => e.value
      if contains(["TRUST_PROXY", "NODE_ENV", "PORT", "POSTGRES_AUTH_MODE", "POSTGRES_SSL", "POSTGRES_DB", "POSTGRES_PORT", "POSTGRES_USER"], e.name)
      } == {
      TRUST_PROXY        = "1"
      NODE_ENV           = "production"
      PORT               = "4000"
      POSTGRES_AUTH_MODE = "entra"
      POSTGRES_SSL       = "verify-full"
      POSTGRES_DB        = "ciri"
      POSTGRES_PORT      = "5432"
      POSTGRES_USER      = "id-ciri-api"
    }
    error_message = "API environment must match the spec (TRUST_PROXY=1, Entra + verify-full Postgres as id-ciri-api)"
  }

  assert {
    condition = (
      azurerm_postgresql_flexible_server_active_directory_administrator.api.principal_name == "id-ciri-api" &&
      azurerm_postgresql_flexible_server_active_directory_administrator.api.principal_type == "ServicePrincipal" &&
      azurerm_postgresql_flexible_server_active_directory_administrator.operator.principal_type == "User"
    )
    error_message = "The API's Postgres Entra admin name must equal POSTGRES_USER"
  }

  assert {
    condition = {
      for e in azurerm_container_app.api.template[0].container[0].env : e.name => e.secret_name
      if contains(["GEMINI_API_KEY", "RAWG_API_KEY", "APPLICATIONINSIGHTS_CONNECTION_STRING"], e.name)
      } == {
      GEMINI_API_KEY                        = "gemini-api-key"
      RAWG_API_KEY                          = "rawg-api-key"
      APPLICATIONINSIGHTS_CONNECTION_STRING = "applicationinsights-connection-string"
    }
    error_message = "Provider keys and the App Insights connection string must come from Container App secrets"
  }

  assert {
    condition     = length([for e in azurerm_container_app.api.template[0].container[0].env : e.name if e.name == "POSTGRES_PASSWORD"]) == 0
    error_message = "No database password may be configured"
  }

  assert {
    condition = alltrue([
      for s in azurerm_container_app.api.secret : s.value == null
    ])
    error_message = "Container App secrets must be Key Vault references, not inline values"
  }
}

run "no_costly_network_resources" {
  command = plan

  assert {
    condition = alltrue([
      for f in fileset(path.module, "*.tf") :
      !can(regex("resource\\s+\"azurerm_(nat_gateway|cdn_frontdoor_[a-z_]+|frontdoor[a-z_]*|private_endpoint)\"", file("${path.module}/${f}")))
    ])
    error_message = "NAT gateways, Front Door and private endpoints are out of budget"
  }

  assert {
    condition = alltrue([
      for wp in azurerm_container_app_environment.main.workload_profile : wp.workload_profile_type == "Consumption"
    ])
    error_message = "Only the Consumption workload profile is allowed"
  }

  assert {
    condition     = azurerm_subnet.aca.default_outbound_access_enabled == true
    error_message = "snet-aca needs default outbound access for Gemini/RAWG egress"
  }
}

run "budget_present" {
  command = plan

  assert {
    condition = (
      azurerm_consumption_budget_resource_group.prod.amount == 8 &&
      length(azurerm_consumption_budget_resource_group.prod.notification) == 4 &&
      length([for n in azurerm_consumption_budget_resource_group.prod.notification : n if n.threshold_type == "Forecasted" && n.threshold == 100]) == 1
    )
    error_message = "An $8 budget with 50/80/100% actual and 100% forecast notifications must exist"
  }
}

run "key_vault_purge_protection_off" {
  command = plan

  assert {
    condition = (
      azurerm_key_vault.main.purge_protection_enabled == false &&
      azurerm_key_vault.main.soft_delete_retention_days == 7 &&
      azurerm_key_vault.main.rbac_authorization_enabled == true
    )
    error_message = "Key Vault must use RBAC, 7-day soft delete and no purge protection"
  }
}

run "deploy_identity_trusts_production_environment_only" {
  command = plan

  assert {
    condition = (
      azurerm_federated_identity_credential.deploy_github.subject == "repo:YuvalAnteby/Can-I-Run-It:environment:production" &&
      azurerm_federated_identity_credential.deploy_github.issuer == "https://token.actions.githubusercontent.com" &&
      azurerm_federated_identity_credential.deploy_github.audience == tolist(["api://AzureADTokenExchange"])
    )
    error_message = "The deploy identity must trust only the GitHub production environment"
  }
}

run "rejects_mutable_image_tag" {
  command = plan

  variables {
    api_image = "ghcr.io/yuvalanteby/can-i-run-it-backend:latest"
  }

  expect_failures = [var.api_image]
}

run "accepts_digest_image" {
  command = plan

  variables {
    api_image = "ghcr.io/yuvalanteby/can-i-run-it-backend@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}

run "rejects_min_replicas_above_one" {
  command = plan

  variables {
    api_min_replicas = 2
  }

  expect_failures = [var.api_min_replicas]
}

run "rejects_budget_above_ceiling" {
  command = plan

  variables {
    monthly_budget_usd = 11
  }

  expect_failures = [var.monthly_budget_usd]
}

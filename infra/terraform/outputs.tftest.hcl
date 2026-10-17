# Apply against mocks so computed values (web endpoint, FQDNs) are known.
# The provider still validates IDs passed between resources, so every
# referenced resource type gets a well-formed mock ID. Terraform 1.9 compatible
# (no override_during).

mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id       = "00000000-0000-0000-0000-000000000001"
      subscription_id = "00000000-0000-0000-0000-000000000002"
      object_id       = "00000000-0000-0000-0000-000000000003"
      client_id       = "00000000-0000-0000-0000-000000000004"
    }
  }

  mock_resource "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod"
    }
  }

  mock_resource "azurerm_virtual_network" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.Network/virtualNetworks/vnet-ciri-prod"
    }
  }

  mock_resource "azurerm_subnet" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.Network/virtualNetworks/vnet-ciri-prod/subnets/snet"
    }
  }

  mock_resource "azurerm_private_dns_zone" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.Network/privateDnsZones/ciri-prod.private.postgres.database.azure.com"
    }
  }

  mock_resource "azurerm_log_analytics_workspace" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.OperationalInsights/workspaces/log-ciri-prod"
    }
  }

  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-ciri"
      principal_id = "00000000-0000-0000-0000-000000000010"
      client_id    = "00000000-0000-0000-0000-000000000011"
      tenant_id    = "00000000-0000-0000-0000-000000000001"
    }
  }

  mock_resource "azurerm_key_vault" {
    defaults = {
      id        = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.KeyVault/vaults/kv-ciri-abc123"
      vault_uri = "https://kv-ciri-abc123.vault.azure.net/"
    }
  }

  mock_resource "azurerm_key_vault_secret" {
    defaults = {
      id                      = "https://kv-ciri-abc123.vault.azure.net/secrets/secret/00000000000000000000000000000000"
      versionless_id          = "https://kv-ciri-abc123.vault.azure.net/secrets/secret"
      resource_id             = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.KeyVault/vaults/kv-ciri-abc123/secrets/secret/versions/00000000000000000000000000000000"
      resource_versionless_id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.KeyVault/vaults/kv-ciri-abc123/secrets/secret"
    }
  }

  mock_resource "azurerm_postgresql_flexible_server" {
    defaults = {
      id   = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.DBforPostgreSQL/flexibleServers/psql-ciri-prod-abc123"
      fqdn = "psql-ciri-prod-abc123.postgres.database.azure.com"
    }
  }

  mock_resource "azurerm_container_app_environment" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.App/managedEnvironments/cae-ciri-prod"
    }
  }

  mock_resource "azurerm_container_app" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.App/containerApps/ca-ciri-api"
      ingress = {
        fqdn = "ca-ciri-api.example.polandcentral.azurecontainerapps.io"
      }
    }
  }

  mock_resource "azurerm_monitor_action_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/rg-ciri-prod/providers/Microsoft.Insights/actionGroups/ag-ciri-prod"
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

run "react_url_and_outputs_match_contract" {
  command = apply

  assert {
    condition = one([
      for e in azurerm_container_app.api.template[0].container[0].env : e.value if e.name == "REACT_URL"
    ]) == "https://can-i-run-it.pages.dev"
    error_message = "REACT_URL must be the frontend origin without a trailing slash"
  }

  assert {
    condition = (
      output.frontend_url == "https://can-i-run-it.pages.dev" &&
      output.api_url == "https://ca-ciri-api.example.polandcentral.azurecontainerapps.io" &&
      output.api_container_app_name == "ca-ciri-api" &&
      output.resource_group_name == "rg-ciri-prod" &&
      output.deploy_client_id == "00000000-0000-0000-0000-000000000011" &&
      output.tenant_id == "00000000-0000-0000-0000-000000000001" &&
      output.subscription_id == "00000000-0000-0000-0000-000000000002" &&
      output.postgres_fqdn == "psql-ciri-prod-abc123.postgres.database.azure.com"
    )
    error_message = "Outputs must match the workstream 3 contract"
  }

  assert {
    condition = one([
      for e in azurerm_container_app.api.template[0].container[0].env : e.value if e.name == "POSTGRES_HOST"
    ]) == "psql-ciri-prod-abc123.postgres.database.azure.com"
    error_message = "POSTGRES_HOST must be the server FQDN"
  }
}

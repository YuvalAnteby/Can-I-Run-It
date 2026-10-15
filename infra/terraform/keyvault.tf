resource "azurerm_key_vault" "main" {
  name                       = "kv-${local.name}-${local.suffix}"
  location                   = azurerm_resource_group.prod.location
  resource_group_name        = azurerm_resource_group.prod.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  tags                       = local.tags
}

resource "azurerm_role_assignment" "operator_kv_secrets_officer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.operator_object_id
  principal_type       = "User"
}

resource "azurerm_role_assignment" "api_kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
  principal_type       = "ServicePrincipal"
}

# RBAC changes take a while to reach Key Vault's data plane. Both the secret
# writes below and the Container App's first revision wait on this.
resource "time_sleep" "rbac" {
  create_duration = "90s"

  triggers = {
    operator = azurerm_role_assignment.operator_kv_secrets_officer.id
    api      = azurerm_role_assignment.api_kv_secrets_user.id
  }
}

locals {
  # Secret name => environment variable the API reads it from.
  key_vault_secret_env = {
    "gemini-api-key"                        = "GEMINI_API_KEY"
    "rawg-api-key"                          = "RAWG_API_KEY"
    "applicationinsights-connection-string" = "APPLICATIONINSIGHTS_CONNECTION_STRING"
  }
}

resource "azurerm_key_vault_secret" "app" {
  for_each = local.key_vault_secret_env

  name         = each.key
  key_vault_id = azurerm_key_vault.main.id
  value = {
    "gemini-api-key"                        = var.gemini_api_key
    "rawg-api-key"                          = var.rawg_api_key
    "applicationinsights-connection-string" = azurerm_application_insights.main.connection_string
  }[each.key]

  depends_on = [time_sleep.rbac]
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                          = "psql-${local.name}-${local.env}-${local.suffix}"
  resource_group_name           = azurerm_resource_group.prod.name
  location                      = azurerm_resource_group.prod.location
  version                       = "16"
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  auto_grow_enabled             = false
  backup_retention_days         = 7
  geo_redundant_backup_enabled  = false
  public_network_access_enabled = false
  delegated_subnet_id           = azurerm_subnet.pg.id
  private_dns_zone_id           = azurerm_private_dns_zone.pg.id
  tags                          = local.tags

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false
    tenant_id                     = data.azurerm_client_config.current.tenant_id
  }

  lifecycle {
    ignore_changes = [zone]
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.pg]
}

# The server accepts one management operation at a time, so the child
# resources below are chained with depends_on.
resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "PG_TRGM"
}

resource "azurerm_postgresql_flexible_server_database" "ciri" {
  name      = local.postgres_db_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"

  depends_on = [azurerm_postgresql_flexible_server_configuration.extensions]
}

# principal_name must equal the API's POSTGRES_USER.
resource "azurerm_postgresql_flexible_server_active_directory_administrator" "api" {
  server_name         = azurerm_postgresql_flexible_server.main.name
  resource_group_name = azurerm_resource_group.prod.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  object_id           = azurerm_user_assigned_identity.api.principal_id
  principal_name      = azurerm_user_assigned_identity.api.name
  principal_type      = "ServicePrincipal"

  depends_on = [azurerm_postgresql_flexible_server_database.ciri]
}

resource "azurerm_postgresql_flexible_server_active_directory_administrator" "operator" {
  server_name         = azurerm_postgresql_flexible_server.main.name
  resource_group_name = azurerm_resource_group.prod.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  object_id           = var.operator_object_id
  principal_name      = var.operator_upn
  principal_type      = "User"

  depends_on = [azurerm_postgresql_flexible_server_active_directory_administrator.api]
}

resource "azurerm_postgresql_flexible_server" "database" {
  name                          = var.postgres_server_name
  resource_group_name           = azurerm_resource_group.production.name
  location                      = var.location
  version                       = "16"
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  auto_grow_enabled             = false
  backup_retention_days         = 7
  geo_redundant_backup_enabled  = false
  public_network_access_enabled = true
  tags                          = local.tags

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false
    tenant_id                     = var.tenant_id
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_postgresql_flexible_server_database" "application" {
  name      = var.postgres_database_name
  server_id = azurerm_postgresql_flexible_server.database.id
}

resource "azurerm_postgresql_flexible_server_configuration" "extensions" {
  name      = "azure.extensions"
  server_id = azurerm_postgresql_flexible_server.database.id
  value     = "PG_TRGM"
}

resource "azurerm_postgresql_flexible_server_configuration" "secure_transport" {
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.database.id
  value     = "on"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "operator" {
  for_each = var.operator_ipv4_rules

  name             = "operator-${each.key}"
  server_id        = azurerm_postgresql_flexible_server.database.id
  start_ip_address = each.value
  end_ip_address   = each.value
}

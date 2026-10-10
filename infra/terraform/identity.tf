resource "azurerm_user_assigned_identity" "backend" {
  name                = "${var.name_prefix}-backend"
  location            = var.location
  resource_group_name = azurerm_resource_group.production.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "maintenance" {
  for_each = local.maintenance_commands

  name                = "${var.name_prefix}-${replace(each.key, "-", "-")}"
  location            = var.location
  resource_group_name = azurerm_resource_group.production.name
  tags                = local.tags
}

resource "azurerm_key_vault" "production" {
  name                          = var.key_vault_name
  location                      = var.location
  resource_group_name           = azurerm_resource_group.production.name
  tenant_id                     = var.tenant_id
  sku_name                      = "standard"
  enable_rbac_authorization     = true
  public_network_access_enabled = true
  purge_protection_enabled      = true
  soft_delete_retention_days    = 90
  tags                          = local.tags

  network_acls {
    bypass         = "None"
    default_action = "Allow"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_virtual_network" "main" {
  name                = "vnet-${local.name}-${local.env}"
  location            = azurerm_resource_group.prod.location
  resource_group_name = azurerm_resource_group.prod.name
  address_space       = ["10.20.0.0/16"]
  tags                = local.tags
}

resource "azurerm_subnet" "aca" {
  name                 = "snet-aca"
  resource_group_name  = azurerm_resource_group.prod.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.20.0.0/26"]

  # New VNets default to private subnets; the API needs outbound access to
  # reach Gemini and RAWG without a NAT gateway.
  default_outbound_access_enabled = true

  delegation {
    name = "aca"

    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "pg" {
  name                 = "snet-pg"
  resource_group_name  = azurerm_resource_group.prod.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.20.1.0/28"]
  # Azure adds this endpoint when the server is created (backup/WAL storage);
  # declared so Terraform does not remove it.
  service_endpoints = ["Microsoft.Storage"]

  delegation {
    name = "postgres"

    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_private_dns_zone" "pg" {
  name                = "${local.name}-${local.env}.private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.prod.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "pg" {
  name                  = "vnet-${local.name}-${local.env}"
  resource_group_name   = azurerm_resource_group.prod.name
  private_dns_zone_name = azurerm_private_dns_zone.pg.name
  virtual_network_id    = azurerm_virtual_network.main.id
  registration_enabled  = false
  tags                  = local.tags
}

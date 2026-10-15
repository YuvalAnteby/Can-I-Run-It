resource "azurerm_storage_account" "frontend" {
  name                            = "st${local.name}web${local.suffix}"
  resource_group_name             = azurerm_resource_group.prod.name
  location                        = azurerm_resource_group.prod.location
  account_kind                    = "StorageV2"
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  tags                            = local.tags
}

# The $web container is served publicly by the static website endpoint
# regardless of allow_nested_items_to_be_public.
resource "azurerm_storage_account_static_website" "frontend" {
  storage_account_id = azurerm_storage_account.frontend.id
  index_document     = "index.html"
  error_404_document = "index.html"
}

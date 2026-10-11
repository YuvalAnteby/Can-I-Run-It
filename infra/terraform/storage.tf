resource "azapi_resource" "exports_account" {
  type      = "Microsoft.Storage/storageAccounts@2023-05-01"
  name      = var.export_storage_account_name
  parent_id = azurerm_resource_group.production.id
  location  = var.location

  schema_validation_enabled = false

  body = {
    sku = {
      name = "Standard_LRS"
    }
    kind = "StorageV2"
    properties = {
      accessTier                   = "Hot"
      allowBlobPublicAccess        = false
      allowSharedKeyAccess         = false
      defaultToOAuthAuthentication = true
      minimumTlsVersion            = "TLS1_2"
      publicNetworkAccess          = "Enabled"
      supportsHttpsTrafficOnly     = true
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azapi_resource" "exports_blob_service" {
  type      = "Microsoft.Storage/storageAccounts/blobServices@2023-05-01"
  name      = "default"
  parent_id = azapi_resource.exports_account.id

  schema_validation_enabled = false

  body = {
    properties = {
      isVersioningEnabled = false
      deleteRetentionPolicy = {
        enabled = true
        days    = 7
      }
      containerDeleteRetentionPolicy = {
        enabled = true
        days    = 7
      }
    }
  }
}

resource "azapi_resource" "exports_container" {
  for_each = {
    exports = var.exports_container_name
    control = var.control_container_name
  }

  type      = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01"
  name      = each.value
  parent_id = azapi_resource.exports_blob_service.id

  schema_validation_enabled = false

  body = {
    properties = {
      publicAccess = "None"
    }
  }
}

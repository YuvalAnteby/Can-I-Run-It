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
  tags = {
    environment = "bootstrap"
    owner       = var.owner
    project     = var.project
    managed_by  = "terraform"
  }
}

resource "azurerm_resource_group" "state" {
  name     = var.state_resource_group_name
  location = var.location
  tags     = local.tags

  lifecycle {
    precondition {
      condition     = var.github_platform_subject != var.github_release_subject
      error_message = "The platform and release OIDC subjects must be distinct protected GitHub environments."
    }
  }
}

resource "azapi_resource" "state_account" {
  type      = "Microsoft.Storage/storageAccounts@2023-05-01"
  name      = var.state_storage_account_name
  parent_id = azurerm_resource_group.state.id
  location  = var.location

  schema_validation_enabled = false

  body = {
    sku = {
      name = "Standard_LRS"
    }
    kind = "StorageV2"
    properties = {
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

resource "azapi_resource" "state_blob_service" {
  type      = "Microsoft.Storage/storageAccounts/blobServices@2023-05-01"
  name      = "default"
  parent_id = azapi_resource.state_account.id

  schema_validation_enabled = false

  body = {
    properties = {
      isVersioningEnabled = true
      deleteRetentionPolicy = {
        enabled = true
        days    = 30
      }
      containerDeleteRetentionPolicy = {
        enabled = true
        days    = 30
      }
    }
  }
}

resource "azapi_resource" "state_container" {
  type      = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01"
  name      = var.state_container_name
  parent_id = azapi_resource.state_blob_service.id

  schema_validation_enabled = false

  body = {
    properties = {
      publicAccess = "None"
    }
  }
}

resource "azapi_resource" "bootstrap_state_container" {
  type      = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01"
  name      = var.bootstrap_state_container_name
  parent_id = azapi_resource.state_blob_service.id

  schema_validation_enabled = false

  body = {
    properties = {
      publicAccess = "None"
    }
  }
}

resource "azurerm_user_assigned_identity" "github_platform" {
  name                = "${var.name_prefix}-github-platform"
  location            = var.location
  resource_group_name = azurerm_resource_group.state.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "github_release" {
  name                = "${var.name_prefix}-github-release"
  location            = var.location
  resource_group_name = azurerm_resource_group.state.name
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "github_platform" {
  name                = "github-platform-azure-platform"
  resource_group_name = azurerm_resource_group.state.name
  parent_id           = azurerm_user_assigned_identity.github_platform.id
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = var.github_platform_subject
  audience            = ["api://AzureADTokenExchange"]
}

resource "azurerm_federated_identity_credential" "github_release" {
  name                = "github-release-production"
  resource_group_name = azurerm_resource_group.state.name
  parent_id           = azurerm_user_assigned_identity.github_release.id
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = var.github_release_subject
  audience            = ["api://AzureADTokenExchange"]
}

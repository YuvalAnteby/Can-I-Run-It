terraform {
  required_version = "= 1.11.4"
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "= 2.4.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 4.25.0"
    }
  }
}
provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  tenant_id                       = var.tenant_id
  resource_provider_registrations = "none"
  storage_use_azuread             = true
}
variable "subscription_id" { type = string }
variable "tenant_id" { type = string }
variable "state_resource_group_name" { type = string }
variable "state_storage_account_name" { type = string }
variable "location" {
  type    = string
  default = "westeurope"
  validation {
    condition     = var.location == "westeurope"
    error_message = "Review region entitlement before changing West Europe."
  }
}
variable "owner" { type = string }
variable "github_repository" {
  type = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Exact GitHub owner/repository required."
  }
}
variable "github_environment" {
  type    = string
  default = "production"
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]+$", var.github_environment))
    error_message = "A protected production environment name is required."
  }
}
variable "human_principal_id" { type = string }
variable "entitlement_verified" {
  type    = bool
  default = false
}
locals {
  tags = { project = "ciri", environment = "production", owner = var.owner }
}
resource "azurerm_resource_group" "state" {
  name     = var.state_resource_group_name
  location = var.location
  tags     = local.tags
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.entitlement_verified
      error_message = "Human must verify grants, inventory and dated cost evidence before any cloud creation."
    }
  }
}
resource "azapi_resource" "state_account" {
  type      = "Microsoft.Storage/storageAccounts@2023-05-01"
  name      = var.state_storage_account_name
  parent_id = azurerm_resource_group.state.id
  location  = var.location
  body = {
    kind       = "StorageV2"
    sku        = { name = "Standard_LRS" }
    properties = { accessTier = "Hot", minimumTlsVersion = "TLS1_2", allowSharedKeyAccess = false, defaultToOAuthAuthentication = true, allowBlobPublicAccess = false, supportsHttpsTrafficOnly = true }
  }
  response_export_values = []
  tags                   = local.tags
  lifecycle { prevent_destroy = true }
}
resource "azapi_resource" "state_blob_service" {
  type                   = "Microsoft.Storage/storageAccounts/blobServices@2023-05-01"
  name                   = "default"
  parent_id              = azapi_resource.state_account.id
  body                   = { properties = { isVersioningEnabled = true, deleteRetentionPolicy = { enabled = true, days = 7 }, containerDeleteRetentionPolicy = { enabled = true, days = 7 } } }
  response_export_values = []
}
resource "azapi_resource" "state_container" {
  type                   = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01"
  name                   = "tfstate"
  parent_id              = azapi_resource.state_blob_service.id
  body                   = { properties = { publicAccess = "None" } }
  response_export_values = []
  lifecycle { prevent_destroy = true }
}
resource "azurerm_user_assigned_identity" "github" {
  for_each            = toset(["platform", "release"])
  name                = "ciri-github-${each.key}"
  resource_group_name = azurerm_resource_group.state.name
  location            = var.location
  tags                = local.tags
}
resource "azurerm_federated_identity_credential" "github" {
  for_each            = azurerm_user_assigned_identity.github
  name                = "github-production"
  resource_group_name = azurerm_resource_group.state.name
  parent_id           = each.value.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository}:environment:${var.github_environment}"
}
resource "azurerm_role_assignment" "platform_state" {
  scope                = azapi_resource.state_container.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.github["platform"].principal_id
}
resource "azurerm_role_assignment" "human_state" {
  scope                = azapi_resource.state_account.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.human_principal_id
}
# Human-only bootstrap state is isolated from ordinary CI.
resource "azapi_resource" "bootstrap_container" {
  type                   = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01"
  name                   = "bootstrap"
  parent_id              = azapi_resource.state_blob_service.id
  body                   = { properties = { publicAccess = "None" } }
  response_export_values = []
  lifecycle { prevent_destroy = true }
}


output "state_storage_account_name" { value = azapi_resource.state_account.name }
output "state_container_name" { value = azapi_resource.state_container.name }
output "bootstrap_container_name" { value = azapi_resource.bootstrap_container.name }
output "platform_client_id" { value = azurerm_user_assigned_identity.github["platform"].client_id }
output "platform_principal_id" { value = azurerm_user_assigned_identity.github["platform"].principal_id }
output "release_client_id" { value = azurerm_user_assigned_identity.github["release"].client_id }
output "release_principal_id" { value = azurerm_user_assigned_identity.github["release"].principal_id }

provider "azapi" {
  skip_provider_registration = true
  subscription_id            = var.subscription_id
  tenant_id                  = var.tenant_id
}

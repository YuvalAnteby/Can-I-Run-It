output "state_resource_group_name" {
  description = "Protected state resource group."
  value       = azurerm_resource_group.state.name
}

output "state_storage_account_id" {
  description = "Protected state storage account resource ID."
  value       = azapi_resource.state_account.id
}

output "state_container_name" {
  description = "Private Terraform state container."
  value       = var.state_container_name
}

output "state_container_resource_id" {
  description = "Production Terraform state container resource ID; scope platform data access here, never at the storage account."
  value       = azapi_resource.state_container.id
}

output "bootstrap_state_container_name" {
  description = "Human-only bootstrap state container name."
  value       = var.bootstrap_state_container_name
}

output "bootstrap_state_container_resource_id" {
  description = "Human-only bootstrap state container resource ID."
  value       = azapi_resource.bootstrap_state_container.id
}

output "platform_identity_client_id" {
  description = "GitHub platform OIDC UAMI client ID. Grant its state and platform scopes manually after review."
  value       = azurerm_user_assigned_identity.github_platform.client_id
}

output "platform_identity_principal_id" {
  description = "GitHub platform OIDC UAMI principal ID."
  value       = azurerm_user_assigned_identity.github_platform.principal_id
}

output "release_identity_client_id" {
  description = "GitHub release OIDC UAMI client ID. Grant its reviewed app/job scopes manually."
  value       = azurerm_user_assigned_identity.github_release.client_id
}

output "release_identity_principal_id" {
  description = "GitHub release OIDC UAMI principal ID."
  value       = azurerm_user_assigned_identity.github_release.principal_id
}

# These names are a contract with the release workflows (GitHub variables).

output "resource_group_name" {
  description = "AZURE_RESOURCE_GROUP"
  value       = azurerm_resource_group.prod.name
}

output "api_container_app_name" {
  description = "AZURE_API_APP_NAME"
  value       = azurerm_container_app.api.name
}

output "api_url" {
  description = "API_URL (no trailing slash)"
  value       = "https://${azurerm_container_app.api.ingress[0].fqdn}"
}

output "frontend_storage_account_name" {
  description = "AZURE_FRONTEND_STORAGE_ACCOUNT"
  value       = azurerm_storage_account.frontend.name
}

output "frontend_url" {
  description = "FRONTEND_URL (no trailing slash)"
  value       = trimsuffix(azurerm_storage_account.frontend.primary_web_endpoint, "/")
}

output "deploy_client_id" {
  description = "AZURE_CLIENT_ID for GitHub Actions OIDC"
  value       = azurerm_user_assigned_identity.deploy.client_id
}

output "tenant_id" {
  description = "AZURE_TENANT_ID"
  value       = data.azurerm_client_config.current.tenant_id
}

output "subscription_id" {
  description = "AZURE_SUBSCRIPTION_ID"
  value       = var.subscription_id
}

output "postgres_fqdn" {
  description = "Private Postgres FQDN (resolves only inside the VNet)"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

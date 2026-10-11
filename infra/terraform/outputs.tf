output "resource_group_name" {
  description = "Owned production resource group name."
  value       = azurerm_resource_group.production.name
}

output "backend_resource_id" {
  description = "Production API Container App resource ID."
  value       = azapi_resource.backend.id
}

output "backend_url" {
  description = "HTTPS origin for the production API."
  value       = local.backend_url
}

output "static_web_app_name" {
  description = "Production Static Web Apps name."
  value       = azapi_resource.frontend.name
}

output "static_web_app_origin" {
  description = "HTTPS origin for the production SPA."
  value       = local.static_web_app_origin
}

output "postgres_server_resource_id" {
  description = "PostgreSQL Flexible Server resource ID."
  value       = azurerm_postgresql_flexible_server.database.id
}

output "postgres_host" {
  description = "PostgreSQL Flexible Server hostname."
  value       = azurerm_postgresql_flexible_server.database.fqdn
}

output "postgres_database" {
  description = "Application database name."
  value       = azurerm_postgresql_flexible_server_database.application.name
}

output "migration_job_resource_id" {
  description = "Finite migration Job resource ID."
  value       = azapi_resource.maintenance["migration"].id
}

output "export_job_resource_id" {
  description = "Finite exporter Job resource ID."
  value       = azapi_resource.maintenance["export"].id
}

output "firewall_job_resource_id" {
  description = "Finite firewall-control Job resource ID."
  value       = azapi_resource.maintenance["firewall"].id
}

output "export_check_job_resource_id" {
  description = "Finite export-check Job resource ID."
  value       = azapi_resource.maintenance["export-check"].id
}

output "export_storage_account_name" {
  description = "Private portable export/control storage account name."
  value       = var.export_storage_account_name
}

output "export_storage_account_resource_id" {
  description = "Private portable export/control storage account resource ID."
  value       = azapi_resource.exports_account.id
}

output "exports_container_name" {
  description = "Private export container name."
  value       = var.exports_container_name
}

output "exports_container_resource_id" {
  description = "Private export container resource ID for the human RBAC bootstrap."
  value       = azapi_resource.exports_container["exports"].id
}

output "control_container_name" {
  description = "Private control metadata container name."
  value       = var.control_container_name
}

output "control_container_resource_id" {
  description = "Private control metadata container resource ID for the human RBAC bootstrap."
  value       = azapi_resource.exports_container["control"].id
}

output "backend_identity_resource_id" {
  description = "Backend UAMI resource ID."
  value       = azurerm_user_assigned_identity.backend.id
}

output "backend_identity_client_id" {
  description = "Backend UAMI client ID."
  value       = azurerm_user_assigned_identity.backend.client_id
}

output "backend_identity_principal_id" {
  description = "Backend UAMI principal ID."
  value       = azurerm_user_assigned_identity.backend.principal_id
}

output "maintenance_identity_resource_ids" {
  description = "Maintenance UAMI resource IDs keyed by command."
  value       = { for name, identity in azurerm_user_assigned_identity.maintenance : name => identity.id }
}

output "maintenance_identity_client_ids" {
  description = "Maintenance UAMI client IDs keyed by command."
  value       = { for name, identity in azurerm_user_assigned_identity.maintenance : name => identity.client_id }
}

output "maintenance_identity_principal_ids" {
  description = "Maintenance UAMI principal IDs keyed by command."
  value       = { for name, identity in azurerm_user_assigned_identity.maintenance : name => identity.principal_id }
}

output "key_vault_resource_id" {
  description = "Dedicated RBAC Key Vault resource ID. Secret values are never output."
  value       = azurerm_key_vault.production.id
}

output "observability_workspace_id" {
  description = "Owned Log Analytics workspace resource ID."
  value       = azapi_resource.observability.id
}

output "observability_app_insights_id" {
  description = "Owned workspace-based Application Insights resource ID."
  value       = azurerm_application_insights.observability.id
}

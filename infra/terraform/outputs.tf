output "observability_workspace_id" {
  description = "ID of the optional owned Log Analytics workspace, or null when disabled."
  value       = try(azurerm_log_analytics_workspace.observability[0].id, null)
}

output "observability_app_insights_id" {
  description = "ID of the optional workspace-based Application Insights resource, or null when disabled."
  value       = try(azurerm_application_insights.observability[0].id, null)
}

output "observability_connection_string" {
  description = "Sensitive Application Insights connection string for the Container App secret."
  value       = try(azurerm_application_insights.observability[0].connection_string, null)
  sensitive   = true
}

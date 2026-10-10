resource "azapi_resource" "maintenance" {
  for_each = local.maintenance_commands

  type      = "Microsoft.App/jobs@2025-01-01"
  name      = "${var.name_prefix}-${each.key}"
  parent_id = azurerm_resource_group.production.id
  location  = var.location

  schema_validation_enabled = false
  response_export_values    = ["properties.outboundIpAddresses", "properties.provisioningState"]

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.maintenance[each.key].id]
  }

  body = {
    tags = local.tags
    properties = merge({
      environmentId       = azurerm_container_app_environment.production.id
      workloadProfileName = "Consumption"
      configuration = merge({
        replicaTimeout    = local.maintenance_resources[each.key].timeout
        replicaRetryLimit = 0
      }, local.maintenance_trigger[each.key])
      template = {
        containers = [{
          name    = each.key
          image   = var.tools_image
          command = local.maintenance_commands[each.key]
          resources = {
            cpu    = local.maintenance_resources[each.key].cpu
            memory = local.maintenance_resources[each.key].memory
          }
          env = [
            for key, value in local.maintenance_environment[each.key] : {
              name  = key
              value = value
            }
          ]
        }]
      }
    }, {})
  }
}

resource "azurerm_user_assigned_identity" "api" {
  name                = "id-${local.name}-api"
  location            = azurerm_resource_group.prod.location
  resource_group_name = azurerm_resource_group.prod.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "deploy" {
  name                = "id-${local.name}-deploy"
  location            = azurerm_resource_group.prod.location
  resource_group_name = azurerm_resource_group.prod.name
  tags                = local.tags
}

resource "azurerm_federated_identity_credential" "deploy_github" {
  name                      = "github-production"
  user_assigned_identity_id = azurerm_user_assigned_identity.deploy.id
  issuer                    = "https://token.actions.githubusercontent.com"
  subject                   = "repo:${var.github_repository}:environment:production"
  audience                  = ["api://AzureADTokenExchange"]
}

resource "azurerm_role_assignment" "deploy_rg_reader" {
  scope                = azurerm_resource_group.prod.id
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "deploy_api_contributor" {
  scope                = azurerm_container_app.api.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
  principal_type       = "ServicePrincipal"
}

# az containerapp update re-sends the app's user-assigned identity, which
# requires assign permission on that identity.
resource "azurerm_role_assignment" "deploy_api_identity_operator" {
  scope                = azurerm_user_assigned_identity.api.id
  role_definition_name = "Managed Identity Operator"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
  principal_type       = "ServicePrincipal"
}

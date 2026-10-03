mock_provider "azurerm" {}
mock_provider "azapi" {}
variables {
  subscription_id            = "11111111-1111-1111-1111-111111111111"
  tenant_id                  = "22222222-2222-2222-2222-222222222222"
  state_resource_group_name  = "ciri-state"
  state_storage_account_name = "ciristate"
  owner                      = "test"
  human_principal_id         = "33333333-3333-3333-3333-333333333333"
  github_repository          = "example/ciri"
  github_environment         = "production"
  entitlement_verified       = true
}
run "state_and_federation" {
  command = plan
  assert {
    condition     = azapi_resource.state_account.body.sku.name == "Standard_LRS" && !azapi_resource.state_account.body.properties.allowSharedKeyAccess && !azapi_resource.state_account.body.properties.allowBlobPublicAccess && azapi_resource.state_blob_service.body.properties.isVersioningEnabled && azapi_resource.state_blob_service.body.properties.deleteRetentionPolicy.days == 7 && azapi_resource.state_container.body.properties.publicAccess == "None"
    error_message = "State must use private authenticated StandardLRS with versioning and7daysoftdelete."
  }
  assert {
    condition     = length(azurerm_user_assigned_identity.github) == 2 && alltrue([for federation in azurerm_federated_identity_credential.github : federation.subject == "repo:example/ciri:environment:production" && federation.issuer == "https://token.actions.githubusercontent.com" && federation.audience == tolist(["api://AzureADTokenExchange"])])
    error_message = "Separate principals must bind exact repository and protected environment."
  }
  assert {
    condition     = azurerm_role_assignment.platform_state.role_definition_name == "Storage Blob Data Contributor" && azapi_resource.bootstrap_container.name == "bootstrap" && azapi_resource.bootstrap_container.name != azapi_resource.state_container.name
    error_message = "Human bootstrap container is isolated from platform production state access."
  }
}
run "reject_unverified_subscription" {
  command = plan
  variables { entitlement_verified = false }
  expect_failures = [azurerm_resource_group.state]
}

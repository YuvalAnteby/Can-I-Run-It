mock_provider "azurerm" {}
variables {
  subscription_id             = "11111111-1111-1111-1111-111111111111"
  tenant_id                   = "22222222-2222-2222-2222-222222222222"
  resource_group_name         = "ciri-production"
  name_prefix                 = "ciri"
  postgres_server_name        = "ciri-pg"
  key_vault_name              = "ciri-vault"
  export_storage_account_name = "ciriexports"
  platform_principal_id       = "33333333-3333-3333-3333-333333333333"
  release_principal_id        = "44444444-4444-4444-4444-444444444444"
  human_admin_object_id       = "55555555-5555-5555-5555-555555555555"
  human_admin_login           = "human@example.com"
}
run "initial_infrastructure_permissions" {
  command = plan
  assert {
    condition     = length(azurerm_postgresql_flexible_server_active_directory_administrator.human) == 0 && length(azurerm_role_assignment.control_data) == 0 && length(azurerm_role_assignment.checker_cost) == 0
    error_message = "Initial phase must not create references to nonexistent runtime resources."
  }
  assert {
    condition     = !anytrue([for action in azurerm_role_definition.platform.permissions[0].actions : strcontains(lower(action), "authorization") || strcontains(lower(action), "administrator") || strcontains(lower(action), "listsecret") || strcontains(lower(action), "listkey")]) && !contains(azurerm_role_definition.platform.permissions[0].actions, "*")
    error_message = "Platform must never gain RBAC admin, PostgreSQL admin or generated key/secret-list rights."
  }
  assert {
    condition     = !anytrue([for action in azurerm_role_definition.job_operator.permissions[0].actions : strcontains(lower(action), "secret") || strcontains(lower(action), "write")]) && azurerm_role_definition.firewall.permissions[0].actions == tolist(["Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/read", "Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/write", "Microsoft.DBforPostgreSQL/flexibleServers/firewallRules/delete"])
    error_message = "Trusted Job operator must not list secrets; firewall controller actions are exact."
  }
}
run "scoped_runtime_permissions" {
  command = plan
  variables {
    runtime_rbac_enabled   = true
    executor_principal_ids = { backend = "66666666-6666-6666-6666-666666666666", migration = "77777777-7777-7777-7777-777777777777", export = "88888888-8888-8888-8888-888888888888", firewall = "99999999-9999-9999-9999-999999999999", export-check = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }
  }
  assert {
    condition     = azurerm_postgresql_flexible_server_active_directory_administrator.human[0].object_id == var.human_admin_object_id && azurerm_postgresql_flexible_server_active_directory_administrator.human[0].principal_type == "User" && azurerm_role_assignment.backend_secrets[0].scope == local.vault_id && azurerm_role_assignment.export_data[0].scope == local.blob_scopes.exports && length(azurerm_role_assignment.checker_cost) == 0
    error_message = "Only human becomes DB admin; runtime secrets and exporter blob data are scoped; cost scope is opt-in."
  }
  assert {
    condition     = alltrue([for assignment in azurerm_role_assignment.control_data : assignment.scope == local.blob_scopes.control]) && length(azurerm_role_assignment.checker_jobs) == 2 && azurerm_role_assignment.firewall[0].scope == local.postgres_id && length(azurerm_role_assignment.firewall_executor_read) == 3
    error_message = "Controller/checker permissions must remain selected executor/server/control-container scopes."
  }
}
run "reject_incomplete_runtime_identities" {
  command = plan
  variables {
    runtime_rbac_enabled   = true
    executor_principal_ids = { backend = "invalid", migration = "invalid", export = "invalid", firewall = "invalid", export-check = "invalid" }
  }
  expect_failures = [var.executor_principal_ids]
}

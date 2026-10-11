mock_provider "azapi" {}

mock_provider "azurerm" {
  mock_resource "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-tfstate-rg"
    }
  }

  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/ciri-tfstate-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/ciri-github"
      client_id    = "22222222-2222-2222-2222-222222222222"
      principal_id = "33333333-3333-3333-3333-333333333333"
    }
  }
}

variables {
  subscription_id            = "11111111-1111-1111-1111-111111111111"
  tenant_id                  = "22222222-2222-2222-2222-222222222222"
  state_storage_account_name = "ciristatetest"
}

run "platform_and_release_subjects_are_distinct" {
  command = plan

  assert {
    condition = (
      azurerm_federated_identity_credential.github_platform.subject != azurerm_federated_identity_credential.github_release.subject &&
      azurerm_federated_identity_credential.github_platform.subject == var.github_platform_subject &&
      azurerm_federated_identity_credential.github_release.subject == var.github_release_subject
    )
    error_message = "Platform and release identities must trust distinct protected GitHub subjects."
  }
}

run "custom_subjects_are_bound_to_the_matching_identity" {
  command = plan

  variables {
    github_platform_subject = "repo:YuvalAnteby/Can-I-Run-It:environment:platform"
    github_release_subject  = "repo:YuvalAnteby/Can-I-Run-It:environment:release"
  }

  assert {
    condition = (
      azurerm_federated_identity_credential.github_platform.subject == "repo:YuvalAnteby/Can-I-Run-It:environment:platform" &&
      azurerm_federated_identity_credential.github_release.subject == "repo:YuvalAnteby/Can-I-Run-It:environment:release"
    )
    error_message = "Each federated credential must retain its explicitly configured protected subject."
  }
}

run "reject_shared_platform_and_release_subject" {
  command = plan

  variables {
    github_platform_subject = "repo:YuvalAnteby/Can-I-Run-It:environment:shared"
    github_release_subject  = "repo:YuvalAnteby/Can-I-Run-It:environment:shared"
  }

  expect_failures = [azurerm_resource_group.state]
}

run "platform_role_keeps_rbac_and_postgres_admin_out" {
  command = plan

  assert {
    condition = (
      contains(
        jsondecode(file("${path.module}/roles/ciri-platform-operator.json")).NotActions,
        "Microsoft.Authorization/*"
      ) &&
      contains(
        jsondecode(file("${path.module}/roles/ciri-platform-operator.json")).NotActions,
        "Microsoft.DBforPostgreSQL/flexibleServers/administrators/*"
      ) &&
      !contains(
        jsondecode(file("${path.module}/roles/ciri-platform-operator.json")).Actions,
        "Microsoft.Authorization/*"
      )
    )
    error_message = "The platform role must not grant RBAC administration or PostgreSQL Entra-admin control."
  }
}

run "providers_do_not_register_automatically" {
  command = plan

  assert {
    condition = (
      strcontains(file("${path.module}/main.tf"), "resource_provider_registrations = \"none\"") &&
      strcontains(file("${path.module}/main.tf"), "skip_provider_registration = true")
    )
    error_message = "Human bootstrap must explicitly own provider registration."
  }
}

run "local_backend_handoff" {
  command = apply

  assert {
    condition = (
      terraform_data.foundation.output.phase == "local-foundation" &&
      terraform_data.foundation.output.marker == "no-external-provider" &&
      strcontains(file("${path.module}/backend.tf"), "backend \"local\"") &&
      !strcontains(file("${path.module}/main.tf"), "required_providers") &&
      strcontains(file("${path.module}/../../bootstrap/README.md"), "Move-Item -LiteralPath $backendFile") &&
      strcontains(file("${path.module}/../../bootstrap/README.md"), "terraform state pull") &&
      strcontains(file("${path.module}/../../bootstrap/README.md"), "terraform init -migrate-state")
    )
    error_message = "The documented bootstrap handoff must include local state, backup, restore, and migration phases."
  }
}

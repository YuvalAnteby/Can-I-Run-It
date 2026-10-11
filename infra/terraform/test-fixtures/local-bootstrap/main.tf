terraform {
  required_version = ">= 1.9.0, < 2.0.0"
}

resource "terraform_data" "foundation" {
  input = {
    phase  = "local-foundation"
    marker = "no-external-provider"
  }
}

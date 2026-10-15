terraform {
  required_version = ">= 1.9.0, < 2.0.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 4.81.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.9.1"
    }
    time = {
      source  = "hashicorp/time"
      version = "= 0.14.2"
    }
  }

  # Remaining settings come from backend.hcl (see backend.hcl.example).
  backend "azurerm" {
    use_azuread_auth = true
  }
}

provider "azurerm" {
  features {}

  subscription_id                 = var.subscription_id
  storage_use_azuread             = true
  resource_provider_registrations = "none"
}

data "azurerm_client_config" "current" {}

resource "random_string" "suffix" {
  length  = 6
  lower   = true
  upper   = false
  numeric = true
  special = false
}

locals {
  name   = "ciri"
  env    = "prod"
  suffix = random_string.suffix.result

  tags = {
    project     = "can-i-run-it"
    environment = local.env
    managed_by  = "terraform"
  }

  api_port         = 4000
  api_app_name     = "ca-ciri-api"
  postgres_db_name = "ciri"
}

resource "azurerm_resource_group" "prod" {
  name     = "rg-${local.name}-${local.env}"
  location = var.location
  tags     = local.tags
}

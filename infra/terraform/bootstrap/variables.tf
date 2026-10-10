variable "subscription_id" {
  type        = string
  description = "Azure subscription holding the protected Terraform state account."

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "subscription_id must be a UUID."
  }
}

variable "tenant_id" {
  type        = string
  description = "Microsoft Entra tenant used by GitHub OIDC."

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.tenant_id))
    error_message = "tenant_id must be a UUID."
  }
}

variable "location" {
  type        = string
  default     = "westeurope"
  description = "Approved bootstrap region."

  validation {
    condition     = lower(trimspace(var.location)) == "westeurope"
    error_message = "Bootstrap is pinned to westeurope until the reviewed regional worksheet changes."
  }
}

variable "state_resource_group_name" {
  type        = string
  default     = "ciri-tfstate-rg"
  description = "Dedicated resource group for protected Terraform state."
}

variable "state_storage_account_name" {
  type        = string
  description = "Globally unique Standard_LRS state storage account name."

  validation {
    condition     = can(regex("^[a-z0-9]{3,24}$", var.state_storage_account_name))
    error_message = "state_storage_account_name must be 3-24 lowercase letters or digits."
  }
}

variable "state_container_name" {
  type        = string
  default     = "terraform-state"
  description = "Private state blob container name."

  validation {
    condition     = can(regex("^[a-z0-9-]{3,63}$", var.state_container_name))
    error_message = "state_container_name must be a valid blob container name."
  }
}

variable "bootstrap_state_container_name" {
  type        = string
  default     = "bootstrap-state"
  description = "Separate private container for the human-only bootstrap state key."

  validation {
    condition     = can(regex("^[a-z0-9-]{3,63}$", var.bootstrap_state_container_name)) && var.bootstrap_state_container_name != var.state_container_name
    error_message = "bootstrap_state_container_name must be a valid blob container name distinct from state_container_name."
  }
}

variable "name_prefix" {
  type        = string
  default     = "ciri"
  description = "Naming prefix for bootstrap identities."
}

variable "project" {
  type        = string
  default     = "ciri"
  description = "Project tag."
}

variable "owner" {
  type        = string
  default     = "platform"
  description = "Owner tag."
}

variable "github_platform_subject" {
  type        = string
  default     = "repo:YuvalAnteby/Can-I-Run-It:environment:azure-platform"
  description = "Exact protected GitHub Actions subject for the platform workflow."

  validation {
    condition     = can(regex("^repo:YuvalAnteby/Can-I-Run-It:environment:[a-z0-9-]+$", var.github_platform_subject))
    error_message = "github_platform_subject must bind the approved repository to a named protected environment."
  }
}

variable "github_release_subject" {
  type        = string
  default     = "repo:YuvalAnteby/Can-I-Run-It:environment:production"
  description = "Exact protected GitHub Actions subject for the release workflow."

  validation {
    condition     = can(regex("^repo:YuvalAnteby/Can-I-Run-It:environment:[a-z0-9-]+$", var.github_release_subject))
    error_message = "github_release_subject must bind the approved repository to a named protected environment."
  }
}

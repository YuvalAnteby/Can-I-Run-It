variable "subscription_id" {
  type        = string
  description = "Azure subscription used by the production platform."

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "subscription_id must be a UUID."
  }
}

variable "tenant_id" {
  type        = string
  description = "Microsoft Entra tenant used by the platform and PostgreSQL."

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.tenant_id))
    error_message = "tenant_id must be a UUID."
  }
}

variable "location" {
  type        = string
  default     = "westeurope"
  description = "Approved Azure region. The credit/SKU worksheet must cover this region."

  validation {
    condition     = lower(trimspace(var.location)) == "westeurope"
    error_message = "This approved deployment is pinned to westeurope until a reviewed cost and quota worksheet authorizes another region."
  }
}

variable "resource_group_name" {
  type        = string
  description = "Resource group owned by this production root."

  validation {
    condition     = trimspace(var.resource_group_name) != ""
    error_message = "resource_group_name is required."
  }
}

variable "name_prefix" {
  type        = string
  default     = "ciri"
  description = "Lowercase naming prefix used for owned resources."

  validation {
    condition     = can(regex("^[a-z0-9-]{1,20}$", var.name_prefix))
    error_message = "name_prefix must contain only lowercase letters, digits, and hyphens and be at most 20 characters."
  }
}

variable "project" {
  type        = string
  default     = "ciri"
  description = "Project tag applied to owned resources."
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Environment tag applied to owned resources."
}

variable "owner" {
  type        = string
  default     = "platform"
  description = "Owner tag applied to owned resources."
}

variable "entitlement_verified" {
  type        = bool
  default     = false
  description = "Human-confirmed subscription, region, quota, entitlement, and cost worksheet gate."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional non-sensitive resource tags."
}

variable "container_app_environment_name" {
  type        = string
  default     = "ciri-environment"
  description = "Owned default-network Container Apps environment name."
}

variable "container_app_name" {
  type        = string
  default     = "ciri-api"
  description = "Production API Container App name."
}

variable "static_web_app_name" {
  type        = string
  default     = "ciri-web"
  description = "Production Static Web Apps name."
}

variable "backend_image" {
  type        = string
  description = "Immutable API image digest, for example ghcr.io/org/ciri@sha256:<64 hex chars>."

  validation {
    condition     = can(regex("@sha256:[0-9a-fA-F]{64}$", var.backend_image)) && !can(regex(":latest$", lower(var.backend_image)))
    error_message = "backend_image must be an immutable sha256 digest and may not use latest."
  }
}

variable "tools_image" {
  type        = string
  description = "Immutable maintenance tools image digest."

  validation {
    condition     = can(regex("@sha256:[0-9a-fA-F]{64}$", var.tools_image)) && !can(regex(":latest$", lower(var.tools_image)))
    error_message = "tools_image must be an immutable sha256 digest and may not use latest."
  }
}

variable "backend_port" {
  type        = number
  default     = 4000
  description = "HTTPS ingress target port for the API."

  validation {
    condition     = var.backend_port == 4000
    error_message = "The approved production API listens on HTTPS port 4000."
  }
}

variable "backend_pool_max" {
  type        = number
  default     = 5
  description = "Maximum API PostgreSQL pool connections per replica."

  validation {
    condition     = var.backend_pool_max >= 1 && var.backend_pool_max <= 5 && var.backend_pool_max == floor(var.backend_pool_max)
    error_message = "backend_pool_max must be an integer from 1 through 5."
  }
}

variable "postgres_server_name" {
  type        = string
  description = "Azure Database for PostgreSQL Flexible Server name."
}

variable "postgres_database_name" {
  type        = string
  default     = "ciri"
  description = "Application database name."
}

variable "key_vault_name" {
  type        = string
  description = "Dedicated RBAC Key Vault name."

  validation {
    condition     = can(regex("^[a-zA-Z0-9-]{3,24}$", var.key_vault_name))
    error_message = "key_vault_name must be 3-24 letters, digits, or hyphens."
  }
}

variable "provider_secret_uris" {
  type        = map(string)
  default     = {}
  description = "Versionless or versioned Key Vault secret URIs for provider keys; actual values stay outside Terraform."

  validation {
    condition = alltrue([
      for key, value in var.provider_secret_uris :
      contains(["GEMINI_API_KEY", "RAWG_API_KEY"], key) &&
      can(regex("^https://[a-zA-Z0-9-]+\\.vault\\.azure\\.net/secrets/[a-zA-Z0-9-]+(?:/[a-zA-Z0-9-]+)?$", value))
    ])
    error_message = "provider_secret_uris may contain only GEMINI_API_KEY/RAWG_API_KEY and each value must be a Key Vault secret URI, never a plaintext secret."
  }
}

variable "environment_variables" {
  type        = map(string)
  default     = {}
  description = "Additional non-secret API environment variables. Reserved production settings cannot be overridden."
}

variable "observability_enabled" {
  type        = bool
  default     = true
  description = "Retained for compatibility; production observability resources are always owned by this root."
}

variable "observability_location" {
  type        = string
  default     = ""
  description = "Retained for compatibility; observability follows location."
}

variable "observability_daily_cap_gb" {
  type        = number
  default     = 0.1
  description = "Daily Log Analytics and Application Insights ingestion cap."

  validation {
    condition     = var.observability_daily_cap_gb == 0.1
    error_message = "The approved observability cap is 0.1 GB/day."
  }
}

variable "observability_retention_days" {
  type        = number
  default     = 30
  description = "Log retention in days."

  validation {
    condition     = var.observability_retention_days == 30
    error_message = "The approved observability retention is 30 days."
  }
}

variable "observability_sampling_ratio" {
  type        = number
  default     = 0.1
  description = "Application Insights trace sampling ratio."

  validation {
    condition     = var.observability_sampling_ratio == 0.1
    error_message = "The approved trace sampling ratio is 0.1."
  }
}

variable "observability_action_group_ids" {
  type        = list(string)
  default     = []
  description = "Retained for compatibility; this root creates no paid alert rules by default."
}

variable "export_storage_account_name" {
  type        = string
  description = "Separate private Standard_LRS account for portable exports and control metadata."
}

variable "exports_container_name" {
  type        = string
  default     = "exports"
  description = "Private export blob container."
}

variable "control_container_name" {
  type        = string
  default     = "control"
  description = "Private scheduling/firewall control metadata blob container."
}

variable "operator_ipv4_rules" {
  type        = map(string)
  default     = {}
  description = "Temporary or human operator exact IPv4 rules. Automatic executor rules are owned by the firewall Job."

  validation {
    condition = alltrue([
      for ip in values(var.operator_ipv4_rules) :
      can(regex("^[0-9]{1,3}(\\.[0-9]{1,3}){3}$", ip)) &&
      can(cidrhost("${ip}/32", 0) == ip) &&
      !can(regex("/", ip)) &&
      !can(regex("^(0\\.|10\\.|127\\.|169\\.254\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.|100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.)", ip)) &&
      ip != "0.0.0.0"
    ])
    error_message = "operator_ipv4_rules must contain only public, exact, individual IPv4 addresses; ranges, bypass values, private sources, CGNAT, and 0.0.0.0 are forbidden."
  }
}

variable "maintenance_schedules_enabled" {
  type        = bool
  default     = false
  description = "Enable the hourly firewall and 02:00 UTC export-check schedules after Azure bootstrap and connectivity gates pass."
}

variable "credit_period_start" {
  type        = string
  description = "Verified Azure credit-period start as an ISO UTC instant."

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.credit_period_start))
    error_message = "credit_period_start must be an ISO UTC instant."
  }
}

variable "budget_period_start" {
  type        = string
  description = "First-of-month UTC budget evaluation start, kept separate from the actual credit start."

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-01T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.budget_period_start))
    error_message = "budget_period_start must be an ISO UTC instant on the first day of a month, as required by Azure Cost Management budgets."
  }
}

variable "credit_period_end" {
  type        = string
  description = "Verified Azure credit-period end as an ISO UTC instant."

  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$", var.credit_period_end))
    error_message = "credit_period_end must be an ISO UTC instant."
  }
}

variable "credit_currency" {
  type        = string
  default     = "USD"
  description = "Verified credit currency used by budget and export-check metadata."

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.credit_currency))
    error_message = "credit_currency must be a three-letter ISO currency code."
  }
}

variable "credit_cost_mapping_verified" {
  type        = bool
  default     = false
  description = "Whether Cost Management data has been verified against the credit period; false keeps threshold automation visibly opt-in."
}

variable "alert_email" {
  type        = string
  description = "Human email receiving budget notifications."

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be a valid notification email address."
  }
}

variable "credit_budget_amount" {
  type        = number
  default     = 100
  description = "Credit-period budget amount in the verified credit currency."

  validation {
    condition     = var.credit_budget_amount == 100
    error_message = "The approved Azure for Students credit-period budget is 100."
  }
}

variable "monthly_burn_budget_amount" {
  type        = number
  default     = 8
  description = "Monthly burn warning amount in the verified credit currency."

  validation {
    condition     = var.monthly_burn_budget_amount > 0 && var.monthly_burn_budget_amount <= 8
    error_message = "monthly_burn_budget_amount must be positive and no more than the approved 8/month warning target."
  }
}

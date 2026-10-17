variable "subscription_id" {
  type        = string
  description = "Azure subscription ID (azurerm 4.x requires it explicitly)."

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.subscription_id))
    error_message = "subscription_id must be a GUID."
  }
}

variable "location" {
  type        = string
  default     = "polandcentral"
  description = "Azure region for every resource."
}

variable "github_repository" {
  type        = string
  default     = "YuvalAnteby/Can-I-Run-It"
  description = "owner/name of the GitHub repository whose production environment may deploy."
}

variable "api_image" {
  type        = string
  description = "Initial API image, pinned by digest (@sha256:...) or an immutable sha- tag. CI owns the image afterwards."

  validation {
    condition     = can(regex("@sha256:[0-9a-f]{64}$", var.api_image)) || can(regex(":sha-[0-9a-f]{7,40}$", var.api_image))
    error_message = "api_image must end with @sha256:<digest> or :sha-<commit>."
  }
}

variable "api_min_replicas" {
  type        = number
  default     = 0
  description = "Minimum API replicas: 0 (scale to zero) or 1 (always warm). The maximum is fixed at 1."

  validation {
    condition     = contains([0, 1], var.api_min_replicas)
    error_message = "api_min_replicas must be 0 or 1."
  }
}

variable "frontend_url" {
  type        = string
  default     = "https://can-i-run-it.pages.dev"
  description = "Public origin of the SPA (Cloudflare Pages). The API allows CORS only from this origin."

  validation {
    condition     = can(regex("^https://[a-z0-9.-]+/?$", var.frontend_url))
    error_message = "frontend_url must be an https origin with no path, e.g. https://can-i-run-it.pages.dev."
  }
}

variable "gemini_api_key" {
  type        = string
  sensitive   = true
  description = "Gemini API key, stored in Key Vault."
}

variable "rawg_api_key" {
  type        = string
  sensitive   = true
  description = "RAWG API key, stored in Key Vault."
}

variable "operator_object_id" {
  type        = string
  description = "Entra object ID of the operator running Terraform (Key Vault Secrets Officer, Postgres Entra admin)."

  validation {
    condition     = can(regex("^[0-9a-fA-F-]{36}$", var.operator_object_id))
    error_message = "operator_object_id must be a GUID."
  }
}

variable "operator_upn" {
  type        = string
  description = "User principal name of the operator, used as their Postgres role name."
}

variable "alert_email" {
  type        = string
  description = "Email address that receives metric alerts and budget notifications."

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}

variable "monthly_budget_usd" {
  type        = number
  default     = 8
  description = "Monthly budget for the production resource group, in the billing currency."

  validation {
    condition     = var.monthly_budget_usd > 0 && var.monthly_budget_usd <= 10
    error_message = "monthly_budget_usd must be between 0 and 10 (the demo's hard ceiling)."
  }
}

variable "abuse_protection" {
  description = "Backend abuse-protection limits (same defaults as infra/.env.example)."
  type = object({
    expensive_requests_per_ip_per_minute = optional(number, 10)
    expensive_requests_global_per_minute = optional(number, 100)
    gemini_requests_per_minute           = optional(number, 30)
    rawg_requests_per_minute             = optional(number, 60)
    gemini_max_concurrent                = optional(number, 2)
    rawg_max_concurrent                  = optional(number, 4)
    gemini_timeout_ms                    = optional(number, 8000)
    rawg_timeout_ms                      = optional(number, 3000)
  })
  default  = {}
  nullable = false
}

variable "observability_daily_cap_gb" {
  type        = number
  default     = 0.1
  description = "Daily ingestion cap for Log Analytics and Application Insights."

  validation {
    condition     = var.observability_daily_cap_gb > 0
    error_message = "observability_daily_cap_gb must be positive."
  }
}

variable "observability_retention_days" {
  type        = number
  default     = 30
  description = "Retention for Log Analytics and Application Insights, in days."

  validation {
    condition     = contains([30, 60, 90, 120, 180, 270, 365, 550, 730], var.observability_retention_days)
    error_message = "observability_retention_days must be one of Azure's supported retention values: 30, 60, 90, 120, 180, 270, 365, 550, or 730."
  }
}

variable "observability_sampling_ratio" {
  type        = number
  default     = 0.1
  description = "Trace sampling ratio passed to the backend's fixed percentage sampler."

  validation {
    condition     = var.observability_sampling_ratio >= 0 && var.observability_sampling_ratio <= 1
    error_message = "observability_sampling_ratio must be between 0 and 1."
  }
}

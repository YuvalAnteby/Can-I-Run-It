variable "container_app_name" {
  type        = string
  description = "Name of the existing application slot to manage."
}

variable "resource_group_name" {
  type        = string
  description = "Existing Azure resource group containing the Container App."
}

variable "container_app_environment_id" {
  type        = string
  description = "Resource ID of the existing Azure Container Apps environment."
}

variable "backend_image" {
  type        = string
  description = "Backend image reference to run."
}

variable "backend_port" {
  type        = number
  default     = 4000
  description = "Port used by the backend container, ingress, and HTTP probes."

  validation {
    condition     = var.backend_port >= 1 && var.backend_port <= 65535 && var.backend_port == floor(var.backend_port)
    error_message = "backend_port must be an integer from 1 through 65535."
  }
}

variable "environment_variables" {
  type        = map(string)
  default     = {}
  description = "Additional non-secret backend environment variables."
}

variable "secret_environment_variables" {
  type        = map(string)
  sensitive   = true
  default     = {}
  description = "Additional backend environment variables stored as Container App secrets."
}

variable "observability_enabled" {
  type        = bool
  default     = false
  description = "Whether this module owns optional Azure Monitor resources and injects telemetry settings."
}

variable "observability_location" {
  type        = string
  default     = ""
  description = "Azure region for optional observability resources. Required when observability_enabled is true."

  validation {
    condition     = !var.observability_enabled || trimspace(var.observability_location) != ""
    error_message = "observability_location is required when observability_enabled is true."
  }
}

variable "observability_daily_cap_gb" {
  type        = number
  default     = 0.1
  description = "Daily ingestion cap for the owned workspace and Application Insights resource."

  validation {
    condition     = var.observability_daily_cap_gb > 0
    error_message = "observability_daily_cap_gb must be positive."
  }
}

variable "observability_retention_days" {
  type        = number
  default     = 30
  description = "Retention for owned observability data, in supported Azure Log Analytics days."

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

variable "observability_action_group_ids" {
  type        = list(string)
  default     = []
  description = "Existing Azure Monitor action group IDs for the optional alerts."
}

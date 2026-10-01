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

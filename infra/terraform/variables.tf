variable "subscription_id" { type = string }
variable "tenant_id" { type = string }
variable "resource_group_name" { type = string }
variable "name_prefix" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}[a-z0-9]$", var.name_prefix))
    error_message = "name_prefix must be a 3–20 character lowercase resource prefix."
  }
}
variable "owner" { type = string }
variable "location" {
  type    = string
  default = "westeurope"
  validation {
    condition     = var.location == "westeurope"
    error_message = "Only approved West Europe is allowed; review architecture and cost before changing region."
  }
}
variable "postgres_server_name" { type = string }
variable "postgres_database" {
  type    = string
  default = "ciri"
}
variable "key_vault_name" { type = string }
variable "export_storage_account_name" { type = string }
variable "backend_image" {
  type = string
  validation {
    condition     = can(regex("^ghcr\\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$", var.backend_image))
    error_message = "backend_image must be a public GHCR immutable sha256 digest."
  }
}
variable "tools_image" {
  type = string
  validation {
    condition     = can(regex("^ghcr\\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$", var.tools_image))
    error_message = "tools_image must be a public GHCR immutable sha256 digest."
  }
}
variable "provider_secret_uris" {
  type        = map(string)
  default     = {}
  description = "Versionless existing provider secret URIs only; populate values outside Terraform."
  validation {
    condition     = alltrue([for name, uri in var.provider_secret_uris : contains(["RAWG_API_KEY", "GEMINI_API_KEY"], name) && can(regex("^https://${var.key_vault_name}\\.vault\\.azure\\.net/secrets/[a-zA-Z0-9-]+$", uri))])
    error_message = "Only RAWG/Gemini versionless URIs in this root's dedicated vault are accepted. Never pass secret values."
  }
}
variable "operator_ipv4_rules" {
  type        = map(string)
  default     = {}
  description = "Temporary exact current public IPs; remove in finally/always cleanup after SQL bootstrap."
  validation {
    condition     = length(var.operator_ipv4_rules) <= 3 && alltrue([for name, ip in var.operator_ipv4_rules : can(regex("^[a-z0-9-]{1,40}$", name)) && can(cidrnetmask("${ip}/32")) && !contains(["0.0.0.0", "255.255.255.255"], ip) && !can(regex("^(10|127|0|224|225|226|227|228|229|23[0-9]|24[0-9]|25[0-5])\\.", ip)) && !startswith(ip, "192.168.") && !can(regex("^172\\.(1[6-9]|2[0-9]|3[01])\\.", ip)) && !startswith(ip, "169.254.") && !can(regex("^100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.", ip)) && !can(regex("^192\\.(0\\.(0|2)|88\\.99)\\.", ip)) && !can(regex("^198\\.(1[89]|51\\.100)\\.", ip)) && !startswith(ip, "203.0.113.")])
    error_message = "At most three exact public IPv4 addresses; ranges, loopback, private, multicast and bypass IPs are rejected."
  }
}
variable "credit_period_start" {
  type = string
  validation {
    condition     = can(timeadd(var.credit_period_start, "0h"))
    error_message = "Actual credit start must be a UTC RFC3339 timestamp."
  }
}
variable "credit_period_end" {
  type = string
  validation {
    condition     = can(timeadd(var.credit_period_end, "0h")) && timecmp(var.credit_period_end, var.credit_period_start) > 0
    error_message = "credit_period_end must be a later UTC RFC3339 timestamp."
  }
}
variable "budget_period_start" {
  type        = string
  description = "Budget API requires first of month UTC; must be same calendar month as actual credit start. Cost Query always uses actual start."
  validation {
    condition     = can(regex("^[0-9]{4}-[0-9]{2}-01T00:00:00Z$", var.budget_period_start)) && substr(var.budget_period_start, 0, 7) == substr(var.credit_period_start, 0, 7)
    error_message = "Budget starts first of actual credit-start month; never reset the credit period January 1."
  }
}
variable "credit_currency" {
  type = string
  validation {
    condition     = var.credit_currency == "USD"
    error_message = "Approved 100/80/90 credit thresholds require USD; other currencies need explicit policy review."
  }
}
variable "alert_email" {
  type = string
  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+\\.[^@ ]+$", var.alert_email))
    error_message = "alert_email must be a budget notification email."
  }
}
variable "entitlement_verified" {
  type    = bool
  default = false
}
variable "verified_credit_cost_mapping" {
  type    = bool
  default = false
}
variable "maintenance_schedules_enabled" {
  type        = bool
  default     = false
  description = "Enable hourly firewall/daily checker only after human bootstrap, RBAC and egress connectivity acceptance."
}

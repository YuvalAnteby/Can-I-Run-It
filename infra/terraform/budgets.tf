resource "azurerm_consumption_budget_subscription" "credit" {
  name            = "${var.name_prefix}-credit-period"
  subscription_id = "/subscriptions/${var.subscription_id}"
  amount          = var.credit_budget_amount
  time_grain      = "Annually"

  time_period {
    start_date = var.budget_period_start
    end_date   = var.credit_period_end
  }

  dynamic "notification" {
    for_each = toset([80, 90])

    content {
      enabled        = true
      operator       = "GreaterThan"
      threshold      = notification.value
      threshold_type = "Actual"
      contact_emails = [var.alert_email]
    }
  }
}

resource "azurerm_consumption_budget_subscription" "monthly_burn" {
  name            = "${var.name_prefix}-monthly-burn"
  subscription_id = "/subscriptions/${var.subscription_id}"
  amount          = var.monthly_burn_budget_amount
  time_grain      = "Monthly"

  time_period {
    start_date = var.budget_period_start
    end_date   = var.credit_period_end
  }

  notification {
    enabled        = true
    operator       = "GreaterThan"
    threshold      = 100
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }
}

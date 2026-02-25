resource "aws_secretsmanager_secret" "ebay_credentials" {
  name                    = "${var.app_name}/${var.environment}/ebay-credentials"
  description             = "eBay OAuth credentials for the EbayLister backend"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "ebay_credentials" {
  secret_id = aws_secretsmanager_secret.ebay_credentials.id

  secret_string = jsonencode({
    EBAY_SANDBOX_CLIENT_ID        = var.ebay_sandbox_client_id
    EBAY_SANDBOX_CLIENT_SECRET    = var.ebay_sandbox_client_secret
    EBAY_PRODUCTION_CLIENT_ID     = var.ebay_production_client_id
    EBAY_PRODUCTION_CLIENT_SECRET = var.ebay_production_client_secret
  })

  # Prevent Terraform from re-applying this if you rotate the secret manually
  lifecycle {
    ignore_changes = [secret_string]
  }
}

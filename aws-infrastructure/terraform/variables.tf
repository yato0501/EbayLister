variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name used for resource naming"
  type        = string
  default     = "ebay-lister"
}

variable "environment" {
  description = "Deployment environment (staging or production)"
  type        = string
  default     = "staging"
}

variable "domain_name" {
  description = "Custom domain for the API (e.g. api.ebay.who-is-tou.com)"
  type        = string
}

variable "app_url" {
  description = "URL of the frontend app that the OAuth callback redirects to (e.g. http://localhost:8081)"
  type        = string
  default     = "http://localhost:8081"
}

variable "ebay_environment" {
  description = "eBay environment: sandbox or production"
  type        = string
  default     = "sandbox"
}

variable "ebay_sandbox_client_id" {
  description = "eBay Sandbox Client ID"
  type        = string
  sensitive   = true
}

variable "ebay_sandbox_client_secret" {
  description = "eBay Sandbox Client Secret"
  type        = string
  sensitive   = true
}

variable "ebay_production_client_id" {
  description = "eBay Production Client ID"
  type        = string
  sensitive   = true
}

variable "ebay_production_client_secret" {
  description = "eBay Production Client Secret"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key for Claude AI listing enhancement"
  type        = string
  sensitive   = true
}

variable "ebay_ru_name" {
  description = "eBay OAuth RuName (shown in Developer Portal under app OAuth settings). Used as redirect_uri in the OAuth flow."
  type        = string
  default     = ""
}

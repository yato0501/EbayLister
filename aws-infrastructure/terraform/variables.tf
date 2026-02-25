variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name used for naming resources"
  type        = string
  default     = "ebay-lister"
}

variable "environment" {
  description = "Deployment environment (staging or production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "domain_name" {
  description = "Your domain name for the backend (e.g. api.yourdomain.com). Required for HTTPS and eBay OAuth redirect URI."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# --- Container ---

variable "container_port" {
  description = "Port the Express server listens on"
  type        = number
  default     = 3001
}

variable "container_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "container_memory" {
  description = "Fargate task memory in MB"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of ECS task replicas to run"
  type        = number
  default     = 1
}

# --- eBay credentials (stored in Secrets Manager, not here) ---
# These are used during `terraform apply` to populate Secrets Manager.
# After initial setup, rotate them via the AWS Console or CLI.

variable "ebay_environment" {
  description = "Which eBay environment to target (sandbox or production)"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["sandbox", "production"], var.ebay_environment)
    error_message = "ebay_environment must be 'sandbox' or 'production'."
  }
}

variable "ebay_sandbox_client_id" {
  description = "eBay Sandbox Client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ebay_sandbox_client_secret" {
  description = "eBay Sandbox Client Secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ebay_production_client_id" {
  description = "eBay Production Client ID"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ebay_production_client_secret" {
  description = "eBay Production Client Secret"
  type        = string
  sensitive   = true
  default     = ""
}

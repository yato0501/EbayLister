terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Remote state — uncomment when ready to deploy (S3 bucket must exist first).
  # See README.md "One-Time Setup" for how to create the bucket.
  #
  # backend "s3" {
  #   bucket       = "ebay-lister-terraform-state"
  #   key          = "backend/terraform.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true   # replaces deprecated dynamodb_table in Terraform 1.14+
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.app_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state storage — create this S3 bucket and DynamoDB table manually
  # before running `terraform init`, or remove this block to use local state.
  backend "s3" {
    bucket         = "ebay-lister-terraform-state"   # change to your bucket name
    key            = "backend/terraform.tfstate"
    region         = "us-east-1"                     # change to your region
    dynamodb_table = "ebay-lister-terraform-locks"   # change to your table name
    encrypt        = true
  }
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

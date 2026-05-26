output "api_gateway_url" {
  description = "API Gateway default URL — usable immediately, before DNS is set up"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "backend_url" {
  description = "Custom domain URL (once DNS CNAME is configured)"
  value       = "https://${var.domain_name}"
}

output "redirect_uri" {
  description = "Set this as your eBay OAuth Redirect URI in the Developer Portal"
  value       = "https://${var.domain_name}/auth/ebay/callback"
}

output "lambda_function_name" {
  description = "Lambda function name — used by the deploy script"
  value       = aws_lambda_function.backend.function_name
}

output "dynamodb_table_name" {
  description = "DynamoDB table storing OAuth tokens"
  value       = aws_dynamodb_table.tokens.name
}

output "acm_validation_records" {
  description = "Add these DNS CNAME records at your DNS provider to validate the ACM certificate"
  value = {
    for dvo in aws_acm_certificate.backend.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "api_gateway_domain_target" {
  description = "Point api.ebay.who-is-tou.com CNAME to this value (after cert validation)"
  value       = aws_apigatewayv2_domain_name.backend.domain_name_configuration[0].target_domain_name
}

output "image_bucket_url" {
  description = "Public base URL for uploaded listing images"
  value       = "https://${aws_s3_bucket.images.bucket}.s3.amazonaws.com"
}

output "frontend_bucket" {
  description = "S3 bucket name for the Expo web build"
  value       = local.deploy_frontend ? aws_s3_bucket.frontend[0].id : ""
}

output "frontend_distribution_id" {
  description = "CloudFront distribution ID — used by deploy-web script for cache invalidation"
  value       = local.deploy_frontend ? aws_cloudfront_distribution.frontend[0].id : ""
}

output "frontend_cloudfront_domain" {
  description = "Point app.ebaylister.who-is-tou.com CNAME to this value"
  value       = local.deploy_frontend ? aws_cloudfront_distribution.frontend[0].domain_name : ""
}

output "frontend_acm_validation_records" {
  description = "DNS CNAME records needed to validate the frontend ACM certificate"
  value = local.deploy_frontend ? {
    for dvo in aws_acm_certificate.frontend[0].domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  } : {}
}

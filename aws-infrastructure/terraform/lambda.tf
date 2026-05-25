# Placeholder zip deployed on first `terraform apply`.
# The real code is deployed via: npm run deploy:lambda
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda_placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: JSON.stringify({ status: 'ok', message: 'Run: npm run deploy:lambda to deploy your code.' }) });"
    filename = "server/lambda.js"
  }
}

resource "aws_lambda_function" "backend" {
  filename         = data.archive_file.lambda_placeholder.output_path
  function_name    = "${var.app_name}-backend-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "server/lambda.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      NODE_ENV                      = var.environment
      EBAY_ENVIRONMENT              = var.ebay_environment
      DYNAMODB_TABLE_NAME           = aws_dynamodb_table.tokens.name
      REDIRECT_URI                  = var.ebay_ru_name != "" ? var.ebay_ru_name : "https://${var.domain_name}/auth/ebay/callback"
      APP_URL                       = var.app_url
      EBAY_SANDBOX_CLIENT_ID        = var.ebay_sandbox_client_id
      EBAY_SANDBOX_CLIENT_SECRET    = var.ebay_sandbox_client_secret
      EBAY_PRODUCTION_CLIENT_ID     = var.ebay_production_client_id
      EBAY_PRODUCTION_CLIENT_SECRET = var.ebay_production_client_secret
      ANTHROPIC_API_KEY             = var.anthropic_api_key
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }
}

# ── API Gateway v2 (HTTP API) ─────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "backend" {
  name          = "${var.app_name}-${var.environment}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.lambda.arn
    format          = jsonencode({ requestId = "$context.requestId", ip = "$context.identity.sourceIp", httpMethod = "$context.httpMethod", routeKey = "$context.routeKey", status = "$context.status", responseLength = "$context.responseLength" })
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_lambda_permission" "apigateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

# ── ACM certificate + custom domain ──────────────────────────────────────────

resource "aws_acm_certificate" "backend" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "backend" {
  certificate_arn         = aws_acm_certificate.backend.arn
  validation_record_fqdns = [for dvo in aws_acm_certificate.backend.domain_validation_options : dvo.resource_record_name]

  timeouts {
    create = "30m"
  }
}

resource "aws_apigatewayv2_domain_name" "backend" {
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.backend.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  depends_on = [aws_acm_certificate_validation.backend]
}

resource "aws_apigatewayv2_api_mapping" "backend" {
  api_id      = aws_apigatewayv2_api.backend.id
  domain_name = aws_apigatewayv2_domain_name.backend.id
  stage       = aws_apigatewayv2_stage.default.id
}

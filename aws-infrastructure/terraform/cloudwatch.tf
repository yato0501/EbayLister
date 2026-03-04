resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.app_name}-backend-${var.environment}"
  retention_in_days = 30
}

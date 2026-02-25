resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.app_name}-backend-${var.environment}"
  retention_in_days = 30
}

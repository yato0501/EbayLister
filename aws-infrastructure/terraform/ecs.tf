resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.app_name}-backend-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "${var.app_name}-backend"
    image = "${aws_ecr_repository.backend.repository_url}:latest"
    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    # Environment variables available at runtime
    environment = [
      { name = "PORT",             value = tostring(var.container_port) },
      { name = "EBAY_ENVIRONMENT", value = var.ebay_environment },
      { name = "REDIRECT_URI",     value = "https://${var.domain_name}/auth/ebay/callback" },
      { name = "REDIS_URL",        value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
    ]

    # eBay credentials injected from Secrets Manager — never stored in the image
    secrets = [
      { name = "EBAY_SANDBOX_CLIENT_ID",        valueFrom = "${aws_secretsmanager_secret.ebay_credentials.arn}:EBAY_SANDBOX_CLIENT_ID::" },
      { name = "EBAY_SANDBOX_CLIENT_SECRET",    valueFrom = "${aws_secretsmanager_secret.ebay_credentials.arn}:EBAY_SANDBOX_CLIENT_SECRET::" },
      { name = "EBAY_PRODUCTION_CLIENT_ID",     valueFrom = "${aws_secretsmanager_secret.ebay_credentials.arn}:EBAY_PRODUCTION_CLIENT_ID::" },
      { name = "EBAY_PRODUCTION_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.ebay_credentials.arn}:EBAY_PRODUCTION_CLIENT_SECRET::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ecs.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "backend"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "${var.app_name}-backend-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "${var.app_name}-backend"
    container_port   = var.container_port
  }

  # Avoid replacing the service on every image push
  # Force new deployments via the AWS CLI or CI/CD instead
  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.https]
}

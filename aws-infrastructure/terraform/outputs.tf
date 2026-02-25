output "alb_dns_name" {
  description = "ALB DNS name — use this to set up your domain's CNAME record"
  value       = aws_lb.main.dns_name
}

output "backend_url" {
  description = "Public HTTPS URL for the backend — use this as your REDIRECT_URI base"
  value       = "https://${var.domain_name}"
}

output "redirect_uri" {
  description = "Full eBay OAuth redirect URI — register this in the eBay Developer Portal"
  value       = "https://${var.domain_name}/auth/ebay/callback"
}

output "ecr_repository_url" {
  description = "ECR repository URL — push your Docker image here"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_push_commands" {
  description = "Commands to build and push the Docker image to ECR"
  value       = <<-EOT
    aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.backend.repository_url}
    docker build -t ${var.app_name}-backend -f ../docker/Dockerfile ../../EbayLister
    docker tag ${var.app_name}-backend:latest ${aws_ecr_repository.backend.repository_url}:latest
    docker push ${aws_ecr_repository.backend.repository_url}:latest
  EOT
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint — use this in the backend for token storage"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "secrets_manager_arn" {
  description = "ARN of the Secrets Manager secret holding eBay credentials"
  value       = aws_secretsmanager_secret.ebay_credentials.arn
}

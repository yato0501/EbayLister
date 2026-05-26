# ── Frontend: S3 + CloudFront + ACM ──────────────────────────────────────────
# Hosts the Expo web build at var.frontend_domain (e.g. app.who-is-tou.com).
# Only created when frontend_domain is set.

locals {
  deploy_frontend = var.frontend_domain != ""
}

resource "aws_s3_bucket" "frontend" {
  count  = local.deploy_frontend ? 1 : 0
  bucket = "${var.app_name}-frontend-${var.environment}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  count                   = local.deploy_frontend ? 1 : 0
  bucket                  = aws_s3_bucket.frontend[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  count                             = local.deploy_frontend ? 1 : 0
  name                              = "${var.app_name}-frontend-${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "frontend_cf" {
  count  = local.deploy_frontend ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowCloudFront"
      Effect = "Allow"
      Principal = {
        Service = "cloudfront.amazonaws.com"
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.frontend[0].arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend[0].arn
        }
      }
    }]
  })
}

resource "aws_acm_certificate" "frontend" {
  count             = local.deploy_frontend ? 1 : 0
  domain_name       = var.frontend_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "frontend" {
  count           = local.deploy_frontend ? 1 : 0
  certificate_arn = aws_acm_certificate.frontend[0].arn
  validation_record_fqdns = [
    for dvo in aws_acm_certificate.frontend[0].domain_validation_options : dvo.resource_record_name
  ]

  timeouts {
    create = "30m"
  }
}

resource "aws_cloudfront_distribution" "frontend" {
  count   = local.deploy_frontend ? 1 : 0
  enabled = true
  comment = "${var.app_name} frontend ${var.environment}"

  aliases = [var.frontend_domain]

  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend[0].bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
  }

  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    # HTML: short cache so deploys take effect quickly
    min_ttl     = 0
    default_ttl = 60
    max_ttl     = 300
  }

  # Cache static assets (JS/CSS/images) longer
  ordered_cache_behavior {
    path_pattern           = "/_expo/*"
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # SPA fallback: return index.html for 403/404 so client-side routing works
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.frontend]
}

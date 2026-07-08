output "api_alb_dns_name" {
  description = "Public DNS of the API load balancer."
  value       = aws_lb.api.dns_name
}

output "web_cloudfront_domain" {
  description = "CloudFront domain serving the web SPA."
  value       = aws_cloudfront_distribution.web.domain_name
}

output "ecr_repository_url" {
  description = "Push API images here."
  value       = aws_ecr_repository.api.repository_url
}

output "web_bucket" {
  description = "S3 bucket holding the built web assets."
  value       = aws_s3_bucket.web.id
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint (assemble DATABASE_URL with the managed password)."
  value       = aws_db_instance.main.endpoint
}

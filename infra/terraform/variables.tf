variable "project" {
  description = "Project name, used as a prefix for resource names."
  type        = string
  default     = "library-chat"
}

variable "environment" {
  description = "Deployment environment (prod, staging, ...)."
  type        = string
  default     = "prod"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to span (public + private subnet per AZ)."
  type        = number
  default     = 2
}

variable "api_image" {
  description = "Full image reference for the API container (ECR repo URL + tag)."
  type        = string
  default     = "library-chat-api:latest"
}

variable "api_container_port" {
  description = "Port the API listens on inside the container."
  type        = number
  default     = 3000
}

variable "api_cpu" {
  description = "Fargate task CPU units for the API."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate task memory (MiB) for the API."
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Number of API tasks to run."
  type        = number
  default     = 2
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL major/minor version (pgvector-capable)."
  type        = string
  default     = "17.4"
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "librarychat"
}

variable "db_username" {
  description = "Master username for RDS (password is managed by Secrets Manager)."
  type        = string
  default     = "librarychat"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB."
  type        = number
  default     = 20
}

variable "web_origin" {
  description = "Public origin of the web app, passed to the API for CORS / SSE headers."
  type        = string
  default     = "https://app.example.com"
}

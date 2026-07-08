# AI provider keys and the JWT secret live in Secrets Manager and are injected into
# the task as environment variables at runtime (see ecs.tf) — never baked into an
# image or committed. Values are set out-of-band (console / CLI / a rotation lambda);
# Terraform manages only the secret containers, not the plaintext.

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name        = "${local.name}/anthropic-api-key"
  description = "Anthropic API key for the chat + extraction models"
}

resource "aws_secretsmanager_secret" "voyage_api_key" {
  name        = "${local.name}/voyage-api-key"
  description = "Voyage API key for embeddings"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${local.name}/jwt-secret"
  description = "Signing secret for auth JWTs"
}

# Full DATABASE_URL (postgres://user:pass@host:5432/db). Assembled and set
# out-of-band once RDS exists, referencing the RDS-managed master password —
# keeps the app's single-DATABASE_URL contract and no plaintext in the repo.
resource "aws_secretsmanager_secret" "database_url" {
  name        = "${local.name}/database-url"
  description = "Postgres connection string for the API"
}

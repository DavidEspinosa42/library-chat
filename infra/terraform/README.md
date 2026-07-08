# infra/terraform

AWS deployment for library-chat, as Terraform. **Never applied in this exercise** —
`terraform fmt -check` and `terraform validate` run in CI; `plan` runs only when AWS
credentials are present. See the README's [AWS deployment design](../../README.md#aws-deployment-design)
for the reasoning.

## What it defines

- **Network** — VPC, one public + one private subnet per AZ, IGW, single NAT.
- **API** — ECR repo, ECS Fargate cluster/service/task, ALB (SSE-friendly idle timeout),
  scoped IAM (execution role reads exactly its secrets; empty task role).
- **Data** — RDS PostgreSQL 17 (Multi-AZ, encrypted, managed master password); pgvector
  is created by the app migration.
- **Secrets** — Secrets Manager holds the AI keys, JWT secret, and the assembled
  DATABASE_URL, injected into the task as env vars. No plaintext in the repo.
- **Web** — S3 (private) + CloudFront via Origin Access Control, with SPA fallback.

## Local check

```bash
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform validate
```

Secret values, TLS certificates/domains, and a remote state backend are intentionally
left to the deploying environment.

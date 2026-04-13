# Deployment Guide — Table of Contents

Step-by-step guides for everything we've done, organized by topic.

---

## Docs

| # | Guide | What's Covered |
|---|-------|---------------|
| 1 | [Local Development](./docs/01-local-development.md) | Dockerfiles, docker-compose, running locally |
| 2 | [Docker Hub](./docs/02-docker-hub.md) | Tag, push, multi-platform builds |
| 3 | [Docker on EC2](./docs/03-docker-on-ec2.md) | Install Docker on EC2, pull & run containers |
| 4 | [gimme-aws-creds](./docs/04-gimme-aws-creds.md) | Okta SSO setup, fetch temporary AWS credentials |
| 5 | [Amazon ECR](./docs/05-docker-ecr.md) | Create ECR repos, push/pull images, IAM roles |
| 6 | [PostgreSQL](./docs/06-postgresql.md) | Add PostgreSQL locally & with Docker Compose |
| 7 | [AWS RDS](./docs/07-aws-rds.md) | Managed PostgreSQL, SSL, connect from EC2 |

---

## Architecture

```
┌──────────────┐     docker push      ┌──────────────┐
│  Local Mac   │ ──────────────────►  │  Docker Hub   │
│  (build)     │                      │  (registry)   │
│              │ ──────────────────►  │  Amazon ECR   │
└──────────────┘                      └──────┬───────┘
                                             │ docker pull
                                             ▼
┌──────────────┐                      ┌──────────────┐
│ PostgreSQL   │◄─────────────────────│   AWS EC2     │
│ (container   │                      │  (deploy)     │
│  or RDS)     │                      └──────────────┘
└──────────────┘
```

---

## Quick Reference

```bash
# Fetch AWS creds
gimme-aws-creds
export AWS_PROFILE="watch-audiotools-nonprod-/DEVADMIN"

# ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Push to ECR
docker tag <image> <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/<repo>:<tag>
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/<repo>:<tag>

# Run on EC2
docker compose up -d
```

---

## Upcoming

- [x] Push updated images to ECR
- [x] Run on EC2 with PostgreSQL container
- [x] Switch to AWS RDS (managed PostgreSQL)
- [ ] Kubernetes (EKS) + RDS
- [ ] Argo CD — GitOps workflow
- [ ] CI/CD pipeline

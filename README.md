# MERN Note App — Docker, Kubernetes & Argo CD

A full-stack note-taking app demonstrating modern DevOps: Docker → Docker Hub → ECR → EC2 → (upcoming) EKS + Argo CD.

## Tech Stack

- **Frontend:** React 18, React Router — Port 3000
- **Backend:** Node.js, Express, REST API — Port 5000
- **Database:** PostgreSQL
- **DevOps:** Docker, Docker Hub, Amazon ECR, AWS EC2

## Quick Start

```bash
docker-compose up -d
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000
```

## Docker Images

| Image | Registry |
|-------|----------|
| `sanyam23411/note-app-backend:v1` | Docker Hub |
| `sanyam23411/note-app-frontend:v1` / `v2` | Docker Hub |
| `598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1` | Amazon ECR |
| `598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v1` / `v2` | Amazon ECR |

## 📚 Documentation

All guides are in the [`docs/`](./docs/) folder:

| Guide | Description |
|-------|-------------|
| [01 - Local Development](./docs/01-local-development.md) | Dockerfiles, docker-compose, run locally |
| [02 - Docker Hub](./docs/02-docker-hub.md) | Tag, push, multi-platform builds |
| [03 - Docker on EC2](./docs/03-docker-on-ec2.md) | Install Docker, pull & run on EC2 |
| [04 - gimme-aws-creds](./docs/04-gimme-aws-creds.md) | Okta SSO, temporary AWS credentials |
| [05 - Amazon ECR](./docs/05-docker-ecr.md) | ECR repos, push/pull, IAM roles |
| [06 - PostgreSQL](./docs/06-postgresql.md) | Add PostgreSQL locally & with Docker Compose |

See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) for the full overview.

## Project Structure

```
note-app/
├── backend/
│   ├── Dockerfile
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   └── package.json
├── docs/
│   ├── 01-local-development.md
│   ├── 02-docker-hub.md
│   ├── 03-docker-on-ec2.md
│   ├── 04-gimme-aws-creds.md
│   ├── 05-docker-ecr.md
│   └── 06-postgresql.md
├── docker-compose.yml
├── DEPLOYMENT-GUIDE.md
└── README.md
```

## Roadmap

- [x] MERN app development
- [x] Docker containerization
- [x] Docker Hub push
- [x] Multi-platform builds (ARM + AMD64)
- [x] AWS EC2 deployment
- [x] Amazon ECR integration
- [x] PostgreSQL integration
- [ ] Push updated images to ECR
- [ ] Run on EC2 with PostgreSQL
- [ ] AWS RDS (managed PostgreSQL)
- [ ] Kubernetes (EKS) + RDS
- [ ] Argo CD — GitOps
- [ ] CI/CD pipeline

## Author

**Sanyam Sharma**
- Docker Hub: [@sanyam23411](https://hub.docker.com/u/sanyam23411)

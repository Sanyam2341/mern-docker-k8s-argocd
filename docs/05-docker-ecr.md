# Push & Pull Docker Images with Amazon ECR

## What is ECR?

Amazon Elastic Container Registry — AWS's own Docker image registry. Like Docker Hub, but private and integrated with AWS IAM.

**Docker Hub is NOT needed for ECR** — they are completely independent registries.

---

## Private vs Public ECR

| | Private | Public |
|---|---|---|
| Who can pull? | Only authorized AWS users/services | Anyone on the internet |
| Use case | Internal/company apps | Open source projects |
| URL format | `<account>.dkr.ecr.<region>.amazonaws.com/repo` | `public.ecr.aws/abc123/repo` |

**Use Private** for company/internal applications.

---

## ECR Repository Structure

- **One repo per image** (e.g., `note-app-backend`, `note-app-frontend`)
- **Multiple tags** in the same repo (e.g., `v1`, `v2`, `latest`)
- Namespaces are optional (e.g., `team/repo-name`)

---

## Prerequisites

- AWS CLI installed
- AWS credentials configured (see [gimme-aws-creds guide](./04-gimme-aws-creds.md))
- Docker Desktop running
- AWS profile set: `export AWS_PROFILE="<your-profile>"`

---

## Step 1: Create ECR Repositories

**Via CLI:**
```bash
aws ecr create-repository --repository-name note-app-backend --region us-east-1
```

**Via AWS Console:**
1. Go to https://console.aws.amazon.com/ecr
2. Ensure region is `us-east-1`
3. Click "Create repository"
4. Visibility: Private
5. Name: `note-app-frontend`
6. Tag mutability: Mutable
7. Encryption: AES-256 (default)
8. Click "Create"

---

## Step 2: Authenticate Docker to ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

- `aws ecr get-login-password` → generates a temporary Docker password using your AWS creds
- `docker login` → feeds that password to Docker
- Username is always `AWS` for ECR
- Token expires after 12 hours

> ⚠️ Common typo: make sure it's `dkr.ecr.us-east-1` NOT `dkr.ecr.ecr.us-east-1`

---

## Step 3: Tag & Push to ECR

There are **two ways** to push images to ECR:

### Way 1: Tag & Push (single architecture)

Pushes the image that's already built locally. Only works for your machine's architecture.

```bash
# Tag
docker tag <local-image> <ecr-url>/<repo>:<tag>

# Push
docker push <ecr-url>/<repo>:<tag>
```

Example:
```bash
docker tag sanyam23411/note-app-backend:v1 <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1
docker push <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1
```

> ⚠️ Use image names (not IDs) to avoid tagging the wrong image!
> ⚠️ If built on Mac (ARM), may not run on EC2 (AMD64).

### Way 2: Buildx Build & Push (multi-architecture) ✅ Recommended

Builds for both ARM + AMD64 and pushes directly to ECR in one command.

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <ecr-url>/<repo>:<tag> --push ./<service-folder>
```

Example:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v2 --push ./backend
docker buildx build --platform linux/amd64,linux/arm64 -t <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2 --push ./frontend
```

**When to use which?**
- Way 1 → quick push, same architecture, testing
- Way 2 → production, multi-arch, works everywhere

> Tagging and pushing can ONLY be done via CLI — not from the AWS Console UI.

---

## Step 5: Pull from ECR on EC2

### Option A (Recommended): Attach IAM Role to EC2

No manual credentials needed on EC2.

1. **Create IAM Role:**
   - Go to IAM Console → Roles → Create role
   - Trusted entity: AWS service → EC2
   - Policy: `AmazonEC2ContainerRegistryReadOnly` (or `FullAccess`)
   - Name: `ec2-ecr-role`

2. **Attach to EC2:**
   - EC2 Console → Select instance → Actions → Security → Modify IAM role
   - Select `ec2-ecr-role` → Update

### Option B: Login manually on EC2

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
```

### Why is docker login still needed with an IAM role?

- **IAM Role** = gives EC2 *permission* to access ECR (like having a key to the building)
- **docker login** = authenticates Docker itself (like swiping your badge at the door)
- Docker doesn't understand IAM natively — it needs its own auth token

### Pull the images:

```bash
docker pull <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v2
docker pull <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
```

---

## Step 6: Run on EC2 with docker-compose.yml

Update `docker-compose.yml` on EC2 to use ECR images + PostgreSQL:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: <your-db-password>
      POSTGRES_DB: notesdb
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U root -d notesdb"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    image: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v2
    ports:
      - '5000:5000'
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_HOST: postgres
      DB_USER: root
      DB_PASSWORD: <your-db-password>
      DB_NAME: notesdb
      DB_PORT: 5432

  frontend:
    image: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
    ports:
      - '3000:3000'
    depends_on:
      - backend

volumes:
  pgdata:
```

**Key differences from local docker-compose.yml:**
- `image:` instead of `build:` (no source code on EC2)
- Images point to ECR URLs
- Postgres image is pulled directly from Docker Hub (official, no ECR needed)

```bash
docker compose up -d
docker compose logs backend    # should see "Notes table ready"
```

### ECR Images Summary

| Image | Tag | Description |
|---|---|---|
| note-app-backend | v1 | Without PostgreSQL |
| note-app-backend | v2 | With PostgreSQL |
| note-app-frontend | v1, v2 | Frontend (no DB changes) |

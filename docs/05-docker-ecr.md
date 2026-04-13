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
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 598917779747.dkr.ecr.us-east-1.amazonaws.com
```

- `aws ecr get-login-password` → generates a temporary Docker password using your AWS creds
- `docker login` → feeds that password to Docker
- Username is always `AWS` for ECR
- Token expires after 12 hours

> ⚠️ Common typo: make sure it's `dkr.ecr.us-east-1` NOT `dkr.ecr.ecr.us-east-1`

---

## Step 3: Tag Images for ECR

Format: `<account>.dkr.ecr.<region>.amazonaws.com/<repo-name>:<tag>`

```bash
docker tag sanyam23411/note-app-backend:v1 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1

docker tag sanyam23411/note-app-frontend:v1 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v1

docker tag sanyam23411/note-app-frontend:v2 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
```

> ⚠️ Use image names (not IDs) to avoid tagging the wrong image!

---

## Step 4: Push to ECR

```bash
docker push 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1

docker push 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v1

docker push 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
```

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
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 598917779747.dkr.ecr.us-east-1.amazonaws.com
```

### Why is docker login still needed with an IAM role?

- **IAM Role** = gives EC2 *permission* to access ECR (like having a key to the building)
- **docker login** = authenticates Docker itself (like swiping your badge at the door)
- Docker doesn't understand IAM natively — it needs its own auth token

### Pull the images:

```bash
docker pull 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1
docker pull 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v1
docker pull 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
```

---

## Step 6: Run Containers from ECR Images

```bash
docker run -d -p 5000:5000 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1
docker run -d -p 3000:3000 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
```

Or update `docker-compose.yml` to use ECR images:

```yaml
services:
  backend:
    image: 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v1
    ports:
      - "5000:5000"

  frontend:
    image: 598917779747.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

```bash
docker compose up -d
```

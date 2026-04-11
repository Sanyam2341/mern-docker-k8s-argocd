# MERN Note-Taking App - Complete Deployment Guide

## Project Overview
A full-stack note-taking application built with MERN stack, containerized with Docker, and deployed to AWS.

---

## Phase 1: Local Development & Containerization

### Step 1.1: Create MERN Application

**What we did:** Built a note-taking app with separate backend and frontend

**Backend (Node.js + Express):**
- Created `backend/server.js`
- REST API endpoints: GET/POST/DELETE /notes, GET /health
- Port: 5000

**Frontend (React):**
- Created React app with routing
- Pages: Home, Notes, About
- Port: 3000

**Files created:**
```
note-app/
├── backend/
│   ├── server.js
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.js
    │   ├── pages/
    │   │   ├── Home.js
    │   │   ├── Notes.js
    │   │   └── About.js
    └── package.json
```

---

### Step 1.2: Create Dockerfiles

**What we did:** Created Docker images for both services

**Backend Dockerfile** (`backend/Dockerfile`):
```dockerfile
FROM node:25-alpine3.22
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

**Frontend Dockerfile** (`frontend/Dockerfile`):
```dockerfile
FROM node:25-alpine3.22
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

**Why these steps:**
- `FROM node:25-alpine3.22` - Base image with Node.js
- `WORKDIR /app` - Set working directory
- `COPY package*.json` - Copy dependencies first (caching)
- `RUN npm install` - Install packages
- `COPY . .` - Copy source code
- `EXPOSE` - Document port
- `CMD` - Start command

---

### Step 1.3: Create .dockerignore Files

**What we did:** Prevent unnecessary files from being copied into containers

**Both `backend/.dockerignore` and `frontend/.dockerignore`:**
```
node_modules
```

**Why:** node_modules is huge and gets installed fresh in container

---

### Step 1.4: Create docker-compose.yml

**What we did:** Orchestrate both containers together

**File:** `note-app/docker-compose.yml`
```yaml
services:
  backend:
    build: ./backend
    ports:
      - "5000:5000"
  
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

**Key concepts:**
- `services:` - Define containers
- `build:` - Path to Dockerfile
- `ports:` - "host:container" mapping
- `depends_on:` - Start order

---

### Step 1.5: Run Locally with Docker

**Commands:**
```bash
# Start containers
docker-compose up -d

# Check running containers
docker ps

# View logs
docker-compose logs

# Stop containers
docker-compose down
```

**Access:**
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

---

## Phase 2: Push to Docker Hub

### Step 2.1: Create Docker Hub Account

**What we did:** Signed up at https://hub.docker.com

**Username:** sanyam23411

---

### Step 2.2: Login to Docker Hub

**Command:**
```bash
docker login
```

**What it does:** Authenticates your local Docker with Docker Hub

---

### Step 2.3: Tag Images

**Commands:**
```bash
docker tag note-app-backend:latest sanyam23411/note-app-backend:v1
docker tag note-app-frontend:latest sanyam23411/note-app-frontend:v1
```

**Format:** `username/image-name:tag`

**Why:** Docker Hub requires images to be tagged with your username

---

### Step 2.4: Push Images to Docker Hub

**Commands:**
```bash
docker push sanyam23411/note-app-backend:v1
docker push sanyam23411/note-app-frontend:v1
```

**What it does:** Uploads images to Docker Hub cloud storage

---

### Step 2.5: Build Multi-Platform Images

**Problem:** Mac uses ARM, EC2 uses AMD64

**Solution:**
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t sanyam23411/note-app-backend:v1 --push ./backend

docker buildx build --platform linux/amd64,linux/arm64 -t sanyam23411/note-app-frontend:v1 --push ./frontend
```

**Why:** Creates images that work on both architectures

---

## Phase 3: Deploy to AWS EC2

### Step 3.1: Launch EC2 Instance

**What we did:** Created Amazon Linux 2023 EC2 instance

**Instance details:**
- AMI: Amazon Linux 2023
- Instance type: t2.micro (or similar)
- Security group: Allow ports 22, 3000, 5000

---

### Step 3.2: SSH into EC2

**Command:**
```bash
ssh -i your-key.pem ec2-user@YOUR_EC2_IP
```

---

### Step 3.3: Install Docker on EC2

**Commands:**
```bash
# Update system
sudo yum update -y

# Install Docker
sudo yum install docker -y

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -a -G docker ec2-user

# Apply group changes
newgrp docker

# Verify
docker --version
```

---

### Step 3.4: Install docker-compose on EC2

**Commands:**
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

sudo chmod +x /usr/local/bin/docker-compose

docker-compose --version
```

**Or use full path:**
```bash
/usr/local/lib/docker/cli-plugins/docker-compose --version
```

---

### Step 3.5: Pull Images from Docker Hub

**Commands:**
```bash
docker pull sanyam23411/note-app-backend:v1
docker pull sanyam23411/note-app-frontend:v1
```

---

### Step 3.6: Create docker-compose.yml on EC2

**Command:**
```bash
nano docker-compose.yml
```

**Content:**
```yaml
services:
  backend:
    image: sanyam23411/note-app-backend:v1
    ports:
      - "5000:5000"
  
  frontend:
    image: sanyam23411/note-app-frontend:v1
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

**Key difference from local:** Use `image:` instead of `build:`

---

### Step 3.7: Run Containers on EC2

**Command:**
```bash
docker-compose up -d
```

**Or with full path:**
```bash
/usr/local/lib/docker/cli-plugins/docker-compose up -d
```

---

### Step 3.8: Configure Security Group

**What we did:** Allowed inbound traffic on ports 3000 and 5000

**AWS Console steps:**
1. Go to EC2 → Security Groups
2. Select your instance's security group
3. Edit inbound rules
4. Add rules:
   - Port 3000, Source: 0.0.0.0/0
   - Port 5000, Source: 0.0.0.0/0

---

### Step 3.9: Access App on EC2

**Get EC2 public IP:**
```bash
curl http://checkip.amazonaws.com
```

**Access in browser:**
- Frontend: http://YOUR_EC2_IP:3000
- Backend: http://YOUR_EC2_IP:5000

---

## Useful Docker Commands

### Container Management
```bash
# List running containers
docker ps

# List all containers
docker ps -a

# Start container
docker start <container-name>

# Stop container
docker stop <container-name>

# Remove container
docker rm <container-name>

# View logs
docker logs <container-name>
```

### Image Management
```bash
# List images
docker images

# Remove image
docker rmi <image-name>

# Pull image
docker pull <image-name>

# Tag image
docker tag <source> <target>
```

### docker-compose Commands
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs

# Restart services
docker-compose restart
```

---

## Next Steps (Upcoming)

### Phase 4A: Amazon ECR
- Create ECR repositories
- Push images to ECR
- Pull from ECR

### Phase 4B: Kubernetes + EKS
- Create Kubernetes YAML files
- Set up EKS cluster
- Deploy to Kubernetes

### Phase 4C: Argo CD
- Install Argo CD on EKS
- Connect GitHub repository
- Auto-deploy on code changes

---

## Troubleshooting

### Port already in use
```bash
# Find process using port
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Container won't start
```bash
# Check logs
docker logs <container-name>

# Check if image exists
docker images
```

### Can't connect to Docker daemon
```bash
# Start Docker
sudo systemctl start docker

# Check status
sudo systemctl status docker
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│           User's Browser                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Frontend (React - Port 3000)       │
│  - Home, Notes, About pages             │
│  - Makes HTTP requests to backend       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│    Backend (Express API - Port 5000)    │
│  - REST endpoints: /notes, /health      │
│  - In-memory data storage               │
└─────────────────────────────────────────┘
```

---

## Key Learnings

1. **Containerization** - Packages app with all dependencies
2. **Docker vs docker-compose** - Single vs multiple containers
3. **Multi-platform builds** - ARM (Mac) vs AMD64 (EC2)
4. **Container registries** - Docker Hub for image storage
5. **Cloud deployment** - Running containers on EC2
6. **Port mapping** - Connecting host to container ports
7. **Security groups** - AWS firewall rules

---

## Files Summary

```
note-app/
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── src/
│   │   ├── App.js
│   │   └── pages/
│   └── package.json
├── docker-compose.yml
└── DEPLOYMENT-GUIDE.md (this file)
```

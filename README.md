# MERN Docker Kubernetes Argo CD

A full-stack note-taking application demonstrating modern DevOps practices with Docker, Kubernetes, and GitOps using Argo CD.

## 🚀 Features

- **Full-stack MERN application** (MongoDB, Express, React, Node.js)
- **Dockerized microservices** architecture
- **Multi-platform Docker images** (ARM64 & AMD64)
- **Cloud deployment** on AWS EC2
- **Container orchestration** with docker-compose
- **CI/CD ready** for Kubernetes and Argo CD

## 📋 Tech Stack

### Frontend
- React 18
- React Router
- CSS3

### Backend
- Node.js
- Express.js
- REST API

### DevOps
- Docker & docker-compose
- Docker Hub
- AWS EC2
- Amazon ECR (upcoming)
- Kubernetes (upcoming)
- Argo CD (upcoming)

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           User's Browser                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Frontend (React - Port 3000)       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│    Backend (Express API - Port 5000)    │
└─────────────────────────────────────────┘
```

## 🚦 Getting Started

### Prerequisites

- Node.js 18+
- Docker & docker-compose
- AWS account (for cloud deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/mern-docker-k8s-argocd.git
   cd mern-docker-k8s-argocd
   ```

2. **Run with Docker**
   ```bash
   docker-compose up -d
   ```

3. **Access the application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5000

### Stop the application
```bash
docker-compose down
```

## 📦 Docker Images

Images are available on Docker Hub:
- Backend: `sanyam23411/note-app-backend:v1`
- Frontend: `sanyam23411/note-app-frontend:v1` / `sanyam23411/note-app-frontend:v2`

> **Note:** Docker Desktop (or an alternative like Colima/Podman) must be running for any `docker` command (build, push, pull). You can close it once the push is complete — images are stored on Docker Hub.

### Pull images
```bash
docker pull sanyam23411/note-app-backend:v1
docker pull sanyam23411/note-app-frontend:v2
```

## ☁️ AWS EC2 Deployment

See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) for detailed deployment instructions.

### Quick Deploy to EC2

1. **Install Docker on EC2**
   ```bash
   sudo yum update -y
   sudo yum install docker -y
   sudo systemctl start docker
   sudo usermod -a -G docker ec2-user
   ```

2. **Install docker-compose**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

3. **Run the application**
   ```bash
   docker-compose up -d
   ```

4. **Configure Security Group**
   - Allow inbound traffic on ports 3000 and 5000

## 📚 Documentation

- [Complete Deployment Guide](./DEPLOYMENT-GUIDE.md) - Detailed step-by-step instructions
- [Backend API Documentation](./backend/README.md) - API endpoints and usage
- [Frontend Documentation](./frontend/README.md) - Component structure and routing

## 🛠️ Development

### Project Structure

```
mern-docker-k8s-argocd/
├── backend/
│   ├── Dockerfile
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   └── package.json
├── docker-compose.yml
├── DEPLOYMENT-GUIDE.md
└── README.md
```

### Build Docker images locally

```bash
# Backend
docker build -t note-app-backend ./backend

# Frontend
docker build -t note-app-frontend ./frontend
```

### Build multi-platform images

> `docker buildx` uses BuildKit to build for multiple architectures. `--push` pushes directly to Docker Hub since multi-arch images can't be stored locally. Docker Desktop must be running for this.

```bash
docker buildx create --use --name mybuilder   # one-time setup
docker buildx build --platform linux/amd64,linux/arm64 -t sanyam23411/note-app-backend:v1 --push ./backend
docker buildx build --platform linux/amd64,linux/arm64 -t sanyam23411/note-app-frontend:v2 --push ./frontend
```

> After pushing, you can close Docker Desktop — images live on Docker Hub and can be pulled from anywhere.

## 🔜 Roadmap

- [x] MERN application development
- [x] Docker containerization
- [x] Docker Hub integration
- [x] AWS EC2 deployment
- [ ] Amazon ECR integration
- [ ] Kubernetes manifests
- [ ] EKS cluster setup
- [ ] Argo CD installation
- [ ] GitOps workflow
- [ ] CI/CD pipeline

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 👤 Author

**Sanyam Sharma**
- Docker Hub: [@sanyam23411](https://hub.docker.com/u/sanyam23411)
- GitHub: [@YOUR_GITHUB_USERNAME](https://github.com/YOUR_GITHUB_USERNAME)

## 🙏 Acknowledgments

- Built as a learning project for Docker, Kubernetes, and Argo CD
- Part of DevOps learning journey

---

⭐ Star this repo if you find it helpful!

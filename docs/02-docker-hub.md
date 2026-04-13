# Push Images to Docker Hub

## Prerequisites
- Docker Desktop running
- Docker Hub account (https://hub.docker.com)

---

## Step 1: Login to Docker Hub

```bash
docker login
```

Enter your Docker Hub username and password.

---

## Step 2: Tag Images

Docker Hub requires images tagged as `username/image-name:tag`:

```bash
docker tag note-app-backend:latest sanyam23411/note-app-backend:v1
docker tag note-app-frontend:latest sanyam23411/note-app-frontend:v1
```

---

## Step 3: Push Images

```bash
docker push sanyam23411/note-app-backend:v1
docker push sanyam23411/note-app-frontend:v1
```

---

## Step 4: Build Multi-Platform Images

**Problem:** Mac uses ARM (Apple Silicon), EC2 uses AMD64 (x86). An image built on Mac won't run on EC2.

**Solution:** Use `docker buildx` to build for both architectures:

```bash
# One-time: create a multi-platform builder
docker buildx create --use --name mybuilder

# Build & push (--push is required because multi-arch images can't be stored locally)
docker buildx build --platform linux/amd64,linux/arm64 -t sanyam23411/note-app-backend:v1 --push ./backend
docker buildx build --platform linux/amd64,linux/arm64 -t sanyam23411/note-app-frontend:v2 --push ./frontend
```

Once pushed, you can close Docker Desktop — images live on Docker Hub.

---

## Pull Images (from any machine)

```bash
docker pull sanyam23411/note-app-backend:v1
docker pull sanyam23411/note-app-frontend:v2
```

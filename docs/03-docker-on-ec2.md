# Deploy Docker Containers on EC2

## Step 1: Launch EC2 Instance

- AMI: Amazon Linux 2023
- Instance type: t2.micro
- Security group: Allow ports 22 (SSH), 3000 (frontend), 5000 (backend)

---

## Step 2: SSH into EC2

```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
```

---

## Step 3: Install Docker

```bash
sudo yum update -y
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user
newgrp docker

# Verify
docker --version
```

---

## Step 4: Install docker-compose

**Option A:** If `docker compose` (v2 plugin) is already available:
```bash
docker compose version
```

**Option B:** Install standalone docker-compose:
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

> Note: `docker compose` (with space, v2) vs `docker-compose` (with hyphen, v1). Newer Docker versions use v2.

---

## Step 5: Pull Images

```bash
docker pull sanyam23411/note-app-backend:v1
docker pull sanyam23411/note-app-frontend:v2
```

---

## Step 6: Create docker-compose.yml on EC2

```bash
nano docker-compose.yml
```

```yaml
services:
  backend:
    image: sanyam23411/note-app-backend:v1
    ports:
      - "5000:5000"

  frontend:
    image: sanyam23411/note-app-frontend:v2
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

**Key difference from local:** Uses `image:` (pull from registry) instead of `build:` (build from Dockerfile).

---

## Step 7: Run Containers

```bash
docker compose up -d
docker ps                  # verify
```

---

## Step 8: Configure Security Group

In AWS Console → EC2 → Security Groups → Edit inbound rules:

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 22 | TCP | Your IP | SSH |
| 3000 | TCP | 0.0.0.0/0 | Frontend |
| 5000 | TCP | 0.0.0.0/0 | Backend |

---

## Step 9: Access the App

```bash
curl http://checkip.amazonaws.com    # get EC2 public IP
```

- Frontend: `http://<EC2_PUBLIC_IP>:3000`
- Backend: `http://<EC2_PUBLIC_IP>:5000`

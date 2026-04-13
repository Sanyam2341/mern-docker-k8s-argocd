# Local Development & Containerization

## Project Structure

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
│   └── package.json
├── docker-compose.yml
└── docs/
```

---

## Step 1: Run Without Docker

```bash
# Backend
cd backend
npm install
node server.js        # runs on http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm start             # runs on http://localhost:3000
```

---

## Step 2: Create Dockerfiles

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

**Why this order?**
- `COPY package*.json` first → Docker caches `npm install` layer, so rebuilds are faster when only code changes

---

## Step 3: Create .dockerignore

Both `backend/.dockerignore` and `frontend/.dockerignore`:
```
node_modules
```

Why: `node_modules` is huge and gets installed fresh inside the container via `npm install`.

---

## Step 4: Create docker-compose.yml

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

- `build:` → builds image from Dockerfile in that path
- `ports:` → "host:container" mapping
- `depends_on:` → starts backend before frontend

---

## Step 5: Run with Docker Compose

```bash
docker-compose up -d          # start in background
docker ps                     # verify running
docker-compose logs           # view logs
docker-compose down           # stop & remove containers
```

**Access:**
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

---

## Important: Docker Desktop Must Be Running

On macOS, Docker Desktop IS the Docker daemon. Without it running, no `docker` command works.

**Options:**
- Set Docker Desktop to auto-start on login (Settings → General)
- Start from terminal: `open -a Docker`
- Lightweight alternative: [Colima](https://github.com/abiosoft/colima) (`brew install colima && colima start`)

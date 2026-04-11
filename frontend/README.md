# Note App - Frontend

React 19 frontend for the note-taking app. Pages: Home, Notes, About. Uses React Router for navigation.

## Run Locally
```bash
npm install && npm start   # http://localhost:3000
```

## Docker
```bash
docker build -t note-app-frontend .                # local build
docker buildx build --platform linux/amd64,linux/arm64 -t sanyam23411/note-app-frontend:v2 --push .  # multi-arch push
```

> Docker Desktop must be running for build/push. You can close it after the push — images are stored on Docker Hub.

## Docker Hub
- Image: `sanyam23411/note-app-frontend:v2`
- Pull: `docker pull sanyam23411/note-app-frontend:v2`

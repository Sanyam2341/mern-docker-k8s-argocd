# Adding PostgreSQL to the App

## Why PostgreSQL?

Previously the backend used an in-memory array — data was lost on every restart. Now we use PostgreSQL so notes persist.

---

## Phase 1: PostgreSQL Locally (without Docker)

### Step 1: Install pg client library

```bash
cd backend
npm install pg
```

Adds the `pg` package — Node.js client for PostgreSQL.

### Step 2: Install PostgreSQL on Mac

```bash
brew install postgresql@16
brew services start postgresql@16
```

### Step 3: Create the database

```bash
createdb notesdb
```

Verify:
```bash
psql notesdb    # should open psql prompt
\q              # exit
```

### Step 4: Update backend/server.js

Replace in-memory storage with PostgreSQL:

**What changed:**
- Added `const { Pool } = require('pg')` import
- Replaced `let notes = []` with a PostgreSQL connection pool
- `CREATE TABLE IF NOT EXISTS notes` runs on startup
- GET/POST/DELETE routes now use SQL queries instead of array operations

**Key code — PostgreSQL connection:**
```javascript
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notesdb',
  port: process.env.DB_PORT || 5432,
});
```

Uses environment variables with fallback defaults — works both locally and in Docker.

**Key code — SQL queries:**
```javascript
// GET all notes
const result = await pool.query('SELECT * FROM notes ORDER BY id DESC');

// POST create note
const result = await pool.query(
  'INSERT INTO notes (title, content) VALUES ($1, $2) RETURNING *',
  [title, content]
);

// DELETE note
await pool.query('DELETE FROM notes WHERE id = $1', [parseInt(req.params.id)]);
```

### Step 5: Test locally

```bash
cd backend
node server.js
# Should see: Backend running on http://localhost:5000
# Should see: Notes table ready
```

```bash
# Create a note
curl -X POST http://localhost:5000/notes -H "Content-Type: application/json" -d '{"title":"Test","content":"Hello PostgreSQL!"}'

# Get all notes
curl http://localhost:5000/notes
```

Notes persist across server restarts!

---

## Phase 2: PostgreSQL with Docker Compose

### docker-compose.yml — 3 services now

```yaml
services:
  frontend:
    depends_on:
      - backend
    build: ./frontend
    ports:
      - '3000:3000'

  backend:
    build: ./backend
    ports:
      - '5000:5000'
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_HOST: postgres
      DB_USER: root
      DB_PASSWORD: root123
      DB_NAME: notesdb
      DB_PORT: 5432

  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: root123
      POSTGRES_DB: notesdb
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U root -d notesdb"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### Key concepts explained:

**`image: postgres:16-alpine`**
- Official PostgreSQL image from Docker Hub. No Dockerfile needed.
- `alpine` variant is smaller (~80MB vs ~400MB).

**`build:` vs `image:`**
- `build: ./backend` → builds image from Dockerfile (you have source code)
- `image: postgres:16-alpine` → pulls pre-built image from registry (no custom code)
- On EC2, everything uses `image:` since you don't have source code there

**`environment:` section**
- Variables under postgres (`POSTGRES_USER`, etc.) → configure the postgres container itself
- Variables under backend (`DB_HOST`, etc.) → tell your app how to connect to postgres
- `DB_HOST: postgres` → Docker networking lets containers talk by **service name**

**`depends_on` with `condition: service_healthy`**
- `depends_on: - postgres` → only waits for container to **start**
- `condition: service_healthy` → waits for postgres to be **ready to accept connections**
- Without this, backend starts before postgres is ready → `ECONNREFUSED` error

**`healthcheck`**
- `pg_isready` → built-in postgres command to check if DB accepts connections
- `-U root -d notesdb` → must match your POSTGRES_USER and POSTGRES_DB
- Checks every 5 seconds, up to 5 retries

**`volumes: pgdata:/var/lib/postgresql/data`**
- `/var/lib/postgresql/data` → where postgres stores data inside the container
- `pgdata` → named volume managed by Docker, persists across container restarts
- Without volume: `docker compose down` = data gone
- With volume: `docker compose down` = data survives

**Volume naming:**
- You declare `pgdata` but Docker names it `note-app_pgdata` (prefixed with project/folder name)
- `docker volume ls` → list all volumes
- `docker volume inspect note-app_pgdata` → see details

### Run it:

```bash
# Stop local postgres first (to free port 5432)
brew services stop postgresql@16

# Build and start
docker compose up -d --build

# Verify
docker ps
docker compose logs backend
```

**`--build` flag:**
- Forces rebuild of images from Dockerfile
- Needed when code or dependencies changed
- Not needed when only docker-compose.yml changed (env vars, ports)
- Doesn't affect `image:` services (postgres) — only `build:` services

### Data persistence test:

```bash
# Add some notes via the app
docker compose down
docker compose up -d
# Notes should still be there!
```

---

## Troubleshooting

### `ECONNREFUSED` on startup
- Backend started before postgres was ready
- Fix: Add `healthcheck` to postgres + `condition: service_healthy` on backend

### `relation "notes" does not exist`
- `CREATE TABLE` failed because postgres wasn't ready when backend tried to connect
- Fix: Same as above — healthcheck ensures postgres is ready first

### `version is obsolete` warning
- `version: '3.8'` is deprecated in Docker Compose v2. Safe to remove it. Keeping it doesn't break anything.

### Volume not found with `docker volume inspect pgdata`
- Docker Compose prefixes volume names with project name
- Use `docker volume inspect note-app_pgdata` instead

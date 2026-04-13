# AWS RDS — Managed PostgreSQL

## What is RDS?

Amazon Relational Database Service — AWS manages the database for you. No containers, no volumes, no patching. You just connect to it.

### Why RDS over Postgres container?

| | Postgres Container | RDS |
|---|---|---|
| Managed by | You | AWS |
| Backups | Manual | Automatic |
| EC2 dies | Data gone (volume is on EC2) | Data safe (RDS is separate) |
| Scaling | Rebuild container | Click a button |
| High availability | DIY | Multi-AZ option |
| Patching | Manual | Automatic |
| Cost | Free (runs on EC2) | ~$12-15/month (free tier available) |

**Production always uses RDS** — the database is decoupled from compute. EC2 is disposable, RDS is persistent.

---

## Step 1: Create RDS Instance

Go to AWS Console → RDS → Create database.

### Settings to use:

| Setting | Value | Why |
|---|---|---|
| Engine | PostgreSQL | Our app uses PostgreSQL |
| Creation method | Full configuration | Control all settings |
| Template | Free tier | Cheapest, learning |
| Deployment | Single-AZ | One instance, no redundancy. Fine for learning |
| DB identifier | `notesdb-instance` | Name in AWS console (not the database name) |
| Master username | `postgres` | Admin user |
| Credentials | Self managed | Set your own password |
| Instance class | db.t4g.micro | Smallest, free tier eligible |
| Storage | 20 GiB gp2 | Minimum, cheapest |
| Storage autoscaling | ❌ Uncheck | Not needed for learning |
| VPC | Same as your EC2 | So EC2 can connect internally |
| Public access | No | DB should never be public |
| Security group | default | Must allow port 5432 from EC2 |
| Initial database name | `notesdb` | ⚠️ CRITICAL — under "Additional configuration" |
| Performance Insights | ❌ Uncheck | Not needed |
| Enhanced Monitoring | ❌ Uncheck | Not needed |
| RDS Extended Support | ❌ Uncheck | Extra cost |
| Delete protection | ❌ Uncheck | So you can delete after learning |
| Backup retention | 1 day | Minimum |

### Deployment options explained:
- **Single-AZ** = 1 instance, cheapest, 99.5% uptime
- **Multi-AZ (2 instances)** = Primary + standby in different AZ, auto-failover, 99.95% uptime
- **Multi-AZ cluster (3 instances)** = Primary + 2 readable standbys, highest availability

### Instance class explained:
- `db.t4g.micro` → `t` = burstable, `4g` = 4th gen Graviton (ARM, cheaper), `micro` = smallest

Takes 5-10 minutes to create.

---

## Step 2: Get the RDS Endpoint

After status shows "Available":
1. RDS → Databases → click `notesdb-instance`
2. Under "Connectivity & security" → copy the **Endpoint**

Example:
```
<RDS_ENDPOINT>
```

---

## Step 3: Check Security Group

RDS must allow port 5432 from your EC2. Check:
- RDS → your instance → "Security group rules"
- Inbound rule should allow `5432` from EC2's IP range or security group
- If both EC2 and RDS use the `default` security group with `10.0.0.0/8` inbound, it works automatically

---

## Step 4: Update Backend Code for SSL

RDS requires encrypted (SSL) connections by default. Without SSL, you get:
```
no pg_hba.conf entry for host "x.x.x.x", user "postgres", database "notesdb", no encryption
```

**Why didn't this happen with postgres container?**
- Docker postgres doesn't enforce SSL
- RDS is production-grade, stricter security

Add SSL support to the PostgreSQL connection pool in `server.js`:

```javascript
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'notesdb',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
```

- `DB_SSL=true` → connect with SSL (for RDS)
- `DB_SSL` not set → no SSL (for local/docker postgres)
- `rejectUnauthorized: false` → accept RDS's certificate

Then rebuild and push to ECR:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v3 --push ./backend
```

---

## Step 5: Update docker-compose.yml on EC2

```yaml
services:
  backend:
    image: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v3
    ports:
      - '5000:5000'
    environment:
      DB_HOST: <RDS_ENDPOINT>
      DB_USER: postgres
      DB_PASSWORD: <your-rds-password>
      DB_NAME: notesdb
      DB_PORT: 5432
      DB_SSL: 'true'

  frontend:
    image: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
    ports:
      - '3000:3000'
    depends_on:
      - backend
```

### What changed from postgres container version:
- ❌ No `postgres` service (RDS replaces it)
- ❌ No `volumes` section (RDS manages storage)
- ❌ No `healthcheck` (RDS is already running)
- ❌ No `depends_on: postgres` on backend
- ✅ `DB_HOST` → RDS endpoint instead of `postgres`
- ✅ `DB_SSL: 'true'` → enables SSL for RDS
- ✅ `DB_USER` / `DB_PASSWORD` → matches RDS credentials

---

## Step 6: Run and Test

```bash
docker-compose up -d
docker-compose logs backend
# Should see: "Notes table ready"
```

### Useful tips:
- `docker-compose up -d backend` → restart only backend (no need for `down` first)
- If you change env vars in docker-compose.yml, just `docker-compose up -d` recreates changed containers

---

## Forgot RDS Password?

1. RDS Console → Databases → click your instance
2. Click **Modify**
3. Change **Master password**
4. Click Continue → **Apply immediately**
5. Update `DB_PASSWORD` in docker-compose.yml
6. `docker-compose up -d backend`

---

## ECR Image Versions

| Tag | What changed |
|---|---|
| v1 | Original backend (in-memory storage) |
| v2 | Added PostgreSQL support |
| v3 | Added SSL support for RDS |

---

## Key Takeaway

EC2 is disposable, RDS is persistent. If EC2 dies:
- Spin up a new EC2
- Point to the same RDS endpoint
- All data is still there

That's why production uses managed databases — **compute and data are decoupled**.

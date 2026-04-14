# Deploy on Kubernetes (EKS)

## What is Kubernetes?

A container orchestration platform — it manages, scales, and heals your containers automatically. Instead of manually running `docker compose up` on EC2, Kubernetes handles everything.

### Why Kubernetes over Docker Compose on EC2?

| | Docker Compose on EC2 | Kubernetes (EKS) |
|---|---|---|
| Container dies | Stays dead | Auto-restarts |
| Need more instances | Manual | Auto-scaling |
| Rolling updates | Manual downtime | Zero-downtime |
| Load balancing | DIY (Nginx) | Built-in (Services) |
| Secret management | .env files | Kubernetes Secrets |
| Storage | Docker volumes (lost if EC2 dies) | Persistent Volumes (EBS) |

---

## What is EKS?

Amazon Elastic Kubernetes Service — AWS manages the Kubernetes control plane (API server, scheduler, etcd). You only manage the worker nodes (EC2 instances that run your containers).

---

## Key Kubernetes Concepts

### Pod
- Smallest deployable unit — wraps one or more containers
- Like a single `docker run` but managed by Kubernetes
- Pods are ephemeral — they can be killed and recreated anytime

### Deployment
- Manages pods — ensures the desired number of replicas are always running
- Handles rolling updates (new version without downtime)
- Like `docker compose` but smarter

### Service
- Gives pods a stable network address
- Pods get random IPs that change on restart — Services provide a fixed DNS name
- Types:
  - **ClusterIP** — internal only (other pods can reach it, internet can't)
  - **NodePort** — exposes on each node's IP at a static port
  - **LoadBalancer** — creates an AWS ELB, accessible from the internet

### Namespace
- Virtual cluster within a cluster — isolates resources
- Like folders for your Kubernetes objects
- Our app uses `note-app` namespace

### ConfigMap
- Stores non-sensitive configuration (DB host, DB name, ports)
- Injected into pods as environment variables

### Secret
- Stores sensitive data (passwords, API keys)
- Base64 encoded (not encrypted by default!)
- Injected into pods as environment variables

### StatefulSet
- Like a Deployment but for stateful apps (databases)
- Pods get stable names (`postgres-0`, not `postgres-abc123`)
- Each pod gets its own persistent storage
- Pods are created/deleted in order

### PersistentVolumeClaim (PVC)
- Requests storage from the cluster
- In EKS with `gp2` storage class, creates an EBS volume automatically
- Data survives pod restarts and rescheduling

---

## Project Structure — K8s Manifests

```
k8s/
├── namespace.yml              # note-app namespace
├── secret.yml                 # DB credentials (base64 encoded)
├── configMap.yml              # DB host, name, port
├── postgres.yml               # StatefulSet + Headless Service
├── backend-deployment.yml     # Backend Deployment
├── backend-service.yaml       # Backend Service (ClusterIP)
├── frontend-deployment.yml    # Frontend Deployment
└── frontend-service.yml       # Frontend Service (LoadBalancer)
```

---

## Step 1: Create Namespace

**`namespace.yml`:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: note-app
```

```bash
kubectl apply -f namespace.yml
```

Why: Isolates all our resources. Every other manifest uses `namespace: note-app`.

---

## Step 2: Create Secret

**`secret.yml`:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
  namespace: note-app
type: Opaque
data:
  DB_USER: <base64-encoded-username>
  DB_PASSWORD: <base64-encoded-password>
```

Values must be base64 encoded:
```bash
echo -n "your-username" | base64    # encode
echo "cm9vdA==" | base64 -d        # decode to verify
```

```bash
kubectl apply -f secret.yml
```

> ⚠️ Base64 is encoding, NOT encryption. Anyone with cluster access can decode it. For production, use AWS Secrets Manager + External Secrets Operator.

---

## Step 3: Create ConfigMap

**`configMap.yml`:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: note-app
data:
  DB_HOST: "postgres"
  DB_NAME: "notesdb"
  DB_PORT: "5432"
```

```bash
kubectl apply -f configMap.yml
```

- `DB_HOST: "postgres"` → this is the Kubernetes Service name for postgres. Kubernetes DNS resolves `postgres` to the postgres pod's IP within the `note-app` namespace.

### ConfigMap vs Secret — when to use which?

| | ConfigMap | Secret |
|---|---|---|
| Data type | Non-sensitive config | Sensitive credentials |
| Encoding | Plain text | Base64 encoded |
| Example | DB_HOST, DB_PORT | DB_USER, DB_PASSWORD |

---

## Step 4: Deploy PostgreSQL (StatefulSet)

**`postgres.yml`:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: note-app
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
  clusterIP: None

---

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: note-app
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: DB_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: DB_PASSWORD
            - name: POSTGRES_DB
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: DB_NAME
          volumeMounts:
            - name: pgdata
              mountPath: /var/lib/postgresql/data
              subPath: pgdata
  volumeClaimTemplates:
    - metadata:
        name: pgdata
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp2
        resources:
          requests:
            storage: 1Gi
```

```bash
kubectl apply -f postgres.yml
```

### Key concepts explained:

**`clusterIP: None` (Headless Service)**
- Normal service: Kubernetes assigns a virtual IP, load-balances across pods
- Headless service: No virtual IP, DNS resolves directly to pod IP
- Used for StatefulSets because each pod has a unique identity
- Other pods connect via `postgres` DNS name → resolves to `postgres-0` pod IP

**Why StatefulSet instead of Deployment?**
- Deployment: pods are interchangeable (`backend-abc123`, `backend-xyz789`)
- StatefulSet: pods have stable identities (`postgres-0`, `postgres-1`)
- Each pod gets its own PVC — data is tied to the specific pod
- Required for databases where data consistency matters

**`volumeClaimTemplates`**
- Automatically creates a PVC for each pod
- `storageClassName: gp2` → uses AWS EBS gp2 volumes
- `1Gi` → 1 GB storage
- PVC name: `pgdata-postgres-0` (template name + pod name)

**`subPath: pgdata`**
- PostgreSQL expects an empty directory for data
- EBS volumes have a `lost+found` directory by default
- `subPath` creates a subdirectory, avoiding the "directory not empty" error

---

## Step 5: Deploy Backend

**`backend-deployment.yml`:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: note-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v2
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 10
          periodSeconds: 15
        ports:
        - containerPort: 5000
        env:
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: DB_USER
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: DB_PASSWORD
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DB_HOST
        - name: DB_NAME
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DB_NAME
        - name: DB_PORT
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: DB_PORT
```

**`backend-service.yaml`:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: note-app
spec:
  type: ClusterIP
  selector:
    app: backend
  ports:
    - protocol: TCP
      port: 5000
      targetPort: 5000
```

```bash
kubectl apply -f backend-deployment.yml
kubectl apply -f backend-service.yaml
```

### Key concepts explained:

**`resources` — requests vs limits**
- `requests` → minimum guaranteed resources. Kubernetes uses this for scheduling (which node has room?)
- `limits` → maximum allowed. Container gets killed (OOMKilled) if it exceeds memory limit
- `cpu: "100m"` → 100 millicores = 0.1 CPU core
- `memory: "128Mi"` → 128 MiB RAM

| | Requests | Limits |
|---|---|---|
| Purpose | Scheduling guarantee | Hard ceiling |
| Too low | Pod might not get scheduled | Pod gets throttled/killed |
| Too high | Wastes cluster resources | Wastes cluster resources |

**`readinessProbe`**
- Checks if the pod is ready to receive traffic
- Hits `GET /health` on port 5000 every 10 seconds
- If it fails, pod is removed from the Service (no traffic sent to it)
- `initialDelaySeconds: 5` → wait 5 seconds before first check (give app time to start)

**`livenessProbe`**
- Checks if the pod is still alive
- If it fails, Kubernetes **restarts** the pod
- Different from readiness: readiness removes from traffic, liveness restarts the container

**`env` with `valueFrom`**
- Instead of hardcoding env vars, pulls from Secret and ConfigMap
- Sensitive values (user, password) → from `db-secret`
- Non-sensitive values (host, name, port) → from `app-config`

**`ClusterIP` service**
- Backend is internal only — only other pods in the cluster can reach it
- Frontend (or Ingress) talks to it via `backend:5000` inside the cluster
- No external access needed for the API

---

## Step 6: Deploy Frontend

**`frontend-deployment.yml`:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: note-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v2
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1Gi"
        ports:
        - containerPort: 3000
```

**`frontend-service.yml`:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: note-app
spec:
  type: LoadBalancer
  selector:
    app: frontend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
```

```bash
kubectl apply -f frontend-deployment.yml
kubectl apply -f frontend-service.yml
```

### Key concepts explained:

**`LoadBalancer` service**
- Creates an AWS Classic Load Balancer (CLB) automatically
- Gives you an external URL to access the frontend from the internet
- `port: 80` → ELB listens on port 80
- `targetPort: 3000` → forwards to container port 3000

**How traffic flows:**
```
Internet → ELB (port 80) → NodePort (30352) → Pod (port 3000)
```

- ELB receives traffic on port 80
- Routes to a NodePort on the worker node (auto-assigned, e.g., 30352)
- NodePort forwards to the pod on port 3000

---

## Step 7: Apply Everything (Order Matters)

```bash
kubectl apply -f namespace.yml
kubectl apply -f secret.yml
kubectl apply -f configMap.yml
kubectl apply -f postgres.yml
kubectl apply -f backend-deployment.yml
kubectl apply -f backend-service.yaml
kubectl apply -f frontend-deployment.yml
kubectl apply -f frontend-service.yml
```

Order matters because:
1. Namespace must exist before anything else
2. Secret & ConfigMap must exist before pods that reference them
3. Postgres must be running before backend connects to it

---

## Step 8: Verify Everything

```bash
# Check all resources
kubectl get all -n note-app

# Check pods are running
kubectl get pods -n note-app

# Check services (get the ELB URL)
kubectl get svc -n note-app

# Check logs
kubectl logs -l app=backend -n note-app
kubectl logs -l app=frontend -n note-app
kubectl logs -l app=postgres -n note-app

# Check PVC (storage)
kubectl get pvc -n note-app
```

---

## Step 9: Access the App

Get the LoadBalancer URL:
```bash
kubectl get svc frontend -n note-app
```

Output:
```
NAME       TYPE           CLUSTER-IP       EXTERNAL-IP                                                               PORT(S)
frontend   LoadBalancer   172.20.105.253   a8ee0897c0ed7460ab366e914c64e06c-1710810431.us-east-1.elb.amazonaws.com   80:30352/TCP
```

Access: `http://<EXTERNAL-IP>`

> ⚠️ ELB takes 2-3 minutes to become fully healthy after creation. If the page doesn't load immediately, wait and retry.

---

## Step 10: Test with Port-Forward (if ELB isn't working)

Port-forward lets you access a Kubernetes service from your local machine without needing an ELB.

```bash
# Frontend
kubectl port-forward svc/frontend 3000:80 -n note-app
# Access: http://localhost:3000

# Backend (separate terminal)
kubectl port-forward svc/backend 5000:5000 -n note-app
# Access: http://localhost:5000
```

- `svc/frontend 3000:80` → local port 3000 → service port 80 → container port 3000
- Useful for debugging or when ELB security groups aren't configured yet

---

## Troubleshooting

### ELB URL not loading (page hangs)

**Check ELB security group:**
The LoadBalancer creates an AWS ELB with a security group. By default, it may only allow internal VPC traffic (`10.0.0.0/8`).

1. Go to EC2 Console → Load Balancers → find your ELB
2. Click on its Security Group
3. Check inbound rules — must have:

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | 0.0.0.0/0 |

If source is `10.0.0.0/8`, change it to `0.0.0.0/0` to allow internet access.

```bash
# Or via CLI
aws ec2 authorize-security-group-ingress --region us-east-1 --group-id <sg-id> --protocol tcp --port 80 --cidr 0.0.0.0/0
```

### Frontend loads but Notes page doesn't work (API calls fail)

**The problem:** `Notes.js` constructs the API URL as:
```javascript
const API_URL = `${window.location.protocol}//${window.location.hostname}:5000`;
```

When accessed via ELB, this becomes `http://elb-url:5000` — but the backend service is `ClusterIP` (internal only). Port 5000 is not exposed on the ELB.

**The fix:** Use an Ingress controller (see next doc) to route both frontend and API traffic through a single ALB with path-based routing.

### Pod stuck in `Pending`

```bash
kubectl describe pod <pod-name> -n note-app
```

Common causes:
- Not enough CPU/memory on nodes (check `resources.requests`)
- PVC can't be provisioned (wrong storage class, AZ mismatch)

### Pod in `CrashLoopBackOff`

```bash
kubectl logs <pod-name> -n note-app
```

Common causes:
- Backend can't connect to postgres (wrong credentials, postgres not ready)
- Missing environment variables

### Pod in `ImagePullBackOff`

```bash
kubectl describe pod <pod-name> -n note-app
```

Common causes:
- Wrong image URL
- ECR authentication not configured on the cluster
- Image tag doesn't exist

---

## Architecture Diagram

```
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │   AWS ELB       │
              │   (port 80)     │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Frontend Pod   │
              │  (port 3000)    │
              │  React App      │
              └────────┬────────┘
                       │ (browser calls :5000 ❌)
                       ▼
              ┌─────────────────┐
              │  Backend Pod    │  ← ClusterIP (internal only)
              │  (port 5000)    │
              │  Express API    │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Postgres Pod   │  ← Headless Service
              │  (port 5432)    │
              │  StatefulSet    │
              │  + EBS Volume   │
              └─────────────────┘
```

> Note: The browser cannot reach the backend directly because it's ClusterIP. This is solved with Ingress (next doc).

---

## Key Takeaways

1. **Kubernetes self-heals** — if a pod dies, it gets recreated automatically
2. **Services provide stable networking** — pod IPs change, service DNS names don't
3. **StatefulSet for databases** — stable identity + persistent storage
4. **ConfigMap/Secret for config** — no hardcoded values in deployments
5. **LoadBalancer = AWS ELB** — but check security groups for public access
6. **Port-forward for debugging** — quick local access without ELB

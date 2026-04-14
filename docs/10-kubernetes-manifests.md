# Kubernetes Manifests — Deploy the App on EKS

All the Kubernetes YAML files we created, what each one does, and how to apply them.

---

## Project Structure

```
k8s/
├── namespace.yml              # note-app namespace
├── secret.yml                 # DB credentials (base64 encoded)
├── configMap.yml              # DB host, name, port
├── postgres.yml               # StatefulSet + Headless Service + PVC
├── backend-deployment.yml     # Backend Deployment
├── backend-service.yaml       # Backend Service (ClusterIP)
├── frontend-deployment.yml    # Frontend Deployment
└── frontend-service.yml       # Frontend Service (LoadBalancer)
```

---

## Step 1: Namespace

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

## Step 2: Secret

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

> ⚠️ This file is in `.gitignore` — never push secrets to git!

---

## Step 3: ConfigMap

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

- `DB_HOST: "postgres"` → this is the Kubernetes Service name for postgres. K8s DNS resolves `postgres` to the postgres pod's IP within the `note-app` namespace.

---

## Step 4: PostgreSQL (StatefulSet)

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

### Key things explained:

**`clusterIP: None` (Headless Service)**
- Normal service: K8s assigns a virtual IP, load-balances across pods
- Headless service: No virtual IP, DNS resolves directly to pod IP
- Used for StatefulSets because each pod has a unique identity
- Other pods connect via `postgres` DNS name → resolves to `postgres-0` pod IP

**Why StatefulSet instead of Deployment?**
- Deployment: pods are interchangeable (`backend-abc123`, `backend-xyz789`)
- StatefulSet: pods have stable identities (`postgres-0`, `postgres-1`)
- Each pod gets its own PVC — data is tied to the specific pod

**`volumeClaimTemplates`**
- Automatically creates a PVC for each pod
- `storageClassName: gp2` → uses AWS EBS gp2 volumes (must be specified explicitly!)
- `1Gi` → 1 GB storage
- PVC name format: `pgdata-postgres-0` (template name + pod name)

**`subPath: pgdata`**
- EBS volumes have a `lost+found` directory by default (ext4 filesystem)
- PostgreSQL expects an empty directory and refuses to init if it finds `lost+found`
- `subPath` creates a clean subdirectory inside the volume:
```
EBS Volume (root)
├── lost+found/     ← stays here, postgres never sees this
└── pgdata/         ← postgres uses this (clean, empty)
```

---

## Step 5: Backend

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

### Key things explained:

**`readinessProbe`** — Hits `GET /health` on port 5000 every 10 seconds. If it fails, pod is removed from the Service (no traffic sent to it). `initialDelaySeconds: 5` gives the app time to start.

**`livenessProbe`** — If it fails, Kubernetes **restarts** the pod. Different from readiness: readiness removes from traffic, liveness restarts the container.

**`env` with `valueFrom`** — Pulls values from Secret and ConfigMap instead of hardcoding. Sensitive values (user, password) from `db-secret`, non-sensitive (host, name, port) from `app-config`.

**`ClusterIP` service** — Backend is internal only. Only other pods in the cluster can reach it at `backend:5000`. No external access needed for the API directly.

---

## Step 6: Frontend

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

### Key things explained:

**`LoadBalancer` service** — Creates an AWS Classic Load Balancer (CLB) automatically. `port: 80` → ELB listens on port 80, `targetPort: 3000` → forwards to container port 3000.

**High memory limits** — The frontend Dockerfile uses `npm start` (React dev server), which needs ~500MB+. In production, use a multi-stage Dockerfile with Nginx (uses ~10MB).

**How traffic flows:**
```
Internet → ELB (port 80) → NodePort (auto-assigned, e.g. 30352) → Pod (port 3000)
```

---

## Step 7: Apply Everything (Order Matters!)

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

**Why order matters:**
1. Namespace must exist before anything else
2. Secret & ConfigMap must exist before pods that reference them
3. Postgres must be running before backend connects to it

---

## Step 8: Verify Everything

```bash
# Check all resources in the namespace
kubectl get all -n note-app

# Check pods are running
kubectl get pods -n note-app

# Check services (get the ELB URL)
kubectl get svc -n note-app

# Check PVC (storage)
kubectl get pvc -n note-app

# Check logs
kubectl logs -l app=backend -n note-app
kubectl logs -l app=frontend -n note-app
kubectl logs -l app=postgres -n note-app
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

> ⏱️ ELB takes 2-3 minutes to become fully healthy after creation. If the page doesn't load immediately, wait and retry.

---

## Step 10: Test with Port-Forward (if ELB isn't working)

Port-forward lets you access a K8s service from your local machine without needing an ELB:

```bash
# Frontend (terminal 1)
kubectl port-forward svc/frontend 3000:80 -n note-app
# Access: http://localhost:3000

# Backend (terminal 2)
kubectl port-forward svc/backend 5000:5000 -n note-app
# Access: http://localhost:5000/health
```

- `svc/frontend 3000:80` → local port 3000 → service port 80 → container port 3000
- Useful for debugging or when ELB security groups aren't configured yet

---

## Key Takeaways

1. **Kubernetes self-heals** — if a pod dies, it gets recreated automatically
2. **Services provide stable networking** — pod IPs change, service DNS names don't
3. **StatefulSet for databases** — stable identity + persistent storage
4. **ConfigMap/Secret for config** — no hardcoded values in deployments
5. **LoadBalancer = AWS ELB** — but check security groups and subnet tags for public access
6. **Port-forward for debugging** — quick local access without ELB
7. **Apply order matters** — namespace → config → database → app

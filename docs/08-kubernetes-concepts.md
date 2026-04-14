# Kubernetes — Concepts & Theory

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

**Control Plane (AWS manages):**
- API Server — receives all `kubectl` commands
- Scheduler — decides which node runs which pod
- etcd — stores all cluster state
- Controller Manager — ensures desired state matches actual state

**Data Plane (You manage):**
- Worker Nodes (EC2 instances) — run your actual containers
- kubelet — agent on each node that talks to the control plane
- kube-proxy — handles networking on each node

---

## Key Kubernetes Concepts

### Pod
- Smallest deployable unit — wraps one or more containers
- Like a single `docker run` but managed by Kubernetes
- Pods are ephemeral — they can be killed and recreated anytime
- Each pod gets its own IP address inside the cluster

### Deployment
- Manages pods — ensures the desired number of replicas are always running
- Handles rolling updates (new version without downtime)
- Like `docker compose` but smarter
- If a pod dies, the Deployment controller creates a new one

### Service
- Gives pods a stable network address
- Pods get random IPs that change on restart — Services provide a fixed DNS name
- Types:
  - **ClusterIP** — internal only (other pods can reach it, internet can't)
  - **NodePort** — exposes on each node's IP at a static port
  - **LoadBalancer** — creates an AWS ELB, accessible from the internet
  - **Headless (`clusterIP: None`)** — no virtual IP, DNS resolves directly to pod IPs

### Namespace
- Virtual cluster within a cluster — isolates resources
- Like folders for your Kubernetes objects
- Our app uses `note-app` namespace
- Default namespaces: `default`, `kube-system`, `kube-public`

### ConfigMap
- Stores non-sensitive configuration (DB host, DB name, ports)
- Injected into pods as environment variables
- Plain text — anyone with cluster access can read it

### Secret
- Stores sensitive data (passwords, API keys)
- Base64 encoded (not encrypted by default!)
- Injected into pods as environment variables

### ConfigMap vs Secret — when to use which?

| | ConfigMap | Secret |
|---|---|---|
| Data type | Non-sensitive config | Sensitive credentials |
| Encoding | Plain text | Base64 encoded |
| Example | DB_HOST, DB_PORT | DB_USER, DB_PASSWORD |

> ⚠️ Base64 is encoding, NOT encryption. Anyone with cluster access can decode it. For production, use AWS Secrets Manager + External Secrets Operator.

### StatefulSet
- Like a Deployment but for stateful apps (databases)
- Pods get stable names (`postgres-0`, not `postgres-abc123`)
- Each pod gets its own persistent storage
- Pods are created/deleted in order
- Required for databases where data consistency matters

### PersistentVolumeClaim (PVC)
- Requests storage from the cluster
- In EKS with `gp2` storage class, creates an EBS volume automatically
- Data survives pod restarts and rescheduling
- PVC → PV (PersistentVolume) → actual EBS volume

### Probes (Health Checks)

| Probe | Purpose | On Failure |
|---|---|---|
| `readinessProbe` | Is the pod ready to receive traffic? | Removed from Service (no traffic) |
| `livenessProbe` | Is the pod still alive? | Pod gets restarted |

### Resources — Requests vs Limits

| | Requests | Limits |
|---|---|---|
| Purpose | Minimum guaranteed resources (for scheduling) | Maximum allowed (hard ceiling) |
| Too low | Pod might not get scheduled | Pod gets throttled (CPU) or killed (memory) |
| Too high | Wastes cluster resources | Wastes cluster resources |

- `cpu: "100m"` → 100 millicores = 0.1 CPU core
- `memory: "128Mi"` → 128 MiB RAM

---

## How Traffic Flows in Our Setup

```
Internet → ELB (port 80) → NodePort (auto-assigned) → Pod (port 3000)
```

- ELB receives traffic on port 80
- Routes to a NodePort on the worker node
- NodePort forwards to the pod on the target port

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

> Note: The browser cannot reach the backend directly because it's ClusterIP. This is solved with Ingress (covered later).

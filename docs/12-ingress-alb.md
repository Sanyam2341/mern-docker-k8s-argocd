# Ingress — AWS ALB Controller Setup

## The Problem

Frontend and backend are both running on EKS, but the browser can't reach the backend API:

```
Browser → ELB (port 80) → Frontend Pod ✅
Browser → ELB:5000 → Backend Pod ❌ (ClusterIP = internal only)
```

`Notes.js` was calling `http://elb-url:5000/notes` — but port 5000 isn't exposed on the ELB.

## The Solution — Ingress

One ALB with path-based routing:

```
One ALB (Ingress)
   ├── /api/*    → backend service (port 5000)
   └── /*        → frontend service (port 80)
```

Same URL, same port. The `/api` prefix tells the ALB "send this to backend."

---

## What is Ingress?

Two separate things:

1. **Ingress resource** — a YAML file (like Deployment, Service). Says "route `/api/*` to backend, `/*` to frontend." This is just a wish list.

2. **Ingress Controller** — actual software running as a pod. Reads the Ingress YAML and creates the ALB, target groups, routing rules, etc.

Without the controller, the YAML does nothing. Kubernetes doesn't ship with a controller because routing is cloud-specific — you pick one (Nginx, Traefik, AWS ALB, etc.).

**Why don't Deployments/Services need a separate controller?**
Kubernetes has built-in controllers for those (kube-controller-manager). But Ingress is intentionally left as a plugin.

---

## What is Helm?

A package manager for Kubernetes — like `brew` for macOS or `npm` for Node.js.

The ALB Controller needs ~15 K8s resources (Deployment, ServiceAccount, ClusterRole, ClusterRoleBinding, webhooks, CRDs, etc.). Helm packages all of that into one install command.

---

## Setup Steps

### Step 1: Create IAM Policy

AWS doesn't have a managed policy for the ALB Controller. They provide a JSON file that we create as a custom policy:

```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.12.0/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

This JSON contains all the AWS API permissions the controller needs (create ALBs, target groups, security groups, etc.).

### Step 2: Create IAM Role

**Where:** IAM → Roles → Create role

| Field | Value |
|---|---|
| Trusted entity type | AWS service |
| Use case | EKS - Pod Identity |
| Role name | `AmazonEKS_LB_Controller_Role` |

Skip policy attachment during creation (custom policies don't show up in the wizard). Attach via CLI after:

```bash
aws iam attach-role-policy \
  --role-name AmazonEKS_LB_Controller_Role \
  --policy-arn arn:aws:iam::<AWS_ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy
```

### Step 3: Create Pod Identity Association

**Where:** EKS Console → Clusters → `note-app-cluster` → Access tab → Pod Identity associations → Create

| Field | Value |
|---|---|
| Namespace | `kube-system` |
| Service account | `aws-load-balancer-controller` (type manually — doesn't exist yet) |
| IAM role | `AmazonEKS_LB_Controller_Role` |

Or via CLI:
```bash
aws eks create-pod-identity-association \
  --cluster-name note-app-cluster \
  --namespace kube-system \
  --service-account aws-load-balancer-controller \
  --role-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/AmazonEKS_LB_Controller_Role \
  --region us-east-1
```

**Same pattern as EBS CSI Driver:** Policy → Role → Pod Identity Association. Every pod that needs AWS permissions follows this.

### Step 4: Install ALB Controller via Helm

```bash
brew install helm

helm repo add eks https://aws.github.io/eks-charts
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  --set clusterName=note-app-cluster \
  --set serviceAccount.create=true \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=us-east-1 \
  --set vpcId=<VPC_ID> \
  -n kube-system
```

Verify:
```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

Should show 2 pods in `Running` state (2 replicas for high availability).

---

## Code Changes

### Frontend — `Notes.js`

Before:
```javascript
const API_URL = `${window.location.protocol}//${window.location.hostname}:5000`;
```

After:
```javascript
const API_URL = `/api`;
```

Now calls `/api/notes` instead of `http://elb-url:5000/notes`. The ALB routes `/api/*` to the backend.

### Backend — `server.js`

Added `/api` prefix to all routes:

| Before | After |
|---|---|
| `GET /notes` | `GET /api/notes` |
| `POST /notes` | `POST /api/notes` |
| `DELETE /notes/:id` | `DELETE /api/notes/:id` |
| `GET /health` | `GET /api/health` |

### Docker Images

Rebuilt and pushed as `v3` to ECR:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-backend:v3 --push ./backend
docker buildx build --platform linux/amd64,linux/arm64 -t <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/note-app-frontend:v3 --push ./frontend
```

---

## K8s Manifest Changes

### New file — `ingress.yml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: note-app-ingress
  namespace: note-app
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
spec:
  rules:
    - http:
        paths:
          - path: /api/*
            pathType: ImplementationSpecific
            backend:
              service:
                name: backend
                port:
                  number: 5000
          - path: /*
            pathType: ImplementationSpecific
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

**Annotations explained:**

| Annotation | What it tells the ALB Controller |
|---|---|
| `ingress.class: alb` | This Ingress is for you (not nginx or traefik) |
| `scheme: internet-facing` | Create a public ALB |
| `target-type: ip` | Route directly to pod IPs |
| `listen-ports: HTTP 80` | ALB listens on port 80 |

**Path routing:**
- `/api/*` → backend service port 5000 (more specific path first)
- `/*` → frontend service port 80 (catch-all)
- Ingress uses the **service port** (not container port). Frontend service port is 80, which forwards to container port 3000.

### Updated files

| File | Change | Why |
|---|---|---|
| `backend-deployment.yml` | Image `v2` → `v3`, probes `/health` → `/api/health` | New code with `/api` prefix |
| `frontend-deployment.yml` | Image `v2` → `v3` | New code with `/api` calls |
| `frontend-service.yml` | `LoadBalancer` → `ClusterIP` | ALB Ingress handles external access now, no need for separate ELB |

---

## Apply Order

```bash
kubectl apply -f backend-deployment.yml
kubectl apply -f backend-service.yaml
kubectl apply -f frontend-deployment.yml
kubectl apply -f frontend-service.yml
kubectl apply -f ingress.yml
```

---

## Verify

```bash
kubectl get ingress -n note-app
```

Output:
```
NAME               CLASS    HOSTS   ADDRESS                                                                  PORTS   AGE
note-app-ingress   <none>   *       k8s-noteapp-noteappi-xxxxxxxx-xxxxxxxxxx.us-east-1.elb.amazonaws.com     80      2m
```

Access: `http://<ADDRESS>`

> ⏱️ ALB takes 3-5 minutes to provision. DNS won't resolve until state is `active`.

Check ALB state:
```bash
aws elbv2 describe-load-balancers --region us-east-1 --query 'LoadBalancers[?contains(DNSName, `noteappi`)].{DNS:DNSName,State:State.Code}' --output table
```

---

## Security Group

The ALB Controller creates 2 security groups:

| SG | Purpose |
|---|---|
| `k8s-noteapp-noteappi-*` | Controls who can reach the ALB (inbound port 80) |
| `k8s-traffic-*` | Controls ALB → pod traffic (no inbound rules needed, uses SG-to-SG reference) |

Update the first SG to allow `10.0.0.0/8` (corporate network) instead of `0.0.0.0/0`:

```bash
aws ec2 revoke-security-group-ingress --group-id <sg-id> --protocol tcp --port 80 --cidr 0.0.0.0/0 --region us-east-1
aws ec2 authorize-security-group-ingress --group-id <sg-id> --protocol tcp --port 80 --cidr 10.0.0.0/8 --region us-east-1
```

---

## Traffic Flow (Final)

```
Browser → ALB (port 80)
              ├── /api/notes  → backend pod (port 5000) → postgres pod
              ├── /api/health → backend pod (port 5000)
              └── /*          → frontend pod (port 3000)
```

Single entry point, single URL, path-based routing. No more port 5000 exposed. ✅

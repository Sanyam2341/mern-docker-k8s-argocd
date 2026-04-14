# Kubernetes Troubleshooting — Issues We Hit & Fixed

Every issue we encountered during the EKS deployment, what caused it, and the exact fix.

---

## Issue 1: EBS CSI Driver pods in `CrashLoopBackOff`

**What happened:**
```
kubectl get pods -n kube-system
ebs-csi-controller-xxx   1/6   CrashLoopBackOff
```

**Why:** The EBS CSI Driver pod needs AWS permissions to create EBS volumes. But pods don't automatically get permissions — they need an IAM role via Pod Identity (or OIDC/IRSA). The add-on was installed but had no IAM role associated.

**Fix — 4 steps:**

1. Create OIDC provider:
```bash
eksctl utils associate-iam-oidc-provider --cluster note-app-cluster --region us-east-1 --approve
```

2. Create IAM role `AmazonEKS_EBS_CSI_DriverRole`:
   - Trusted entity: EKS - Pod Identity
   - Policy: `AmazonEBSCSIDriverPolicy`

3. Associate the role:
```bash
aws eks create-pod-identity-association \
  --cluster-name note-app-cluster \
  --namespace kube-system \
  --service-account ebs-csi-controller-sa \
  --role-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/AmazonEKS_EBS_CSI_DriverRole \
  --region us-east-1
```

4. Restart the controller:
```bash
kubectl rollout restart deployment ebs-csi-controller -n kube-system
```

**Lesson:** Pods don't inherit the node's IAM role. Each pod gets permissions through its own Service Account + IAM Role.

---

## Issue 2: PVC stuck in `Pending`

**What happened:**
```
kubectl get pvc -n note-app
pgdata-postgres-0   Pending   <unset>
```

**Why:** The `gp2` StorageClass existed in the cluster but wasn't specified in the `volumeClaimTemplate`. K8s didn't know which StorageClass to use and couldn't provision the EBS volume.

**Fix:** Add `storageClassName: gp2` to the volumeClaimTemplate:
```yaml
volumeClaimTemplates:
  - metadata:
      name: pgdata
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: gp2          # ← this was missing
      resources:
        requests:
          storage: 1Gi
```

> ⚠️ `volumeClaimTemplates` in StatefulSets are **immutable** — you can't update them with `kubectl apply`. You must delete the StatefulSet first, then re-apply:
> ```bash
> kubectl delete statefulset postgres -n note-app
> kubectl delete pvc pgdata-postgres-0 -n note-app
> kubectl apply -f postgres.yml
> ```

---

## Issue 3: Postgres pod `CrashLoopBackOff` — `lost+found` directory

**What happened:**
```
kubectl logs postgres-0 -n note-app
initdb: error: directory "/var/lib/postgresql/data" exists but is not empty
initdb: detail: It contains a lost+found directory
```

**Why:** New EBS volumes are formatted with ext4 filesystem, which automatically creates a `lost+found` directory. PostgreSQL sees the directory isn't empty and refuses to initialize.

**Fix:** Add `subPath: pgdata` to the volumeMount:
```yaml
volumeMounts:
  - name: pgdata
    mountPath: /var/lib/postgresql/data
    subPath: pgdata                      # ← creates a clean subdirectory
```

This mounts a `pgdata/` subfolder inside the EBS volume instead of the root:
```
EBS Volume (root)
├── lost+found/     ← stays here, postgres never sees this
└── pgdata/         ← postgres uses this (clean, empty)
```

---

## Issue 4: ELB creation fails — "could not find any suitable subnets"

**What happened:**
```
kubectl describe svc frontend -n note-app
Warning  SyncLoadBalancerFailed  Error syncing load balancer: failed to ensure load balancer:
could not find any suitable subnets for creating the ELB
```

**Why:** AWS needs to know which subnets are public (for internet-facing ELBs). Subnets must be tagged for EKS to discover them. Our VPC was shared (DEV-VPC, used by multiple teams/clusters), so the tags were missing.

**Fix — Tag your subnets:**

Public subnets need **both** tags:
```
kubernetes.io/role/elb = 1
kubernetes.io/cluster/note-app-cluster = shared
```

Private subnets need:
```
kubernetes.io/role/internal-elb = 1
kubernetes.io/cluster/note-app-cluster = shared
```

Via CLI:
```bash
# Tag public subnets
aws ec2 create-tags --region us-east-1 \
  --resources subnet-0994500132b3a4092 subnet-0d26ea15e2ee3f6ed \
  --tags Key=kubernetes.io/role/elb,Value=1 \
         Key=kubernetes.io/cluster/note-app-cluster,Value=shared

# Tag private subnets
aws ec2 create-tags --region us-east-1 \
  --resources subnet-00062ae09637d3d7f subnet-02cf1544383ef6be7 \
  --tags Key=kubernetes.io/role/internal-elb,Value=1 \
         Key=kubernetes.io/cluster/note-app-cluster,Value=shared
```

After tagging, delete and recreate the LoadBalancer service:
```bash
kubectl delete svc frontend -n note-app
kubectl apply -f frontend-service.yml
```

**How to tell public vs private subnets:**
- Check the Route Table for each subnet
- Has route to `igw-xxxxx` (Internet Gateway) → **Public**
- Has route to `nat-xxxxx` (NAT Gateway) → **Private**

---

## Issue 5: ELB URL not loading (page hangs / site can't be reached)

**What happened:** ELB was created, DNS resolved, but the page wouldn't load in the browser.

**Why:** The ELB security group only allowed inbound traffic from `10.0.0.0/8` (internal VPC CIDR), not from the public internet.

**Fix:** Edit the ELB security group inbound rules:

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | 0.0.0.0/0 |

Via AWS Console: EC2 → Load Balancers → click ELB → Security tab → Edit inbound rules.

Via CLI:
```bash
aws ec2 authorize-security-group-ingress --region us-east-1 \
  --group-id <sg-id> --protocol tcp --port 80 --cidr 0.0.0.0/0
```

---

## Issue 6: DNS not resolving (NXDOMAIN)

**What happened:**
```
nslookup a8ee0897c0ed7460ab366e914c64e06c-1710810431.us-east-1.elb.amazonaws.com
** server can't find: NXDOMAIN
```

**Why:** Corporate DNS server was slow to pick up the new AWS DNS record. Google DNS (8.8.8.8) resolved it fine — it was just a propagation delay.

**Fix:** Wait 3-5 minutes. To verify it's a DNS propagation issue:
```bash
# Check with Google DNS
nslookup <elb-url> 8.8.8.8

# If this resolves but your default DNS doesn't → just wait
```

---

## Issue 7: Frontend pod `CrashLoopBackOff` — out of memory

**What happened:** Frontend pod kept crashing with no obvious error in logs. Pod status showed `OOMKilled` or just `CrashLoopBackOff`.

**Why:** The frontend Dockerfile uses `npm start` (React dev server), which is memory-hungry (~500MB+). The initial resource limits were too low (256Mi), so K8s kept killing the container.

**Fix:** Increase memory limits in `frontend-deployment.yml`:
```yaml
resources:
  requests:
    cpu: "250m"
    memory: "512Mi"     # was 128Mi
  limits:
    cpu: "1000m"
    memory: "1Gi"       # was 256Mi
```

> ⚠️ In production, you should NOT use `npm start` (dev server). Use a multi-stage Dockerfile with Nginx to serve the built React app — it uses ~10MB instead of 500MB+.

---

## Issue 8: Frontend loads but Notes page doesn't work (API calls fail)

**What happened:** The app's home page loads fine via the ELB URL, but the Notes page shows no data and API calls fail in the browser console.

**Why:** `Notes.js` constructs the API URL as:
```javascript
const API_URL = `${window.location.protocol}//${window.location.hostname}:5000`;
```

When accessed via ELB, this becomes `http://elb-url:5000` — but the backend service is `ClusterIP` (internal only). Port 5000 is not exposed on the ELB. The browser (running on the user's machine) tries to reach `:5000` on the ELB URL, which doesn't exist.

**Fix:** Use an Ingress controller to route both frontend and API traffic through a single ALB with path-based routing:
```
One ALB (Ingress)
   ├── /        → frontend service (port 3000)
   └── /notes   → backend service (port 5000)
```

This is covered in the next doc (Ingress setup).

---

## General Troubleshooting Commands

### Pod stuck in `Pending`:
```bash
kubectl describe pod <pod-name> -n note-app
# Look at the Events section — tells you exactly why
```
Common causes: not enough CPU/memory on nodes, PVC can't be provisioned, no nodes match affinity rules.

### Pod in `CrashLoopBackOff`:
```bash
kubectl logs <pod-name> -n note-app
kubectl logs <pod-name> -n note-app --previous    # logs from the crashed container
```
Common causes: app can't connect to DB, missing env vars, out of memory, config errors.

### Pod in `ImagePullBackOff`:
```bash
kubectl describe pod <pod-name> -n note-app
```
Common causes: wrong image URL, ECR auth not configured, image tag doesn't exist, node can't reach ECR.

### Service has no endpoints:
```bash
kubectl get endpoints <service-name> -n note-app
# If empty → labels don't match between Service selector and Pod labels
# Or pod is not Ready (CrashLoopBackOff, failing readiness probe)
```

### Check events (cluster-wide):
```bash
kubectl get events -n note-app --sort-by='.lastTimestamp'
```

### Exec into a pod (for debugging):
```bash
kubectl exec -it <pod-name> -n note-app -- /bin/sh
# Now you're inside the container — can test connectivity, check files, etc.
```

### Check resource usage:
```bash
kubectl top pods -n note-app      # requires Metrics Server add-on
kubectl top nodes
```

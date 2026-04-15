# Argo CD — Helm Installation

## Why Helm Over Plain YAML?

| Scenario | Plain YAML | Helm |
|---|---|---|
| Install | `kubectl apply -f install.yaml` | `helm install` |
| Customize (replicas, resources) | Edit 10,000 line YAML | Change values.yaml |
| Upgrade Argo CD version | Delete + reinstall | `helm upgrade` |
| Rollback bad upgrade | No easy way | `helm rollback` |
| Track what's installed | No tracking | `helm list` |
| Disable unused components | Delete sections from YAML | `enabled: false` |

**Rule of thumb:** POC → plain YAML. Production → Helm.

---

## Prerequisites

```bash
# Install Helm (one-time)
brew install helm

# Add Argo CD Helm repo
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# Install Argo CD CLI
brew install argocd
```

---

## Step 1: Create values.yaml

This file customizes the Argo CD installation. Save as `k8s/argocd/values.yaml`:

```yaml
# Argo CD Helm Values
# Install: helm install argocd argo/argo-cd -n argocd --create-namespace -f values.yaml
# Upgrade: helm upgrade argocd argo/argo-cd -n argocd -f values.yaml

server:
  # Production: 2 for HA. POC: 1
  replicas: 1
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi

controller:
  # The brain — compares Git vs cluster. Always 1 (has leader election)
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: "1"
      memory: 512Mi

repoServer:
  # Clones Git repos and reads manifests. Production: 2
  replicas: 1
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      cpu: 500m
      memory: 256Mi

redis:
  # Cache layer
  resources:
    requests:
      cpu: 100m
      memory: 64Mi
    limits:
      cpu: 250m
      memory: 128Mi

dex:
  # SSO server — disable if not using SSO
  enabled: false

notifications:
  # Slack/email alerts — disable if not using
  enabled: false

applicationSet:
  # Multi-app generator — disable if not using
  enabled: false
```

**What each component does:**

| Component | Purpose | Replicas |
|---|---|---|
| `server` | UI + API (what you open in browser) | 2 for prod, 1 for POC |
| `controller` | Compares Git vs cluster every 3 min | Always 1 (leader election) |
| `repoServer` | Clones Git repos, reads YAML | 2 for prod, 1 for POC |
| `redis` | Cache for fast lookups | 1 |
| `dex` | SSO login (Google, LDAP) | Disable if not needed |
| `notifications` | Slack/email alerts | Disable if not needed |
| `applicationSet` | Manage multiple apps at scale | Disable if not needed |

---

## Step 2: Install Argo CD

```bash
helm install argocd argo/argo-cd -n argocd --create-namespace -f k8s/argocd/values.yaml
```

Wait for pods:

```bash
kubectl get pods -n argocd -w
```

Verify installation:

```bash
helm list -n argocd
```

---

## Step 3: Connect Private Git Repo

Apply the repository secret (has GitLab/GitHub token):

```bash
kubectl apply -f k8s/argocd/repository-secret.yml
```

The `repository-secret.yml` file:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitlab-repo-creds
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://gitlab.com/<org>/<repo>.git
  username: <your-gitlab-username>
  password: <your-gitlab-pat>
```

> ⚠️ This file has your token. Keep in `.gitignore`.

---

## Step 4: Create Application

```bash
kubectl apply -f k8s/argocd/application.yml
```

The `application.yml` file:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: note-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://gitlab.com/<org>/<repo>.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: note-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

## Step 5: Access UI

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443 &
```

Open: `https://localhost:8080`

- Username: `admin`
- Password:
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

---

## Step 6: CLI Login

```bash
argocd login localhost:8080 --username admin --password $(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d) --insecure
```

---

## Step 7: Verify

```bash
# Check repo connection
argocd repo list

# Check app status
argocd app get note-app

# Should show: Synced ✅ Healthy ✅
```

---

## All-in-One — Copy Paste Commands

```bash
# 1. Install
helm install argocd argo/argo-cd -n argocd --create-namespace -f k8s/argocd/values.yaml

# 2. Wait for pods
kubectl get pods -n argocd -w

# 3. Connect repo
kubectl apply -f k8s/argocd/repository-secret.yml

# 4. Create app
kubectl apply -f k8s/argocd/application.yml

# 5. Port-forward
kubectl port-forward svc/argocd-server -n argocd 8080:443 &

# 6. CLI login
argocd login localhost:8080 --username admin --password $(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d) --insecure

# 7. Verify
argocd repo list
argocd app get note-app
```

---

## Helm Management Commands

```bash
# See what's installed
helm list -n argocd

# See current values
helm get values argocd -n argocd

# Upgrade (after changing values.yaml)
helm upgrade argocd argo/argo-cd -n argocd -f k8s/argocd/values.yaml

# Rollback to previous version
helm rollback argocd -n argocd

# Rollback to specific revision
helm history argocd -n argocd
helm rollback argocd <REVISION> -n argocd

# Uninstall completely
helm uninstall argocd -n argocd
kubectl delete namespace argocd
```

---

## Upgrade Argo CD Version

```bash
# Update Helm repo to get latest charts
helm repo update

# Check available versions
helm search repo argo/argo-cd --versions | head -10

# Upgrade to latest
helm upgrade argocd argo/argo-cd -n argocd -f k8s/argocd/values.yaml

# If something breaks
helm rollback argocd -n argocd
```

---

## Files Summary

```
k8s/argocd/
├── values.yaml              ← Helm config (how to install Argo CD) — push to Git
├── application.yml          ← What Argo CD manages — push to Git
└── repository-secret.yml    ← Git credentials — .gitignore, never push
```

# Argo CD — GitOps Continuous Deployment

## What is Argo CD?

A GitOps tool that runs inside your K8s cluster. It watches a Git repo and ensures whatever YAML is in Git = what's running in the cluster.

**What it automates:** Deployment of K8s manifests (Deployments, Services, ConfigMaps, Ingress, StatefulSets — anything in your YAML files). It does NOT create clusters or manage AWS infrastructure.

**What it replaces:**
```
Before: Edit YAML → kubectl apply → hope nobody changes it manually
After:  Edit YAML → git push → Argo CD detects and applies automatically
```

**Drift detection:** If someone runs `kubectl edit` or `kubectl scale` manually, Argo CD detects the difference between Git and cluster, marks it as OutOfSync, and can auto-revert it.

---

## Architecture — What Gets Installed

Argo CD installs 7 pods in the `argocd` namespace:

| Pod | What it does |
|---|---|
| `argocd-server` | The UI + API. What you open in the browser |
| `argocd-application-controller` | The brain. Compares Git vs Cluster every 3 minutes |
| `argocd-repo-server` | Clones your Git repo, reads the YAML manifests |
| `argocd-redis` | Cache layer for fast state lookups |
| `argocd-dex-server` | SSO/authentication (Google, LDAP, etc.) |
| `argocd-applicationset-controller` | Manages multiple apps at scale |
| `argocd-notifications-controller` | Sends alerts (Slack, email) on changes |

**Key concept:** Argo CD runs 24/7 inside the cluster. Port-forwarding is just for YOU to access the UI/CLI. Even if your laptop is off, Argo CD keeps working.

---

## Multiple Apps on One Cluster

Install Argo CD **once** per cluster. Then create multiple Applications:

```
EKS Cluster
├── argocd namespace        ← Argo CD lives here (installed once)
├── note-app namespace      ← Application "note-app" watches repo-A/k8s/
├── payment-app namespace   ← Application "payment-app" watches repo-B/k8s/
└── auth-service namespace  ← Application "auth-service" watches repo-C/manifests/
```

Each Application points to a different Git repo (or different path in the same repo). Argo CD manages them all independently.

---

## Installation

### Step 1: Create Namespace

```bash
kubectl create namespace argocd
```

### Step 2: Install Argo CD

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### Step 3: Wait for Pods

```bash
kubectl get pods -n argocd -w
```

Wait until all 7 pods show `1/1 Running`. Press `Ctrl+C` to exit watch mode.

### Step 4: Verify Services

```bash
kubectl get svc -n argocd
```

The important one is `argocd-server` — ClusterIP, ports 80/443. This is the UI.

### Step 5: Get Admin Password

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

Argo CD auto-generates this password during install. It's stored as a K8s Secret (base64 encoded).

- **Username:** `admin`
- **Password:** output of the above command

---

## Access — Two Ways

### Option A: UI (Browser)

Port-forward to access the UI:

```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open: `https://localhost:8080`

- Certificate warning → Advanced → Proceed (self-signed cert, normal)
- Login with admin credentials

> Port-forward creates a tunnel: `Your laptop:8080 → argocd-server pod:443`

### Option B: CLI (Terminal)

Install:
```bash
brew install argocd
```

Start port-forward in background:
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443 &
```

Login:
```bash
argocd login localhost:8080 --username admin --password $(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d) --insecure
```

Useful commands:

| Action | Command |
|---|---|
| List apps | `argocd app list` |
| Check status | `argocd app get note-app` |
| Sync | `argocd app sync note-app` |
| See diff (Git vs cluster) | `argocd app diff note-app` |
| View history | `argocd app history note-app` |
| Rollback | `argocd app rollback note-app <ID>` |
| Enable auto-sync | `argocd app set note-app --sync-policy automated --self-heal --auto-prune` |
| Disable auto-sync | `argocd app set note-app --sync-policy none` |

---

## Connect a Private Git Repo

Argo CD needs credentials to read private repos. Two ways:

### Option A: Via UI

1. **Settings** (gear icon) → **Repositories** → **Connect Repo**

| Field | Value |
|---|---|
| Connection method | VIA HTTPS |
| Type | git |
| Project | default |
| Repository URL | `https://gitlab.com/nielsen-media/users/sanyam.sharma/argo-cd-poc.git` |
| Username | `sanyam.sharma1` (your GitLab login) |
| Password | your GitLab Personal Access Token |

2. Click **Connect** → should show **Successful** ✅

### Option B: Via YAML (GitOps way)

Create file `k8s/argocd/repository-secret.yml`:

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
  url: https://gitlab.com/nielsen-media/users/sanyam.sharma/argo-cd-poc.git
  username: <YOUR_GITLAB_USERNAME>
  password: <YOUR_GITLAB_PAT>
```

Apply:
```bash
kubectl apply -f k8s/argocd/repository-secret.yml
```

The label `argocd.argoproj.io/secret-type: repository` is the magic — Argo CD automatically picks up any Secret with this label as a repo connection.

> ⚠️ This file has your token. Add to `.gitignore`:
> ```
> k8s/argocd/repository-secret.yml
> ```

### GitLab Personal Access Token

**Where:** GitLab → Profile → User Settings → Access Tokens → Add new token

| Field | Value |
|---|---|
| Token type | Legacy (Classic) |
| Token name | any name |
| Expiration | 30 days (or as needed) |
| Scopes | `api` |

> GitLab only shows the token once. Copy and save it immediately.

---

## Create an Application

This tells Argo CD: "Watch this Git repo path and deploy to this namespace."

### Option A: Via UI

1. **Applications** → **New App**

**General:**

| Field | Value |
|---|---|
| Application Name | `note-app` |
| Project | `default` |
| Sync Policy | `Manual` (start with manual, switch to auto later) |

**Source:**

| Field | Value |
|---|---|
| Repository URL | select your connected GitLab repo from dropdown |
| Revision | `main` |
| Path | `k8s` |

**Destination:**

| Field | Value |
|---|---|
| Cluster URL | `https://kubernetes.default.svc` (same cluster Argo CD runs in) |
| Namespace | `note-app` |

2. Click **Create**

### Option B: Via YAML (GitOps way)

Create file `k8s/argocd/application.yml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: note-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://gitlab.com/nielsen-media/users/sanyam.sharma/argo-cd-poc.git
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

Apply:
```bash
kubectl apply -f k8s/argocd/application.yml
```

**Fields explained:**

| Field | What it means |
|---|---|
| `source.repoURL` | Git repo to watch |
| `source.targetRevision` | Branch to watch |
| `source.path` | Folder containing K8s manifests (only this folder is watched) |
| `destination.server` | Which cluster to deploy to (`kubernetes.default.svc` = same cluster) |
| `destination.namespace` | Which namespace to deploy into |
| `syncPolicy.automated` | Auto-sync when Git changes |
| `syncPolicy.automated.prune` | Delete resources removed from Git |
| `syncPolicy.automated.selfHeal` | Revert manual kubectl changes |

**Sync policy options:**

| Policy | Behavior |
|---|---|
| `syncPolicy: {}` | Manual — you click Sync |
| `automated: {}` | Auto-sync on Git change, but no self-heal |
| `automated + selfHeal` | Auto-sync + revert manual changes |
| `automated + prune` | Auto-sync + delete removed resources |
| `automated + selfHeal + prune` | Full GitOps — Git is the single source of truth |

---

## Sync

### First Sync

After creating the Application, it shows **OutOfSync** — Argo CD sees manifests in Git but hasn't applied them yet.

**Via UI:** Click the app → **Sync** → **Synchronize**

**Via CLI:**
```bash
argocd app sync note-app
```

After sync: **Synced ✅ + Healthy ✅**

### What About Secrets?

`secret.yml` is in `.gitignore` — not in Git, not managed by Argo CD.

The secret must be applied manually:
```bash
kubectl apply -f k8s/secret.yml
```

This is a common pattern. Secrets are managed outside GitOps because you don't want passwords in Git. Production alternatives:
- AWS Secrets Manager + External Secrets Operator
- Sealed Secrets (encrypted, safe to put in Git)

---

## What We Demonstrated

### 1. Drift Detection (Manual Change → OutOfSync)

```bash
# Manually changed replicas outside of Git
kubectl scale deployment backend --replicas=3 -n note-app

# Argo CD detected the drift
argocd app diff note-app
# Output showed: cluster has replicas: 3, Git has replicas: 1

# Argo CD status changed to OutOfSync
argocd app get note-app | grep -i sync

# Synced to fix — Git wins
argocd app sync note-app
# Backend went back to 1 replica
```

### 2. Self-Heal (Auto-Revert Manual Changes)

```bash
# Enabled auto-sync with self-heal
argocd app set note-app --sync-policy automated --self-heal --auto-prune

# Manually scaled frontend
kubectl scale deployment frontend --replicas=3 -n note-app

# Argo CD automatically reverted it back to what Git says
# No manual intervention needed
```

### 3. Auto-Deploy from Git Push

```bash
# Changed frontend replicas from 1 to 2 in frontend-deployment.yml
# Committed and pushed to GitLab
git add .
git commit -m "feat: scale frontend to 2 replicas"
git push gitlab main

# Within ~3 minutes, Argo CD detected the Git change
# Automatically deployed — second frontend pod appeared
# No kubectl apply needed!
```

### 4. Pod Self-Healing (K8s, not Argo CD)

```bash
# Deleted a running pod
kubectl delete pod backend-79b5dfdfb6-wq55r -n note-app

# K8s ReplicaSet immediately created a new pod
# Argo CD didn't need to act — desired state (replicas: 1) still matches Git
```

**Who fixes what:**

| Scenario | Who fixes it |
|---|---|
| Pod deleted/crashed | K8s (ReplicaSet ensures replica count) |
| Replicas manually changed | Argo CD (Git says 1, cluster says 3 → revert) |
| Image tag manually changed | Argo CD (Git says v3, cluster says v4 → revert) |
| ConfigMap manually edited | Argo CD (Git wins) |
| Resource deleted | Argo CD with self-heal (recreates from Git) |

---

## The Core Loop

Argo CD runs this **24/7**, whether you're watching or not:

```
Every 3 minutes:
  1. repo-server clones latest from GitLab (main branch, k8s/ folder)
  2. application-controller compares Git YAML vs live cluster state
  3. If they match     → Synced ✅
  4. If they don't     → OutOfSync ⚠️
  5. If auto-sync ON   → auto-apply changes
  6. If selfHeal ON    → revert manual kubectl changes (drift detection)
```

---

## Rollback via Git

No need for `kubectl rollout undo`. Just use Git:

```bash
# Bad deployment happened
git log --oneline
# abc1234 feat: deploy backend v4    ← this broke things
# def5678 feat: deploy backend v3    ← this was working

# Revert the bad commit
git revert HEAD
git push gitlab main

# Argo CD auto-syncs → deploys the reverted YAML → back to v3
```

Git history = deployment history. You know who changed what, when, and why.

---

## Files Created

```
k8s/
├── argocd/
│   ├── application.yml           ← pushed to Git (no secrets, defines the Argo CD Application)
│   └── repository-secret.yml     ← NOT in Git (.gitignore) — has GitLab token
├── namespace.yml
├── configMap.yml
├── secret.yml                    ← NOT in Git (.gitignore) — has DB password
├── postgres.yml
├── backend-deployment.yml
├── backend-service.yaml
├── frontend-deployment.yml
├── frontend-service.yml
└── ingress.yml
```

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| OutOfSync after first create | Normal — Argo CD hasn't synced yet | Click Sync or `argocd app sync` |
| `grpc: invalid UTF-8` on new pods | Secret has non-UTF-8 characters | Recreate secret: `kubectl create secret generic --from-literal` |
| Port-forward disconnects | Idle timeout, normal | Restart: `kubectl port-forward svc/argocd-server -n argocd 8080:443 &` |
| `connection refused` on CLI | Port-forward not running | Start port-forward first |
| Repo connection failed | Wrong username or expired token | Check GitLab username and create new PAT |
| Auto-sync not triggering | GitLab webhook not set up | Wait ~3 minutes (polling interval) or set up webhook |
| Application YAML `kubectl apply` fails | Credentials expired | Run `gimme-aws-creds` then `aws eks update-kubeconfig` |

---

## Quick Reference — Future Setup for Any App

```bash
# 1. Install Argo CD (one-time per cluster)
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# 2. Wait for pods
kubectl get pods -n argocd -w

# 3. Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# 4. Connect private repo (apply secret with GitLab/GitHub token)
kubectl apply -f repository-secret.yml

# 5. Create Application (point to repo + path)
kubectl apply -f application.yml

# 6. Port-forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443 &

# 7. Login CLI
argocd login localhost:8080 --username admin --password <PASSWORD> --insecure

# 8. Sync
argocd app sync <app-name>

# 9. Enable auto-sync
argocd app set <app-name> --sync-policy automated --self-heal --auto-prune
```

---

## Next Step

Migration guide for existing EKS apps → [15-argocd-migration.md](15-argocd-migration.md)

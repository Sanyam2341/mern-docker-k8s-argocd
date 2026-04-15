# Argo CD Migration Guide — Existing EKS Apps

## Overview

This guide covers migrating existing EKS applications (currently deployed via `kubectl apply`, Helm, or CI/CD) to Argo CD GitOps. Goal: zero downtime, zero surprises.

---

## Phase 1: Pre-Checks (Before Touching Anything)

### 1.1 Check if Argo CD is Already Installed

```bash
kubectl get namespace argocd
kubectl get pods -n argocd
```

- If namespace exists and pods are running → skip to Phase 2
- If not → install Argo CD first (see 14-argocd.md)

### 1.2 List All Resources in the App's Namespace

```bash
# Replace <namespace> with your app's namespace
kubectl get all -n <namespace>
```

This shows Deployments, Services, Pods, ReplicaSets, StatefulSets, etc.

For a complete picture (includes ConfigMaps, Secrets, Ingress, PVCs):

```bash
kubectl get all,configmap,secret,ingress,pvc -n <namespace>
```

Save this as your "before" snapshot:

```bash
kubectl get all,configmap,secret,ingress,pvc -n <namespace> -o yaml > before-migration-snapshot.yaml
```

### 1.3 Check if K8s Manifests Exist in Git

This is the most important check. Argo CD reads from Git — if your YAML files aren't in a repo, Argo CD has nothing to work with.

**Ask these questions:**

| Question | If YES | If NO |
|---|---|---|
| Are all Deployment YAMLs in Git? | ✅ Ready | ❌ Export them first (see 1.4) |
| Are all Service YAMLs in Git? | ✅ Ready | ❌ Export them first |
| Are ConfigMaps in Git? | ✅ Ready | ❌ Export them first |
| Are Secrets in Git? | ⚠️ Should NOT be in Git | Need secrets strategy (see Phase 2) |
| Was `kubectl edit` used to change anything? | ⚠️ Those changes aren't in Git | Export current state (see 1.4) |
| Are there Helm releases? | Need to decide: keep Helm or convert to plain YAML | |

### 1.4 Export Current Cluster State to YAML (If Manifests Not in Git)

If someone deployed via `kubectl apply` from local files that aren't in Git, or used `kubectl edit`:

```bash
# Export a specific deployment
kubectl get deployment <name> -n <namespace> -o yaml > deployment.yml

# Export a specific service
kubectl get service <name> -n <namespace> -o yaml > service.yml

# Export a configmap
kubectl get configmap <name> -n <namespace> -o yaml > configmap.yml

# Export everything at once
kubectl get all -n <namespace> -o yaml > all-resources.yaml
```

**Clean up the exported YAML** — remove these auto-generated fields before committing to Git:

```yaml
# REMOVE these from every exported resource:
metadata:
  creationTimestamp: ...    # remove
  resourceVersion: ...     # remove
  uid: ...                 # remove
  generation: ...          # remove
  managedFields: ...       # remove entire block
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: ...  # remove
status: ...                # remove entire block
```

These fields are cluster-specific and will cause conflicts if left in.

### 1.5 Check for Drift (Git vs Cluster)

If you already have manifests in Git, check if the cluster matches:

```bash
# Dry-run apply — shows what WOULD change without actually changing anything
kubectl diff -f <your-manifests-folder>/
```

If output is empty → Git and cluster match ✅
If output shows differences → someone changed something via `kubectl edit` or the YAML is outdated ⚠️

### 1.6 Check Current Image Tags

```bash
kubectl get deployments -n <namespace> -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[*].image}{"\n"}{end}'
```

Verify these match what's in your Git YAML files. If someone did `kubectl set image` manually, the cluster will have a different tag than Git.

### 1.7 Check for Secrets

```bash
kubectl get secrets -n <namespace>
```

List which secrets exist. These need special handling (see Phase 2).

---

## Phase 2: Secrets Strategy

Secrets should NOT be in Git (plain text passwords in a repo = security risk). Decide your approach:

### Option A: Manual kubectl apply (Simplest)

Keep secrets out of Git. Apply them manually before Argo CD syncs:

```bash
kubectl create secret generic <secret-name> \
  --from-literal=KEY1=value1 \
  --from-literal=KEY2=value2 \
  -n <namespace>
```

**Pros:** Simple, no extra tools
**Cons:** Manual step, not automated, easy to forget

### Option B: AWS Secrets Manager + External Secrets Operator (Recommended for Production)

Secrets live in AWS Secrets Manager. External Secrets Operator syncs them into K8s automatically.

```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
```

Then create an ExternalSecret YAML (this IS safe to put in Git):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-secret
  namespace: <namespace>
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: db-secret
  data:
    - secretKey: DB_PASSWORD
      remoteRef:
        key: /myapp/db-password
```

**Pros:** Fully automated, secrets never in Git, rotation support
**Cons:** More setup, AWS Secrets Manager cost

### Option C: Sealed Secrets (Middle Ground)

Encrypt secrets so they're safe to put in Git:

```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Install kubeseal CLI
brew install kubeseal

# Encrypt a secret
kubectl create secret generic db-secret --from-literal=DB_PASSWORD=mypass --dry-run=client -o yaml | kubeseal -o yaml > sealed-secret.yml
```

The `sealed-secret.yml` is safe to commit to Git — only the cluster can decrypt it.

**Pros:** Secrets in Git (encrypted), fully GitOps
**Cons:** Extra tool, need to re-seal if cluster is rebuilt

### Decision Matrix

| Criteria | Manual | External Secrets | Sealed Secrets |
|---|---|---|---|
| Complexity | Low | High | Medium |
| Fully automated | ❌ | ✅ | ✅ |
| Safe in Git | N/A | ✅ (reference only) | ✅ (encrypted) |
| AWS dependency | None | AWS Secrets Manager | None |
| Best for | POC, small teams | Production | Medium teams |

---

## Phase 3: Prepare Git Repository

### 3.1 Repository Structure

Organize your manifests in Git:

```
repo/
├── k8s/                    # or manifests/ or deploy/
│   ├── namespace.yml
│   ├── configmap.yml
│   ├── deployment.yml
│   ├── service.yml
│   ├── ingress.yml
│   └── argocd/
│       ├── application.yml         # Argo CD Application definition
│       └── repository-secret.yml   # NOT in Git (.gitignore)
└── .gitignore
```

### 3.2 .gitignore

Make sure secrets are excluded:

```bash
# Add to .gitignore
k8s/secret.yml
k8s/argocd/repository-secret.yml
```

### 3.3 Push to Git

```bash
git add .
git commit -m "feat: add K8s manifests for Argo CD migration"
git push origin main
```

### 3.4 Verify Git Has Everything

```bash
# List what's in Git
git ls-files k8s/
```

Cross-check with what's running in the cluster (from Phase 1.2). Every resource in the cluster should have a corresponding YAML in Git (except secrets).

---

## Phase 4: Connect Repo to Argo CD

### 4.1 Create Repository Secret

```yaml
# k8s/argocd/repository-secret.yml
apiVersion: v1
kind: Secret
metadata:
  name: <repo-name>-creds
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://gitlab.com/<org>/<repo>.git
  username: <your-gitlab-username>
  password: <your-gitlab-pat>
```

```bash
kubectl apply -f k8s/argocd/repository-secret.yml
```

### 4.2 Verify Connection

**CLI:**
```bash
argocd repo list
```

**UI:** Settings → Repositories → should show "Successful" ✅

If it fails:
```bash
# Check the secret was created
kubectl get secrets -n argocd | grep repo

# Check the secret contents (without revealing password)
kubectl get secret <repo-name>-creds -n argocd -o jsonpath='{.data.url}' | base64 -d
```

---

## Phase 5: Create Application (START WITH MANUAL SYNC)

⚠️ **Critical: Always start with Manual sync for production migrations.** This lets you review what Argo CD will do before it does it.

### 5.1 Create Application YAML

```yaml
# k8s/argocd/application.yml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <app-name>
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://gitlab.com/<org>/<repo>.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: <app-namespace>
  syncPolicy: {}
```

```bash
kubectl apply -f k8s/argocd/application.yml
```

### 5.2 Check What Argo CD Sees

```bash
# Check app status
argocd app get <app-name>

# See the diff — MOST IMPORTANT COMMAND
argocd app diff <app-name>
```

**Read the diff carefully!** It shows exactly what Argo CD thinks is different between Git and cluster.

Common diff scenarios:

| Diff shows | What it means | Action |
|---|---|---|
| No diff | Git and cluster match perfectly | Safe to sync ✅ |
| Extra fields in cluster | K8s added defaults (normal) | Safe to sync ✅ |
| Different image tag | Someone did `kubectl set image` | Update Git YAML to match, then sync |
| Different replicas | Someone did `kubectl scale` | Decide which is correct, update Git |
| Missing resources | Git has resources not in cluster | Sync will create them |
| Extra resources in cluster | Cluster has resources not in Git | Won't be affected unless prune is ON |

### 5.3 Dry Run Sync (Preview Without Applying)

```bash
argocd app sync <app-name> --dry-run
```

This shows what WOULD happen without actually doing it. Review the output.

---

## Phase 6: First Sync

### 6.1 Apply Secrets First (If Using Manual Approach)

```bash
kubectl apply -f k8s/secret.yml
# OR
kubectl create secret generic <secret-name> \
  --from-literal=KEY=value \
  -n <namespace>
```

### 6.2 Sync

**Via CLI:**
```bash
argocd app sync <app-name>
```

**Via UI:** Click app → Sync → Synchronize

### 6.3 Verify After Sync

```bash
# Check all pods are running
kubectl get pods -n <namespace>

# Check app health in Argo CD
argocd app get <app-name>

# Should show: Synced ✅ Healthy ✅
```

### 6.4 Test the Application

```bash
# Hit the health endpoint
curl http://<your-app-url>/health

# Check logs for errors
kubectl logs -l app=<app-label> -n <namespace> --tail=50

# Check events for issues
kubectl get events -n <namespace> --sort-by='.lastTimestamp' | tail -20
```

### 6.5 Compare Before and After

```bash
# Take "after" snapshot
kubectl get all,configmap,secret,ingress,pvc -n <namespace> -o yaml > after-migration-snapshot.yaml

# Compare (should be minimal differences)
diff before-migration-snapshot.yaml after-migration-snapshot.yaml
```

---

## Phase 7: Enable Auto-Sync (After Validation)

Only after you've confirmed everything works with manual sync:

### 7.1 Enable Auto-Sync (Without Self-Heal First)

```bash
argocd app set <app-name> --sync-policy automated --auto-prune
```

Test by pushing a small change to Git (e.g., add a label). Verify Argo CD auto-applies it.

### 7.2 Enable Self-Heal (Full GitOps)

```bash
argocd app set <app-name> --self-heal
```

Verify:
```bash
argocd app get <app-name> | grep "Sync Policy"
# Should show: Automated (Prune, Self-Heal)
```

Test by manually changing something:
```bash
kubectl scale deployment <name> --replicas=5 -n <namespace>
# Wait ~30 seconds
kubectl get pods -n <namespace>
# Should revert back to original replica count
```

### 7.3 Update Application YAML

Update your `application.yml` in Git to reflect the auto-sync policy:

```yaml
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

```bash
git add k8s/argocd/application.yml
git commit -m "feat: enable auto-sync with self-heal"
git push origin main
```

---

## Phase 8: Post-Migration Validation Checklist

Run through this checklist after migration:

```bash
# 1. Argo CD sees the app
argocd app list

# 2. App is synced and healthy
argocd app get <app-name> | grep -E "Status|Health|Sync"

# 3. No diff between Git and cluster
argocd app diff <app-name>
# (should show nothing)

# 4. All pods running
kubectl get pods -n <namespace>

# 5. All services have endpoints
kubectl get endpoints -n <namespace>

# 6. Ingress is working (if applicable)
kubectl get ingress -n <namespace>
curl -I http://<app-url>

# 7. Logs are clean
kubectl logs -l app=<app-label> -n <namespace> --tail=20

# 8. Secrets exist
kubectl get secrets -n <namespace>

# 9. PVCs are bound (if applicable)
kubectl get pvc -n <namespace>

# 10. Auto-sync is working (push a harmless change)
# Add a comment or label in a YAML, push to Git, verify Argo CD applies it
```

---

## Rollback Plan

### If Argo CD Sync Breaks Something

**Option 1: Rollback via Argo CD**
```bash
# See deployment history
argocd app history <app-name>

# Rollback to previous version
argocd app rollback <app-name> <ID>
```

**Option 2: Rollback via Git**
```bash
# Revert the bad commit
git revert HEAD
git push origin main
# Argo CD auto-syncs the reverted YAML
```

**Option 3: Disable Argo CD and Fix Manually**
```bash
# Disable auto-sync
argocd app set <app-name> --sync-policy none

# Now you can use kubectl freely without Argo CD reverting
kubectl apply -f <fixed-manifest>.yml

# Re-enable auto-sync after fixing Git
argocd app set <app-name> --sync-policy automated --self-heal --auto-prune
```

**Option 4: Nuclear — Delete Argo CD Application (App Keeps Running)**
```bash
# This removes Argo CD's management, NOT your actual app
argocd app delete <app-name> --cascade=false
```

`--cascade=false` is critical — it means "delete the Argo CD Application object but leave the actual K8s resources running." Without this flag, it would delete your pods too.

---

## Team Workflow Change

### Before Argo CD
```
Developer → kubectl apply -f deployment.yml → cluster updated
           (no review, no history, anyone can do anything)
```

### After Argo CD
```
Developer → git push → PR review → merge to main → Argo CD auto-deploys
           (reviewed, audited, reversible)
```

### Rules for the Team

| Rule | Why |
|---|---|
| Never use `kubectl apply` for managed resources | Argo CD will revert your changes |
| Never use `kubectl edit` | Same reason — Git is the source of truth |
| Never use `kubectl set image` | Update the image tag in YAML, push to Git |
| Always push changes via Git | PR → review → merge → auto-deploy |
| Secrets are the exception | Apply manually or use External Secrets |

### What's Still OK to Use

| Command | OK? | Why |
|---|---|---|
| `kubectl get` | ✅ | Read-only, doesn't change anything |
| `kubectl describe` | ✅ | Read-only |
| `kubectl logs` | ✅ | Read-only |
| `kubectl exec` | ✅ | Debugging, doesn't change manifests |
| `kubectl port-forward` | ✅ | Temporary tunnel, no changes |
| `kubectl apply` | ❌ | Use Git instead |
| `kubectl edit` | ❌ | Use Git instead |
| `kubectl delete` | ❌ | Use Git instead (remove from YAML) |
| `kubectl scale` | ❌ | Use Git instead |

---

## Multiple Environments

### Option A: Different Branches (Simple)

```
main branch     → Argo CD App "myapp-prod"  → prod namespace
staging branch  → Argo CD App "myapp-stage" → staging namespace
dev branch      → Argo CD App "myapp-dev"   → dev namespace
```

```yaml
# application-prod.yml
spec:
  source:
    targetRevision: main
  destination:
    namespace: myapp-prod

# application-staging.yml
spec:
  source:
    targetRevision: staging
  destination:
    namespace: myapp-staging
```

### Option B: Different Folders (Better)

```
repo/
├── environments/
│   ├── dev/
│   │   ├── deployment.yml      (replicas: 1, image: v3-dev)
│   │   └── configmap.yml
│   ├── staging/
│   │   ├── deployment.yml      (replicas: 2, image: v3)
│   │   └── configmap.yml
│   └── prod/
│       ├── deployment.yml      (replicas: 5, image: v3)
│       └── configmap.yml
```

```yaml
# application-prod.yml
spec:
  source:
    path: environments/prod
  destination:
    namespace: myapp-prod
```

### Option C: Kustomize Overlays (Best for Large Teams)

```
repo/
├── base/                       # shared manifests
│   ├── deployment.yml
│   ├── service.yml
│   └── kustomization.yml
├── overlays/
│   ├── dev/
│   │   └── kustomization.yml   # patches: replicas=1, image=v3-dev
│   ├── staging/
│   │   └── kustomization.yml   # patches: replicas=2, image=v3
│   └── prod/
│       └── kustomization.yml   # patches: replicas=5, image=v3
```

Argo CD natively supports Kustomize — just point the Application path to the overlay folder.

---

## Monitoring After Migration

### Daily Checks (or set up alerts)

```bash
# Quick health check of all Argo CD apps
argocd app list

# Check for any OutOfSync apps
argocd app list -o json | jq '.[] | select(.status.sync.status != "Synced") | .metadata.name'

# Check for any unhealthy apps
argocd app list -o json | jq '.[] | select(.status.health.status != "Healthy") | .metadata.name'
```

### If an App Shows OutOfSync

```bash
# See what's different
argocd app diff <app-name>

# Check recent Git commits
git log --oneline -5

# Check Argo CD sync history
argocd app history <app-name>
```

### If an App Shows Unhealthy

```bash
# Check pod status
kubectl get pods -n <namespace>

# Check events
kubectl get events -n <namespace> --sort-by='.lastTimestamp' | tail -10

# Check logs of failing pod
kubectl logs <pod-name> -n <namespace>
```

---

## Migration Checklist — One Page Summary

```
□ Phase 1: Pre-Checks
  □ List all resources in namespace
  □ Save "before" snapshot
  □ Verify all manifests are in Git
  □ Export and clean any missing manifests
  □ Check for drift (kubectl diff)
  □ Verify image tags match Git
  □ List all secrets

□ Phase 2: Secrets Strategy
  □ Decide: Manual / External Secrets / Sealed Secrets
  □ Ensure secrets exist in cluster before sync

□ Phase 3: Prepare Git Repo
  □ Organize manifests in folder
  □ Add secrets to .gitignore
  □ Push to Git
  □ Verify with git ls-files

□ Phase 4: Connect Repo
  □ Create repository-secret.yml
  □ Apply secret
  □ Verify connection (argocd repo list)

□ Phase 5: Create Application (MANUAL SYNC)
  □ Create application.yml with syncPolicy: {}
  □ Apply it
  □ Run argocd app diff — READ THE DIFF
  □ Dry run sync

□ Phase 6: First Sync
  □ Apply secrets first
  □ Sync
  □ Verify pods running
  □ Verify app health
  □ Test application endpoints
  □ Compare before/after snapshots

□ Phase 7: Enable Auto-Sync
  □ Enable automated sync (without self-heal first)
  □ Test with small Git push
  □ Enable self-heal
  □ Test drift detection
  □ Update application.yml in Git

□ Phase 8: Post-Migration Validation
  □ Run full checklist (10 commands)
  □ Confirm team knows new workflow
  □ Document any app-specific notes
```

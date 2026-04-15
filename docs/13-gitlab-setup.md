# GitLab Setup — Pushing Code for Argo CD

## Why GitLab?

Argo CD needs a Git repo to watch. We already have GitHub (`origin`), but for this POC we're using a GitLab repo under the Nielsen user space — keeps it separate from the main `audio/` projects.

**Repo:** `https://gitlab.com/nielsen-media/users/sanyam.sharma/argo-cd-poc.git`

---

## Why Not Just Use GitHub?

Either works. We chose GitLab because that's where Nielsen projects live. Argo CD doesn't care — it just needs a Git URL.

---

## Setup Steps

### Step 1: Create GitLab Repo

**Where:** GitLab → New Project → Create blank project

| Field | Value |
|---|---|
| Project name | `argo-cd-poc` |
| Project URL | `nielsen-media/users/sanyam.sharma` |
| Visibility | Private |
| Initialize with README | Uncheck (or delete it later) |

### Step 2: Add GitLab as a Second Remote

```bash
cd /path/to/note-app
git remote add gitlab https://gitlab.com/nielsen-media/users/sanyam.sharma/argo-cd-poc.git
```

Now you have two remotes:

| Remote | Points to | Command |
|---|---|---|
| `origin` | GitHub repo | `git push origin main` |
| `gitlab` | GitLab repo | `git push gitlab main` |

Verify:
```bash
git remote -v
```

### Step 3: Create GitLab Personal Access Token

GitLab requires a token for HTTPS push (password auth is disabled).

**Where:** GitLab → Profile → **User Settings → Access Tokens → Add new token**

GitLab shows two options:
- **Fine-grained** — scoped per project/group (overkill for POC)
- **Legacy (Classic)** — simple, works everywhere ✅

| Field | Value |
|---|---|
| Token type | Legacy (Personal access token classic) |
| Token name | `argo-cd-poc` |
| Expiration | 30 days |
| Scopes | `api` |

> ⚠️ Copy the token immediately — GitLab only shows it once.

### Step 4: Set Remote URL with Token

```bash
git remote set-url gitlab https://sanyam.sharma:<YOUR_TOKEN>@gitlab.com/nielsen-media/users/sanyam.sharma/argo-cd-poc.git
```

### Step 5: Push Code

If the GitLab repo is empty:
```bash
git push gitlab main
```

If GitLab has existing content (e.g., auto-created README) and `main` is protected:

1. GitLab → repo → **Settings → Repository → Protected branches** → Unprotect `main`
2. Force push:
```bash
git push gitlab main --force
```

---

## What Got Pushed?

The entire repo — not just `k8s/`. That's fine because Argo CD will only watch the path we tell it to:

```
note-app/
├── backend/          # app code (Argo CD ignores)
├── frontend/         # app code (Argo CD ignores)
├── docs/             # documentation (Argo CD ignores)
├── docker-compose.yml
└── k8s/              # 👈 Argo CD watches ONLY this folder
    ├── namespace.yml
    ├── configMap.yml
    ├── secret.yml      # in .gitignore, not pushed
    ├── postgres.yml
    ├── backend-deployment.yml
    ├── backend-service.yaml
    ├── frontend-deployment.yml
    ├── frontend-service.yml
    └── ingress.yml
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `HTTP Basic: Access denied` | No token or expired token | Create new PAT, update remote URL |
| `rejected (fetch first)` | Remote has commits you don't have locally | Force push or pull --rebase first |
| `pre-receive hook declined` | Branch is protected, can't force push | Unprotect branch in GitLab settings |

---

## Next Step

Argo CD installation on EKS → [14-argocd.md](14-argocd.md)

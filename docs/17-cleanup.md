# Cleanup Guide — Delete Everything to Stop Costs

## Why Order Matters

Some resources depend on others. Deleting in wrong order = orphaned resources still costing money.

```
Delete order (top to bottom):
  1. Argo CD Application (stops managing resources)
  2. Argo CD itself (removes pods in argocd namespace)
  3. Ingress (removes ALB — $16-22/mo)
  4. K8s manifests (removes pods, PVCs, EBS volumes)
  5. Node group (removes EC2 instances — $60/mo)
  6. EKS cluster (removes control plane — $73/mo)
  7. Manual cleanup (IAM roles, policies, OIDC, subnet tags, ECR)
```

---

## Step 1: Delete Argo CD Application

```bash
# Remove Argo CD's management of your app (keeps app running)
argocd app delete note-app --cascade=false

# OR if CLI not available
kubectl delete application note-app -n argocd
```

`--cascade=false` = delete Argo CD Application object only, don't delete the actual K8s resources yet.

---

## Step 2: Uninstall Argo CD

```bash
# If installed via Helm
helm uninstall argocd -n argocd

# If installed via plain YAML
kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Delete namespace
kubectl delete namespace argocd
```

Verify:
```bash
kubectl get all -n argocd
# Should show: No resources found
```

---

## Step 3: Delete Ingress (Removes ALB)

⚠️ **This must be done BEFORE deleting the ALB Controller or node group.** Otherwise the ALB becomes orphaned and keeps costing money.

```bash
kubectl delete -f k8s/ingress.yml
```

Verify ALB is deleted:
```bash
aws elbv2 describe-load-balancers --region us-east-1 \
  --query 'LoadBalancers[?contains(DNSName, `noteappi`)].{DNS:DNSName,State:State.Code}' \
  --output table
```

Should return empty. Wait 2-3 minutes if it still shows.

---

## Step 4: Delete All K8s Manifests

```bash
kubectl delete -f k8s/backend-deployment.yml
kubectl delete -f k8s/backend-service.yaml
kubectl delete -f k8s/frontend-deployment.yml
kubectl delete -f k8s/frontend-service.yml
kubectl delete -f k8s/postgres.yml
kubectl delete -f k8s/configMap.yml
kubectl delete -f k8s/secret.yml
```

Delete PVCs (this deletes the EBS volumes):
```bash
kubectl delete pvc --all -n note-app
```

Delete namespace:
```bash
kubectl delete -f k8s/namespace.yml
```

Verify:
```bash
kubectl get all -n note-app
# Should show: No resources found

kubectl get pvc -n note-app
# Should show: No resources found
```

Verify EBS volumes are deleted:
```bash
aws ec2 describe-volumes --region us-east-1 \
  --filters "Name=tag-key,Values=kubernetes.io/cluster/note-app-cluster" \
  --query 'Volumes[*].{ID:VolumeId,State:State,Size:Size}' \
  --output table
```

If volumes still exist with state `available`, delete manually:
```bash
aws ec2 delete-volume --volume-id <volume-id> --region us-east-1
```

---

## Step 5: Uninstall ALB Controller

```bash
helm uninstall aws-load-balancer-controller -n kube-system
```

---

## Step 6: Delete Node Group

**Where:** AWS Console → EKS → Clusters → `note-app-cluster` → Compute → Node groups → `note-app-nodes` → Delete

Or via CLI:
```bash
aws eks delete-nodegroup \
  --cluster-name note-app-cluster \
  --nodegroup-name note-app-nodes \
  --region us-east-1
```

Wait for deletion (takes 5-10 minutes):
```bash
aws eks describe-nodegroup \
  --cluster-name note-app-cluster \
  --nodegroup-name note-app-nodes \
  --region us-east-1 \
  --query 'nodegroup.status'
```

When it returns an error (not found), it's deleted.

---

## Step 7: Delete EKS Cluster

**Where:** AWS Console → EKS → Clusters → `note-app-cluster` → Delete

Or via CLI:
```bash
aws eks delete-cluster --name note-app-cluster --region us-east-1
```

Wait for deletion (takes 5-10 minutes):
```bash
aws eks describe-cluster --name note-app-cluster --region us-east-1 --query 'cluster.status'
```

---

## Step 8: Manual Cleanup (AWS Console)

### 8.1 IAM Roles

**Where:** IAM → Roles → Delete each:

| Role | Used by |
|---|---|
| `eks-cluster-role` | EKS control plane |
| `eks-node-role` | Worker nodes |
| `AmazonEKS_EBS_CSI_DriverRole` | EBS CSI Driver |
| `AmazonEKS_LB_Controller_Role` | ALB Controller |

Before deleting each role, detach all policies first:
```bash
# List attached policies
aws iam list-attached-role-policies --role-name <role-name>

# Detach each policy
aws iam detach-role-policy --role-name <role-name> --policy-arn <policy-arn>

# Delete the role
aws iam delete-role --role-name <role-name>
```

### 8.2 IAM Policies

**Where:** IAM → Policies → Delete:

| Policy | Used by |
|---|---|
| `AWSLoadBalancerControllerIAMPolicy` | ALB Controller role |

```bash
aws iam delete-policy --policy-arn arn:aws:iam::598917779747:policy/AWSLoadBalancerControllerIAMPolicy
```

### 8.3 OIDC Provider

**Where:** IAM → Identity providers → Delete the one with your cluster's OIDC URL

```bash
aws iam delete-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::598917779747:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/916606B904B35AA89F7B2DC20C7E2F7A
```

### 8.4 Subnet Tags

Remove the ELB tags added to subnets (if you added them for ALB):

```bash
# Public subnets — remove ELB tag
aws ec2 delete-tags --resources subnet-0994500132b3a4092 subnet-0d26ea15e2ee3f6ed \
  --tags Key=kubernetes.io/role/elb --region us-east-1

# Private subnets — remove internal ELB tag
aws ec2 delete-tags --resources subnet-00062ae09637d3d7f subnet-02cf1544383ef6be7 \
  --tags Key=kubernetes.io/role/internal-elb --region us-east-1
```

### 8.5 ECR Repositories (Optional — Keep if Reusing)

```bash
# Delete all images in repo first
aws ecr batch-delete-image --repository-name note-app-backend \
  --image-ids "$(aws ecr list-images --repository-name note-app-backend --query 'imageIds[*]' --output json)" \
  --region us-east-1

aws ecr batch-delete-image --repository-name note-app-frontend \
  --image-ids "$(aws ecr list-images --repository-name note-app-frontend --query 'imageIds[*]' --output json)" \
  --region us-east-1

# Delete repos
aws ecr delete-repository --repository-name note-app-backend --region us-east-1
aws ecr delete-repository --repository-name note-app-frontend --region us-east-1
```

### 8.6 Security Groups (Auto-Created by ALB)

Check if ALB security groups still exist:
```bash
aws ec2 describe-security-groups --region us-east-1 \
  --filters "Name=tag-key,Values=kubernetes.io/cluster/note-app-cluster" \
  --query 'SecurityGroups[*].{ID:GroupId,Name:GroupName}' \
  --output table
```

Delete if found:
```bash
aws ec2 delete-security-group --group-id <sg-id> --region us-east-1
```

---

## Step 9: Verify Everything is Gone

```bash
# No EKS cluster
aws eks list-clusters --region us-east-1

# No orphaned EBS volumes
aws ec2 describe-volumes --region us-east-1 \
  --filters "Name=tag-key,Values=kubernetes.io/cluster/note-app-cluster" \
  --output table

# No orphaned ALBs
aws elbv2 describe-load-balancers --region us-east-1 \
  --query 'LoadBalancers[*].{DNS:DNSName,State:State.Code}' \
  --output table

# No orphaned security groups
aws ec2 describe-security-groups --region us-east-1 \
  --filters "Name=tag-key,Values=kubernetes.io/cluster/note-app-cluster" \
  --output table
```

---

## Cost Summary (What You're Saving)

| Resource | Monthly Cost | Deleted in Step |
|---|---|---|
| EKS Cluster | ~$73 | Step 7 |
| 2x t3.medium nodes | ~$60 | Step 6 |
| ALB | ~$16-22 | Step 3 |
| EBS (1GB gp2) | ~$3.30 | Step 4 |
| ECR | ~$0.50 | Step 8.5 |
| **Total** | **~$155/mo** | |

---

## One-Page Checklist

```
□ Step 1: Delete Argo CD Application
□ Step 2: Uninstall Argo CD (Helm or YAML)
□ Step 3: Delete Ingress (removes ALB) — VERIFY ALB IS GONE
□ Step 4: Delete all K8s manifests + PVCs — VERIFY EBS IS GONE
□ Step 5: Uninstall ALB Controller (Helm)
□ Step 6: Delete node group — WAIT FOR COMPLETION
□ Step 7: Delete EKS cluster — WAIT FOR COMPLETION
□ Step 8: Manual cleanup
  □ IAM Roles (4 roles)
  □ IAM Policies (1 custom policy)
  □ OIDC Provider
  □ Subnet tags
  □ ECR repos (optional)
  □ Security groups (if orphaned)
□ Step 9: Verify everything is gone
```

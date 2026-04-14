# EKS Cluster Setup — Step by Step

Everything we did to get the EKS cluster running, with the exact values we filled in.

---

## Step 1: Create IAM Roles

EKS needs 2 IAM roles — different permissions for different components.

### Role 1: `eks-cluster-role` (for the Control Plane)

**Where:** IAM → Roles → Create role

| Field | Value |
|---|---|
| Trusted entity type | AWS service |
| Use case | EKS → EKS - Cluster |
| Policy | `AmazonEKSClusterPolicy` |
| Role name | `eks-cluster-role` |

This lets the control plane manage VPC networking, create load balancers, and manage security groups on your behalf.

### Role 2: `eks-node-role` (for Worker Nodes)

**Where:** IAM → Roles → Create role

| Field | Value |
|---|---|
| Trusted entity type | AWS service |
| Use case | EC2 |
| Role name | `eks-node-role` |

**4 Policies to attach:**

| Policy | Why |
|---|---|
| `AmazonEKSWorkerNodePolicy` | Node can register with the EKS cluster |
| `AmazonEKS_CNI_Policy` | Node can assign VPC IP addresses to pods (VPC CNI) |
| `AmazonEC2ContainerRegistryReadOnly` | Node can pull Docker images from ECR |
| `AmazonEBSCSIDriverPolicy` | Node can create/attach EBS volumes for PVCs |

### Why 2 separate roles?

Least privilege principle — control plane shouldn't pull ECR images, worker nodes shouldn't create load balancers. Each component gets only what it needs.

---

## Step 2: Create EKS Cluster (AWS Console)

**Where:** EKS Console → Add cluster → Create

### Page 1: Configure cluster

| Field | Value we used |
|---|---|
| Configuration option | **Custom configuration** (not Auto Mode — we manage nodes ourselves) |
| Cluster name | `note-app-cluster` |
| Cluster IAM role | `eks-cluster-role` |
| Kubernetes version | `1.33` (latest at the time) |
| Cluster support | Standard support (free) |
| Auto Mode | **Disabled** (we create and manage our own node groups) |
| Cluster access | Allow cluster admin access |
| Authentication mode | EKS API and ConfigMap |

### Page 2: Networking

| Field | Value we used |
|---|---|
| VPC | DEV-VPC (`vpc-076693c6911911a56`) — shared VPC |
| Subnets | All 4 subnets (2 public + 2 private) |
| Security group | Default (EKS creates its own cluster SG) |
| Cluster endpoint access | **Public and private** |

**Why Public and private?**
- Public: so `kubectl` from your laptop can reach the API server
- Private: so worker nodes (in private subnets) can reach the API server internally

### Page 3: Observability

| Field | Value we used |
|---|---|
| Control plane logging | All **disabled** (costs money, not needed for learning) |
| CloudWatch metrics | Disabled |

### Page 4: Add-ons

Select these 5 add-ons (keep default versions):

| Add-on | What it does | Why you need it |
|---|---|---|
| **Amazon VPC CNI** | Gives each pod a real VPC IP address | Without this, pods can't communicate |
| **CoreDNS** | DNS inside the cluster | `postgres` → pod IP resolution |
| **kube-proxy** | Routes traffic between services | Basic networking |
| **Amazon EBS CSI Driver** | Creates EBS volumes when PVCs are requested | Required for StatefulSet storage |
| **EKS Pod Identity Agent** | Lets pods assume IAM roles securely | Required for EBS CSI Driver permissions |

Optional add-ons we also selected (not required):
- Metrics Server — enables `kubectl top pods` for resource monitoring
- External DNS — auto-manages Route53 records (not used yet)

### Page 5: Review and Create

Review everything → **Create**

> ⏱️ Cluster creation takes ~10-15 minutes. Status goes from `Creating` → `Active`.

---

## Step 3: Set Up EBS CSI Driver IAM Role

The EBS CSI Driver add-on is installed, but it needs AWS permissions to actually create EBS volumes. Pods don't inherit the node's IAM role — they need their own.

### 3a. Create OIDC Provider

This bridges trust between Kubernetes service accounts and AWS IAM:

```bash
eksctl utils associate-iam-oidc-provider \
  --cluster note-app-cluster \
  --region us-east-1 \
  --approve
```

### 3b. Create IAM Role for EBS CSI Driver

**Where:** IAM → Roles → Create role

| Field | Value |
|---|---|
| Trusted entity type | AWS service |
| Use case | EKS - Pod Identity |
| Policy | `AmazonEBSCSIDriverPolicy` |
| Role name | `AmazonEKS_EBS_CSI_DriverRole` |

### 3c. Associate Role with the Driver

```bash
aws eks create-pod-identity-association \
  --cluster-name note-app-cluster \
  --namespace kube-system \
  --service-account ebs-csi-controller-sa \
  --role-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/AmazonEKS_EBS_CSI_DriverRole \
  --region us-east-1
```

### 3d. Restart the Controller

```bash
kubectl rollout restart deployment ebs-csi-controller -n kube-system
```

### Why pods need their own IAM role (not the node role):

- Node (EC2) has `eks-node-role` — the machine itself has permissions
- But pods running INSIDE the node don't inherit those permissions
- Each pod gets permissions through its own Service Account + IAM Role
- Think of it like: the office building (node) has a master key, but each employee (pod) still needs their own badge

---

## Step 4: Create Node Group

**Where:** EKS → Clusters → `note-app-cluster` → Compute tab → Add node group

### Page 1: Node group configuration

| Field | Value we used |
|---|---|
| Node group name | `note-app-nodes` |
| Node IAM role | `eks-node-role` |
| Launch template | None (use default) |

### Page 2: Compute and scaling

| Field | Value we used |
|---|---|
| AMI type | Amazon Linux 2023 (AL2023_x86_64_STANDARD) |
| Capacity type | On-Demand |
| Instance type | `t3.medium` (2 vCPU, 4 GB RAM) |
| Disk size | 20 GB |
| Desired size | 2 |
| Minimum size | 1 |
| Maximum size | 3 |

**Why `t3.medium`?**
- `t3.micro`/`t3.small` — not enough memory for K8s system pods + your app
- `t3.medium` (4 GB) — minimum recommended for EKS worker nodes
- K8s system pods (kube-proxy, VPC CNI, CoreDNS, etc.) consume ~1-1.5 GB themselves

### Page 3: Networking

| Field | Value we used |
|---|---|
| Subnets | **Private subnets only** (`subnet-00062ae09637d3d7f`, `subnet-02cf1544383ef6be7`) |
| Configure SSH access | Disabled (not needed, use `kubectl exec` instead) |
| Enable node auto repair | ✅ Enabled |

**Why private subnets only?**
- Worker nodes should NOT be directly accessible from the internet
- They communicate with the control plane via the private endpoint
- Traffic from internet reaches nodes through the ELB (which sits in public subnets)

### Page 4: Review and Create

Review → **Create**

> ⏱️ Node group creation takes ~3-5 minutes. Nodes go from `Not Ready` → `Ready`.

---

## Step 5: Tag Subnets for ELB Discovery

This is a **critical step** that's easy to miss. When you create a `LoadBalancer` type Service, AWS needs to know which subnets to place the ELB in. It discovers this through tags.

### Why is this needed?

- EKS doesn't automatically know which subnets are public vs private
- Especially in a shared VPC (like our DEV-VPC) that wasn't created by EKS
- Without these tags, you get: `could not find any suitable subnets for creating the ELB`

### Tags to add:

**Public subnets** (for internet-facing ELBs):

| Tag Key | Value |
|---|---|
| `kubernetes.io/role/elb` | `1` |
| `kubernetes.io/cluster/note-app-cluster` | `shared` |

**Private subnets** (for internal ELBs):

| Tag Key | Value |
|---|---|
| `kubernetes.io/role/internal-elb` | `1` |
| `kubernetes.io/cluster/note-app-cluster` | `shared` |

### Via CLI:

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

### Via AWS Console:

VPC → Subnets → select subnet → Tags tab → Manage tags → Add tag

### How to tell public vs private subnets:

Check the Route Table for each subnet:
- Has route to `igw-xxxxx` (Internet Gateway) → **Public**
- Has route to `nat-xxxxx` (NAT Gateway) → **Private**

---

## Step 6: Connect kubectl to EKS

```bash
# Update kubeconfig (adds cluster to ~/.kube/config)
aws eks update-kubeconfig --name note-app-cluster --region us-east-1

# Verify connection
kubectl get nodes
```

Expected output:
```
NAME                              STATUS   ROLES    AGE   VERSION
ip-10-207-209-124.ec2.internal    Ready    <none>   5m    v1.33.0
ip-10-207-210-233.ec2.internal    Ready    <none>   5m    v1.33.0
```

If you see 2 nodes in `Ready` status — your cluster is good to go! 🎉

---

## Summary — What We Created

| Resource | Name | Purpose |
|---|---|---|
| IAM Role | `eks-cluster-role` | Control plane permissions |
| IAM Role | `eks-node-role` | Worker node permissions |
| IAM Role | `AmazonEKS_EBS_CSI_DriverRole` | EBS CSI Driver pod permissions |
| OIDC Provider | (auto-created by eksctl) | Bridges K8s ↔ AWS IAM trust |
| EKS Cluster | `note-app-cluster` | The Kubernetes cluster |
| Node Group | `note-app-nodes` | 2x t3.medium worker nodes |
| Subnet Tags | `kubernetes.io/role/elb` etc. | ELB subnet discovery |

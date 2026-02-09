# Shopple Admin - Kubernetes Deployment

Production-grade Kubernetes deployment manifests for the Shopple Admin platform. Supports both local development (Docker Desktop/Minikube) and cloud environments (GKE, EKS, AKS).

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Operations](#operations)
- [Monitoring](#monitoring)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Kubernetes cluster (v1.24+)
- `kubectl` CLI configured
- Docker (for building images locally)
- 4GB+ RAM, 2+ CPU cores available to cluster

### Local Development (Docker Desktop / Minikube)

```bash
# 1. Clone and configure
cd shopple-admin
cp .env.example .env  # Edit as needed

# 2. Deploy the stack
bash k8s/scripts/start.sh

# 3. Access services
#    Frontend:   http://localhost
#    Backend:    http://localhost/api
#    Logs:       http://localhost/dashboards
```

**Quick restart** (skip image rebuild):
```bash
bash k8s/scripts/start.sh --quick
```

### Cloud Production Deployment

See [Cloud Deployment Guide](#cloud-deployment-guide) below for complete instructions.

---

## Architecture

### System Overview

```
                        INTERNET / CLIENT
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │              NGINX Ingress Controller                        │
  │            (Single LoadBalancer Entry Point)                 │
  │                                                              │
  │  Path Routing:                                              │
  │  /                    → Frontend Service (port 3000)        │
  │  /api/auth/*          → Frontend Service (Next.js API)      │
  │  /api/admin/*         → Frontend Service (sessions)         │
  │  /api/*               → Backend Service (port 5001)         │
  │  /dashboards/*        → OpenSearch Dashboards (port 5601)   │
  └─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
      ┌─────────┐         ┌─────────┐         ┌──────────┐
      │Frontend │         │ Backend │         │Dashboards│
      │(ClusterIP)        │(ClusterIP)        │(ClusterIP)
      │  Next.js│         │  Flask  │         │OpenSearch│
      └─────────┘         └─────────┘         └──────────┘
                                │                    │
                                ▼                    ▼
                          ┌─────────┐         ┌──────────┐
                          │ Worker  │         │OpenSearch│
                          │(ClusterIP)        │(StatefulSet)
                          │Celery-like        │   Logs   │
                          └─────────┘         └──────────┘
                                │
                                ▼
                          ┌─────────┐
                          │ Crawler │
                          │(ClusterIP)
                          │Web Scraper
                          └─────────┘
```

### Components

| Component | Type | Replicas | Purpose | Persistent Storage |
|-----------|------|----------|---------|-------------------|
| **Frontend** | Deployment | 1 | React/Next.js UI | None |
| **Backend** | Deployment | 1 | Python Flask API | backend-data (1Gi) |
| **Worker** | Deployment | 1 | Background job processing | None |
| **Crawler** | Deployment | 1 | Web scraping service | crawler-* (9Gi total) |
| **OpenSearch** | StatefulSet | 1 | Search engine & log storage | opensearch-data (20Gi) |
| **OpenSearch Dashboards** | Deployment | 1 | Log visualization UI | None |
| **Fluent Bit** | Sidecar | - | Log shipping (backend, frontend, worker) | None |
| **NGINX Ingress** | DaemonSet | 1 | HTTP(S) routing & load balancing | None |

### Networking

**Service Discovery**:
- Internal DNS: `<service-name>.<namespace>.svc.cluster.local`
- Example: Backend calls OpenSearch at `http://opensearch:9200`

**Ingress Controller** benefits:
- **Cost efficiency**: Single LoadBalancer instead of one per service
- **Centralized routing**: Path-based and host-based routing
- **TLS termination**: HTTPS handled at edge
- **Rate limiting & WAF**: Available via Ingress annotations

### Data Persistence

| PVC Name | Size | Mount Path | Purpose |
|----------|------|------------|---------|
| backend-data | 1Gi | `/app/backend/data` | Encrypted keys, config, notes |
| crawler-cache | 2Gi | `/app/crawler/cache` | Scraped data cache |
| crawler-jobs | 1Gi | `/app/crawler/jobs` | Job queue state |
| crawler-logs | 1Gi | `/app/crawler/logs` | Crawler execution logs |
| crawler-output | 5Gi | `/app/crawler/output` | Raw scraped JSON files |
| opensearch-data | 20Gi | `/usr/share/opensearch/data` | Search indexes & application logs |

**Total storage**: 30Gi provisioned

---

## Deployment

### Manifest Structure

```
k8s/
├── 00-storage.yaml              # PersistentVolumeClaims (30Gi total)
├── 01-opensearch.yaml           # StatefulSet + Service (search & logs)
├── 02-dashboards.yaml           # Deployment + Service (log UI)
├── 03-backend.yaml              # Deployment + Service (Flask API)
├── 04-frontend.yaml             # Deployment + Service (Next.js)
├── 05-crawler.yaml              # Deployment + Service (scrapers)
├── 06-worker.yaml               # Deployment + Service (background jobs)
├── 07-fluentbit-config.yaml    # ConfigMap (log shipping config)
├── 08-ingress.yaml              # Ingress (routing rules)
├── 09-rbac.yaml                 # ServiceAccount + Role + RoleBinding
└── scripts/
    ├── start.sh                 # Deployment orchestration
    ├── stop.sh                  # Graceful shutdown
    ├── clean.sh                 # Complete cleanup
    └── setup_opensearch_dashboards.sh  # Dashboard import
```

**Deployment order** (automatic via `start.sh`):
1. Storage (PVCs)
2. RBAC resources
3. Fluent Bit configuration
4. OpenSearch (wait for ready)
5. OpenSearch Dashboards
6. Backend + Worker
7. Crawler
8. Frontend
9. Ingress rules
10. Ingress Controller (if not present)

### Deployment Scripts

#### `start.sh` - Deploy Full Stack

**Full deployment** (clean slate, rebuild images):
```bash
bash k8s/scripts/start.sh
```

**Options**:

| Flag | Description | Use Case |
|------|-------------|----------|
| `--skip-build` | Skip Docker image builds | Images already built |
| `--quick` | Skip build + keep existing pods | Fast restart after config change |
| `--with-cache` | Use Docker layer cache | Faster builds during iteration |
| `--no-cache` | Force rebuild all layers | Default, ensures clean build |

**Examples**:
```bash
# Quick restart (code unchanged, config updated)
bash k8s/scripts/start.sh --quick

# Skip build (use existing images)
bash k8s/scripts/start.sh --skip-build

# Fast iterative development
bash k8s/scripts/start.sh --with-cache

# Cloud deployment
DEPLOY_MODE=cloud bash k8s/scripts/start.sh
```

#### `stop.sh` - Graceful Shutdown

**Stop pods, preserve data and secrets**:
```bash
bash k8s/scripts/stop.sh
```

**Options**:

| Flag | Description | Data Loss Risk |
|------|-------------|----------------|
| `--remove-ingress` | Delete NGINX Ingress Controller | None (takes time to reinstall) |
| `--remove-secrets` | Delete Kubernetes secrets | None (rebuild from .env) |
| `--remove-pvc` | Delete PersistentVolumeClaims | ⚠️ **YES** - all data lost |
| `--all` | Combine all removal options | ⚠️ **YES** - complete teardown |

**Examples**:
```bash
# Standard stop (fast restart later)
bash k8s/scripts/stop.sh

# Full teardown (keep PVCs)
bash k8s/scripts/stop.sh --remove-ingress --remove-secrets

# Complete removal (data loss!)
bash k8s/scripts/stop.sh --all
```

#### `clean.sh` - Complete Cleanup

**Remove all resources**:
```bash
bash k8s/scripts/clean.sh
```

**Options**:

| Flag | Description | Danger Level |
|------|-------------|--------------|
| `--purge-data` | Delete local hostPath data (Docker Desktop) | ⚠️ High |
| `--purge-pvc` | Delete PersistentVolumeClaims | ⚠️ **Critical** |
| `--purge-images` | Remove Docker images from local registry | Medium |
| `--purge-all` | Combine all purge options | ⚠️ **Critical** |

**Examples**:
```bash
# Clean deployments only (safe)
bash k8s/scripts/clean.sh

# Full reset including data (DANGEROUS)
bash k8s/scripts/clean.sh --purge-all
```

---

## Configuration

---

## Configuration

### Environment Variables

All configuration is managed via the root `.env` file, which is transformed into Kubernetes secrets during deployment.

#### Service URLs

| Variable | Local | Cloud Production |
|----------|-------|------------------|
| `DEPLOY_MODE` | `local` | `cloud` |
| `DOMAIN` | `localhost` | `shopple.example.com` |
| `FRONTEND_URL` | `http://localhost` | `https://shopple.example.com` |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost/api` | `https://shopple.example.com/api` |
| `DASHBOARDS_URL` | `http://localhost/dashboards` | `https://shopple.example.com/dashboards` |
| `INTERNAL_BACKEND_URL` | `http://backend:5001` | `http://backend:5001` ⚠️ (cluster-internal) |
| `FRONTEND_ORIGIN` | `http://localhost` | `https://shopple.example.com` |

#### URL Architecture

**External URLs** (browser → Ingress):
- Used by client-side JavaScript
- Must match Ingress hostname
- Prefix with `NEXT_PUBLIC_` for client-side access

**Internal URLs** (pod → pod):
- Service discovery via cluster DNS
- Always HTTP (no TLS between pods by default)
- Format: `http://<service-name>:<port>`

```
Browser ──[EXTERNAL_URL]──▶ Ingress ──[INTERNAL_URL]──▶ Backend
                              │
                              └──▶ OpenSearch (http://opensearch:9200)
```

#### Firebase Configuration

Required for authentication and Firestore database:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
GOOGLE_APPLICATION_CREDENTIALS=/app/backend/data/serviceAccountKey.json
```

#### AI Provider Configuration

Cascade model failover for AI classification:

```bash
AI_MODEL_GROQ=llama-3.3-70b-versatile
AI_MODEL_OPENROUTER=meta-llama/llama-3.1-70b-instruct
AI_MODEL_GEMINI=gemini-2.0-flash-exp
AI_MODEL_CEREBRAS=llama3.3-70b

GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...
GEMINI_API_KEY=AIza...
CEREBRAS_API_KEY=csk-...
```

### Secrets Management

**Automatic secret creation** from `.env`:

```bash
# Secrets are created by start.sh automatically
kubectl get secrets shopple-secrets -o yaml
```

**Manual secret update**:

```bash
# Edit .env then run:
bash k8s/scripts/start.sh --skip-build

# Or manually:
kubectl create secret generic shopple-secrets \
  --from-env-file=.env \
  --dry-run=client -o yaml | kubectl apply -f -
```

**Secret rotation**:
1. Update `.env`
2. Run `kubectl create secret generic shopple-secrets --from-env-file=.env --dry-run=client -o yaml | kubectl apply -f -`
3. Restart pods: `kubectl rollout restart deployment/backend deployment/frontend`

---

## Operations

### Common Operations

#### View Pod Status

```bash
# All pods
kubectl get pods

# Watch in real-time
kubectl get pods -w

# Detailed pod info
kubectl describe pod <pod-name>
```

#### View Logs

```bash
# Tail logs (follow)
kubectl logs -f deployment/backend -c backend
kubectl logs -f deployment/frontend -c frontend
kubectl logs -f deployment/crawler

# Last 100 lines
kubectl logs --tail=100 deployment/backend -c backend

# Specific time range
kubectl logs --since=1h deployment/backend -c backend

# All pods with label
kubectl logs -l app=backend --all-containers=true
```

#### Restart Deployments

```bash
# Rolling restart (zero downtime)
kubectl rollout restart deployment/backend
kubectl rollout restart deployment/frontend

# Check rollout status
kubectl rollout status deployment/backend

# Rollback to previous version
kubectl rollout undo deployment/backend

# Rollback to specific revision
kubectl rollout history deployment/backend
kubectl rollout undo deployment/backend --to-revision=3
```

#### Scale Replicas

```bash
# Scale up
kubectl scale deployment backend --replicas=3

# Scale down
kubectl scale deployment backend --replicas=1

# Auto-scale (requires metrics-server)
kubectl autoscale deployment backend --cpu-percent=50 --min=1 --max=5
```

#### Execute Commands in Pods

```bash
# Interactive shell
kubectl exec -it deployment/backend -c backend -- /bin/bash

# Run single command
kubectl exec deployment/backend -c backend -- python --version

# Check database connectivity
kubectl exec deployment/backend -c backend -- curl http://opensearch:9200/_cluster/health
```

#### Port Forwarding (Debugging)

```bash
# Access backend directly (bypass Ingress)
kubectl port-forward svc/backend 5001:5001
# Then: http://localhost:5001

# Access OpenSearch
kubectl port-forward svc/opensearch 9200:9200

# Access Dashboards
kubectl port-forward svc/opensearch-dashboards 5601:5601
```

### Resource Management

#### Check Resource Usage

```bash
# Node resources
kubectl top nodes

# Pod resources
kubectl top pods

# Per-container metrics
kubectl top pods --containers=true
```

#### View Resource Requests/Limits

```bash
kubectl describe deployment backend | grep -A 5 "Limits:\|Requests:"
```

#### Update Resource Limits

Edit the YAML file and reapply:

```yaml
# Example: 03-backend.yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

```bash
kubectl apply -f k8s/03-backend.yaml
```

---

## Monitoring

### Built-in Observability

#### OpenSearch Dashboards

Access: `http://localhost/dashboards` (local) or `https://your-domain/dashboards` (cloud)

**Pre-configured dashboards**:
- Application logs from Backend, Frontend, Worker
- Request/response logs
- Error tracking and alerting
- Performance metrics

#### Health Checks

```bash
# Application health
curl http://localhost/api/health
curl http://localhost/health

# OpenSearch health
kubectl exec deployment/backend -c backend -- \
  curl -s http://opensearch:9200/_cluster/health?pretty

# Ingress Controller health
kubectl get pods -n ingress-nginx
```

### Metrics and Alerting

**Recommended additions**:

1. **Metrics Server** (resource metrics):
   ```bash
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   ```

2. **Prometheus + Grafana** (monitoring stack):
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm install prometheus prometheus-community/kube-prometheus-stack
   ```

3. **Application Performance Monitoring (APM)**:
   - Datadog
   - New Relic
   - Elastic APM

### Log Aggregation

Current architecture: **Fluent Bit** sidecars → **OpenSearch** → **Dashboards**

**Log retention**: Configurable in OpenSearch index lifecycle policies

**Log levels**:
- `DEBUG`: Development
- `INFO`: Production (default)
- `WARNING`: Issues that don't stop execution
- `ERROR`: Failures requiring attention

---

## Security

### Current Security Posture

#### ✅ Implemented

- **Secrets Management**: Kubernetes secrets for sensitive data
- **Service Isolation**: Network policies (cluster-default)
- **RBAC**: ServiceAccount with minimal permissions
- **Non-root Containers**: Backend, Frontend, Crawler run as non-root
- **Read-only Root Filesystem**: Where applicable
- **Resource Limits**: Prevents resource exhaustion attacks

#### ⚠️ Recommendations for Production

1. **TLS/HTTPS**:
   ```bash
   # Install cert-manager
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
   
   # Add to Ingress:
   # tls:
   # - hosts:
   #   - your-domain.com
   #   secretName: shopple-tls
   ```

2. **Network Policies** (zero-trust networking):
   ```yaml
   # Only allow backend → opensearch traffic
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata:
     name: backend-to-opensearch
   spec:
     podSelector:
       matchLabels:
         app: backend
     egress:
     - to:
       - podSelector:
           matchLabels:
             app: opensearch
       ports:
       - port: 9200
   ```

3. **Pod Security Standards**:
   ```bash
   kubectl label namespace default pod-security.kubernetes.io/enforce=restricted
   ```

4. **Image Scanning**:
   - Integrate with Trivy, Clair, or Snyk
   - Scan images in CI/CD before deployment

5. **Secrets Encryption at Rest**:
   ```bash
   # Enable encryption in kube-apiserver
   # For managed K8s (GKE/EKS/AKS), this is enabled by default
   ```

### Security Checklist

- [ ] TLS certificates issued and auto-renewed
- [ ] Network policies restrict pod-to-pod traffic
- [ ] Secrets rotated regularly (quarterly minimum)
- [ ] Container images scanned for vulnerabilities
- [ ] Non-root containers with read-only filesystems
- [ ] Resource quotas and limits enforced
- [ ] Audit logging enabled
- [ ] Ingress Controller WAF rules configured
- [ ] Database backups automated and tested
- [ ] Disaster recovery plan documented

---

## Troubleshooting

### Common Issues

#### Pods Stuck in "Pending" Status

**Symptoms**:
```bash
kubectl get pods
# backend-xxx   0/2   Pending   0   5m
```

**Diagnosis**:
```bash
kubectl describe pod <pod-name>
# Look for: "FailedScheduling" events
```

**Common causes**:
- **Insufficient resources**: Node doesn't have CPU/memory
  - Solution: Scale down or add nodes
- **PVC not bound**: Storage not available
  - Solution: `kubectl get pvc` → check provisioner
- **Image pull errors**: Can't download image
  - Solution: Check `imagePullPolicy` and image name

#### Pods Crash Looping

**Symptoms**:
```bash
kubectl get pods
# backend-xxx   0/2   CrashLoopBackOff   5   10m
```

**Diagnosis**:
```bash
kubectl logs <pod-name> -c <container-name> --previous
kubectl describe pod <pod-name>
```

**Common causes**:
- **Missing environment variables**: Check `.env` completeness
- **Database connection failure**: Check OpenSearch is running
- **Port conflicts**: Another service using the port
- **Startup timeout**: Slow initialization (increase readiness probe)

#### Ingress Not Routing

**Symptoms**:
- `curl http://localhost` → connection refused or 404

**Diagnosis**:
```bash
# Check Ingress Controller
kubectl get pods -n ingress-nginx
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller

# Check Ingress resource
kubectl get ingress shopple-ingress
kubectl describe ingress shopple-ingress
```

**Solutions**:
```bash
# Reinstall Ingress Controller
kubectl delete namespace ingress-nginx
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Wait for ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

#### Can't Access localhost

**Docker Desktop**: Ingress binds to `localhost:80`

**Check**:
```bash
# Is port 80 free?
sudo lsof -i :80

# Is Ingress Controller running?
kubectl get pods -n ingress-nginx
```

**Solutions**:
- Kill process on port 80: `sudo kill <PID>`
- Or change Ingress port (advanced)

#### Data Not Persisting

**Symptoms**: Data lost after pod restart

**Diagnosis**:
```bash
kubectl get pvc
# STATUS should be "Bound"

kubectl describe pvc <pvc-name>
# Check: "Bound to" shows a volume
```

**Solutions**:
```bash
# Recreate PVCs
kubectl delete pvc <pvc-name>
bash k8s/scripts/start.sh
```

#### OpenSearch Yellow Health

**Symptoms**:
```bash
curl http://localhost/api/health
# "opensearch_status": "yellow"
```

**Explanation**: Yellow = working but no replicas. **This is normal** for single-node OpenSearch.

**Production fix**:
```yaml
# 01-opensearch.yaml
spec:
  replicas: 3  # Enable replication
```

### Debug Commands Cheatsheet

```bash
# View all resources
kubectl get all

# Describe any resource type
kubectl describe <resource-type> <name>

# Get resource YAML
kubectl get <resource-type> <name> -o yaml

# Edit resource live
kubectl edit <resource-type> <name>

# Delete and recreate
kubectl delete <resource-type> <name>
kubectl apply -f k8s/<manifest>.yaml

# Force delete stuck pod
kubectl delete pod <pod-name> --grace-period=0 --force

# Check events (cluster-wide)
kubectl get events --sort-by='.lastTimestamp'

# Check for failing containers
kubectl get pods --field-selector=status.phase!=Running
```

---

## Cloud Deployment Guide

### Prerequisites

1. **Kubernetes cluster** (recommended: managed service)
   - GKE (Google): `gcloud container clusters create shopple --num-nodes=3`
   - EKS (AWS): `eksctl create cluster --name shopple --nodes=3`
   - AKS (Azure): `az aks create --resource-group rg --name shopple --node-count 3`

2. **Container Registry**
   - Google Container Registry (GCR)
   - Amazon Elastic Container Registry (ECR)
   - Azure Container Registry (ACR)
   - Docker Hub

3. **Domain + DNS access**

### Deployment Steps

#### 1. Configure Container Registry

**Tag and push images**:
```bash
# Example: GCR
export PROJECT_ID=your-gcp-project
export REGISTRY=gcr.io/${PROJECT_ID}

# Tag images
docker tag shopple-backend:latest ${REGISTRY}/shopple-backend:latest
docker tag shopple-frontend:latest ${REGISTRY}/shopple-frontend:latest
docker tag shopple-crawler:latest ${REGISTRY}/shopple-crawler:latest
docker tag shopple-worker:latest ${REGISTRY}/shopple-worker:latest

# Push
docker push ${REGISTRY}/shopple-backend:latest
docker push ${REGISTRY}/shopple-frontend:latest
docker push ${REGISTRY}/shopple-crawler:latest
docker push ${REGISTRY}/shopple-worker:latest
```

**Update manifests** to use registry:
```yaml
# k8s/03-backend.yaml (example)
spec:
  containers:
  - name: backend
    image: gcr.io/your-project/shopple-backend:latest
    imagePullPolicy: Always  # Or use digest for immutability
```

#### 2. Update Environment Configuration

Edit `.env`:
```bash
DEPLOY_MODE=cloud
DOMAIN=shopple.example.com
FRONTEND_URL=https://shopple.example.com
NEXT_PUBLIC_BACKEND_URL=https://shopple.example.com/api
DASHBOARDS_URL=https://shopple.example.com/dashboards
FRONTEND_ORIGIN=https://shopple.example.com
```

#### 3. Install Ingress Controller

**NGINX Ingress** (cloud provider LoadBalancer):
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Wait for LoadBalancer IP assignment
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s

# Get LoadBalancer IP
kubectl get svc -n ingress-nginx ingress-nginx-controller
```

#### 4. Deploy Application

```bash
DEPLOY_MODE=cloud bash k8s/scripts/start.sh
```

#### 5. Configure DNS

Get the Ingress LoadBalancer IP:
```bash
kubectl get ingress shopple-ingress
# Note the ADDRESS column
```

Create DNS A record:
```
shopple.example.com  →  <LoadBalancer-IP>
```

**Verify DNS propagation**:
```bash
dig shopple.example.com +short
nslookup shopple.example.com
```

#### 6. Enable HTTPS (Recommended)

**Install cert-manager**:
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

**Create ClusterIssuer**:
```yaml
# cert-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
```

```bash
kubectl apply -f cert-issuer.yaml
```

**Update Ingress** (`k8s/08-ingress.yaml`):
```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - shopple.example.com
    secretName: shopple-tls
  rules:
  - host: shopple.example.com  # Add host field
    http:
      paths: ...
```

Apply:
```bash
kubectl apply -f k8s/08-ingress.yaml
```

**Verify certificate**:
```bash
kubectl get certificate
kubectl describe certificate shopple-tls
```

### Production Hardening

#### Storage Class (Managed Disks)

```yaml
# storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/gce-pd  # GKE
# provisioner: kubernetes.io/aws-ebs  # EKS
# provisioner: disk.csi.azure.com  # AKS
parameters:
  type: pd-ssd  # GKE SSD
  # type: gp3  # EKS
  # storageaccounttype: Premium_LRS  # AKS
reclaimPolicy: Retain
volumeBindingMode: WaitForFirstConsumer
```

Update PVCs to use this class:
```yaml
kind: PersistentVolumeClaim
metadata:
  name: opensearch-data
spec:
  storageClassName: fast-ssd
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi  # Larger for production
```

#### High Availability

**Scale critical components**:
```bash
kubectl scale deployment backend --replicas=3
kubectl scale deployment frontend --replicas=2
kubectl scale statefulset opensearch --replicas=3
```

**Pod Anti-Affinity** (spread across nodes):
```yaml
# 03-backend.yaml
spec:
  template:
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: backend
              topologyKey: kubernetes.io/hostname
```

#### Resource Requests/Limits

```yaml
# Example for production
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

#### Liveness and Readiness Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 5001
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health
    port: 5001
  initialDelaySeconds: 15
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 2
```

### Cost Optimization

1. **Right-size nodes**: Start small, scale as needed
2. **Use preemptible/spot instances**: For non-critical workloads (crawler)
3. **Enable cluster autoscaling**: Scales nodes based on demand
4. **Set resource limits**: Prevents runaway costs
5. **Use storage lifecycle policies**: Archive old logs
6. **Monitor with cost tools**: GCP Cost Management, AWS Cost Explorer

---

## Additional Resources

- **Kubernetes Documentation**: https://kubernetes.io/docs/
- **NGINX Ingress Controller**: https://kubernetes.github.io/ingress-nginx/
- **OpenSearch**: https://opensearch.org/docs/
- **Fluent Bit**: https://docs.fluentbit.io/
- **kubectl Cheatsheet**: https://kubernetes.io/docs/reference/kubectl/cheatsheet/

## Support

For issues or questions:
- Check logs: `kubectl logs -f deployment/<service> -c <container>`
- Review events: `kubectl get events --sort-by='.lastTimestamp'`
- Describe resources: `kubectl describe pod/<pod-name>`

---

**Last Updated**: February 2026  
**Kubernetes Version**: 1.34.1  
**Tested On**: Docker Desktop (macOS), GKE, EKS

# Shopple Admin - Kubernetes Deployment

Deploy the Shopple Admin stack to any Kubernetes cluster (local or cloud).

## Quick Start

### Local Development (Docker Desktop / Minikube)

```bash
# 1. Start the cluster
bash k8s/scripts/start.sh

# 2. Access your app
#    Frontend:   http://localhost
#    API:        http://localhost/api
#    Dashboards: http://localhost/dashboards
```

### Cloud Deployment (GKE / EKS / AKS)

```bash
# 1. Edit .env - change these values:
DEPLOY_MODE=cloud
DOMAIN=app.example.com
FRONTEND_URL=https://app.example.com
NEXT_PUBLIC_BACKEND_URL=https://app.example.com/api
DASHBOARDS_URL=https://app.example.com/dashboards
FRONTEND_ORIGIN=https://app.example.com

# 2. Deploy
bash k8s/scripts/start.sh

# 3. Point your DNS to the Ingress LoadBalancer IP
kubectl get ingress shopple-ingress
```

---

## Architecture

```
                        INTERNET
                            │
                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      INGRESS CONTROLLER                                   │
│                   (single LoadBalancer)                                   │
│                                                                           │
│    /              → Frontend    (React/Next.js)                          │
│    /api/*         → Backend     (Flask API)                              │
│    /dashboards/*  → Dashboards  (OpenSearch Logs)                        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
                │               │               │
                ▼               ▼               ▼
          ┌──────────┐   ┌──────────┐   ┌──────────────┐
          │ Frontend │   │ Backend  │   │  Dashboards  │
          │ ClusterIP│   │ ClusterIP│   │  ClusterIP   │
          └──────────┘   └──────────┘   └──────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  OpenSearch  │
                        │  (Database)  │
                        └──────────────┘
```

**Why Ingress?**
- **Cost**: One LoadBalancer instead of many (cloud LBs cost money)
- **Simplicity**: Single entry point, path-based routing
- **Security**: Centralized TLS termination
- **Flexibility**: Works the same locally and in cloud

---

## File Structure

```
k8s/
├── 00-storage.yaml      # PersistentVolumeClaims (data storage)
├── 01-opensearch.yaml   # OpenSearch database
├── 02-dashboards.yaml   # OpenSearch Dashboards (log viewer)
├── 03-backend.yaml      # Flask API backend
├── 04-frontend.yaml     # React/Next.js frontend
├── 05-crawler.yaml      # Web crawler service
├── 06-worker.yaml       # Background worker
├── 07-fluentbit-config.yaml  # Log shipping config
├── 08-ingress.yaml      # Ingress routing rules
└── scripts/
    ├── start.sh         # Deploy everything
    ├── stop.sh          # Stop (preserve data)
    ├── clean.sh         # Full cleanup
    └── setup_opensearch_dashboards.sh  # Import dashboards
```

---

## Configuration (.env)

All configuration is in the root `.env` file:

### Service URLs

| Variable | Local | Cloud Example |
|----------|-------|---------------|
| `DEPLOY_MODE` | `local` | `cloud` |
| `DOMAIN` | `localhost` | `app.example.com` |
| `FRONTEND_URL` | `http://localhost` | `https://app.example.com` |
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost/api` | `https://app.example.com/api` |
| `DASHBOARDS_URL` | `http://localhost/dashboards` | `https://app.example.com/dashboards` |
| `INTERNAL_BACKEND_URL` | `http://backend:5001` | `http://backend:5001` (never changes) |
| `FRONTEND_ORIGIN` | `http://localhost` | `https://app.example.com` |

### Internal vs External URLs

- **External URLs** (`NEXT_PUBLIC_*`): Used by the browser to reach your services
- **Internal URLs** (`INTERNAL_*`): Used by pods to talk to each other inside the cluster

```
Browser ──EXTERNAL──▶ Ingress ──INTERNAL──▶ Backend
                                    │
                                    └──▶ OpenSearch
```

---

## Commands

### Start / Stop / Clean

```bash
# Start (builds images, deploys everything)
bash k8s/scripts/start.sh

# Stop (removes deployments, keeps data)
bash k8s/scripts/stop.sh

# Clean (removes everything including secrets)
bash k8s/scripts/clean.sh

# Full purge (removes data volumes and docker images too)
bash k8s/scripts/clean.sh --purge-data --purge-images
```

### Useful kubectl Commands

```bash
# View all pods
kubectl get pods

# View logs
kubectl logs -f deployment/backend -c backend
kubectl logs -f deployment/frontend -c frontend

# Check Ingress status
kubectl get ingress shopple-ingress

# Get Ingress external IP (cloud)
kubectl get ingress shopple-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Port-forward for debugging (bypasses Ingress)
kubectl port-forward svc/backend 5001:5001
kubectl port-forward svc/opensearch-dashboards 5601:5601
```

---

## Cloud Deployment Guide

### 1. Prerequisites

- Kubernetes cluster (GKE, EKS, AKS, etc.)
- `kubectl` configured to connect to your cluster
- Container registry (Docker Hub, GCR, ECR, etc.)
- Domain name with DNS access

### 2. Push Images to Registry

```bash
# Tag images for your registry
docker tag shopple-backend:latest gcr.io/your-project/shopple-backend:latest
docker tag shopple-frontend:latest gcr.io/your-project/shopple-frontend:latest
# ... etc

# Push
docker push gcr.io/your-project/shopple-backend:latest
# ... etc
```

Then update the `image:` fields in the YAML files to use your registry.

### 3. Install Ingress Controller

```bash
# NGINX Ingress (recommended)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml

# Wait for it
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

### 4. Deploy

```bash
# Update .env with cloud values
DEPLOY_MODE=cloud bash k8s/scripts/start.sh
```

### 5. Configure DNS

Get the LoadBalancer IP:

```bash
kubectl get ingress shopple-ingress
```

Point your domain's DNS A record to this IP.

### 6. (Optional) Add TLS/HTTPS

Install cert-manager and uncomment the TLS section in `08-ingress.yaml`.

---

## Troubleshooting

### Pods not starting?

```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name> -c <container-name>
```

### Ingress not working?

```bash
# Check Ingress Controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller

# Check Ingress resource
kubectl describe ingress shopple-ingress
```

### Can't access localhost?

On Docker Desktop, the Ingress Controller binds to `localhost:80`. Make sure:
1. Port 80 is free
2. Ingress Controller pod is running: `kubectl get pods -n ingress-nginx`

### Data not persisting?

Check PVCs are bound:

```bash
kubectl get pvc
```

---

## Security Notes

- **Internal traffic is NOT encrypted** by default (HTTP between pods)
- For production, consider:
  - Service Mesh (Istio/Linkerd) for mTLS
  - Network Policies to restrict pod-to-pod traffic
  - TLS termination at Ingress level

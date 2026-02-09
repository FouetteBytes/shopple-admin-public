#!/bin/bash
set -e

# -----------------------------------------------------------------------------
# Shopple Admin - Kubernetes Startup Script
#
# Purpose:
#   Complete cluster deployment: builds Docker images, cleans old deployments,
#   creates/updates secrets, deploys manifests, and sets up Ingress Controller.
#
# Usage:
#   bash k8s/scripts/start.sh                    # Full fresh deployment (default: --no-cache)
#   bash k8s/scripts/start.sh --skip-build       # Deploy without rebuilding images
#   bash k8s/scripts/start.sh --quick            # Quick restart (no build, no clean)
#   bash k8s/scripts/start.sh --with-cache       # Build with Docker cache (faster)
#   DEPLOY_MODE=cloud bash k8s/scripts/start.sh  # Cloud deployment
#
# Options:
#   --skip-build    Skip Docker image builds (use existing images)
#   --quick         Quick restart: skip build and keep existing pods
#   --no-cache      Force rebuild all images without cache (default)
#   --with-cache    Allow Docker cache for faster builds
#
# Environment:
#   DEPLOY_MODE     "local" (default) or "cloud"
# -----------------------------------------------------------------------------

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Parse arguments
SKIP_BUILD="false"
QUICK_MODE="false"
USE_CACHE="false"

for arg in "$@"; do
  case "$arg" in
    --skip-build)
      SKIP_BUILD="true"
      ;;
    --quick)
      QUICK_MODE="true"
      SKIP_BUILD="true"
      ;;
    --no-cache)
      USE_CACHE="false"
      ;;
    --with-cache)
      USE_CACHE="true"
      ;;
  esac
done

# Load environment variables from .env
if [ -f .env ]; then
  echo "📄 Loading environment from .env..."
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    if [[ $key =~ ^# ]] || [[ -z $key ]]; then
      continue
    fi
    # Only export valid shell identifiers
    if [[ $key =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
        export "$key"="$value"
    fi
  done < .env
else
  echo "⚠️  No .env file found. Using environment variables."
fi

DEPLOY_MODE="${DEPLOY_MODE:-local}"
BUILD_ARGS=""
if [ "$USE_CACHE" = "false" ]; then
  BUILD_ARGS="--no-cache"
fi

echo ""
echo "=============================================="
echo "🚀 Shopple Admin Kubernetes Deployment"
echo "=============================================="
echo "   Mode:         $DEPLOY_MODE"
echo "   Skip Build:   $SKIP_BUILD"
echo "   Quick Mode:   $QUICK_MODE"
echo "   Docker Cache: $USE_CACHE"
echo "   Project Root: $PROJECT_ROOT"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# STEP 0: Clean up old deployments (unless quick mode)
# ---------------------------------------------------------------------------
if [ "$QUICK_MODE" = "false" ]; then
  echo "🧹 Cleaning up existing app deployments..."
  kubectl delete deployment backend frontend crawler worker --ignore-not-found 2>/dev/null || true
  echo "   Waiting for pods to terminate..."
  sleep 2
  kubectl wait --for=delete pod -l 'app in (backend,frontend,crawler,worker)' --timeout=60s 2>/dev/null || true
  echo "   ✅ Old deployments cleaned"
fi

# ---------------------------------------------------------------------------
# STEP 1: Build Docker Images
# ---------------------------------------------------------------------------
if [ "$SKIP_BUILD" = "false" ]; then
  echo ""
  echo "🔨 Building Docker images${BUILD_ARGS:+ ($BUILD_ARGS)}..."
  echo ""

  echo "   📦 Building backend..."
  docker build $BUILD_ARGS -t shopple-backend:latest -f Dockerfile.backend .

  echo "   📦 Building crawler..."
  docker build $BUILD_ARGS -t shopple-crawler:latest -f Dockerfile.crawler .

  echo "   📦 Building worker..."
  docker build $BUILD_ARGS -t shopple-worker:latest -f Dockerfile.worker .

  echo "   📦 Building frontend (baking Firebase config)..."
  docker build $BUILD_ARGS -t shopple-frontend:latest \
    --build-arg NEXT_PUBLIC_BACKEND_URL="${NEXT_PUBLIC_BACKEND_URL:-}" \
    --build-arg NEXT_PUBLIC_FIREBASE_API_KEY="$NEXT_PUBLIC_FIREBASE_API_KEY" \
    --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" \
    --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID="$NEXT_PUBLIC_FIREBASE_PROJECT_ID" \
    --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" \
    --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" \
    --build-arg NEXT_PUBLIC_FIREBASE_APP_ID="$NEXT_PUBLIC_FIREBASE_APP_ID" \
    -f Dockerfile.frontend ./frontend

  echo ""
  echo "   ✅ All images built successfully"
else
  echo ""
  echo "⏭️  Skipping Docker builds (--skip-build)"
fi

# ---------------------------------------------------------------------------
# STEP 2: Create Kubernetes Secrets
# ---------------------------------------------------------------------------
echo ""
echo "🔐 Creating Kubernetes secrets from .env..."

# Clean up .env for Kubernetes Secret (remove duplicates, handle quotes)
awk -F= '!/^#/ && !/^$/ {
    idx = index($0, "=")
    if (idx > 0) {
        key = substr($0, 1, idx-1)
        val = substr($0, idx+1)
        gsub(/^[ \t]+|[ \t]+$/, "", key)
        gsub(/^[ \t]+|[ \t]+$/, "", val)
        if (val ~ /^".*"$/) {
            val = substr(val, 2, length(val)-2)
        } else if (val ~ /^'\''.*'\''$/) {
            val = substr(val, 2, length(val)-2)
        }
        if (key != "") {
             map[key] = val
        }
    }
} 
END { for (k in map) print k"="map[k] }' .env > k8s/.env.k8s

kubectl delete secret shopple-secrets --ignore-not-found
kubectl create secret generic shopple-secrets --from-env-file=k8s/.env.k8s

# Clean up temp secret file
rm k8s/.env.k8s
echo "   ✅ Secrets created"

echo "📦 Deploying to Kubernetes..."

# Get current project root
echo "📂 Project Root: $PROJECT_ROOT"

# ---------------------------------------------------------------------------
# STEP 1: Install NGINX Ingress Controller (local mode only)
# ---------------------------------------------------------------------------
if [ "$DEPLOY_MODE" = "local" ]; then
  echo "🔧 Checking NGINX Ingress Controller..."
  if ! kubectl get namespace ingress-nginx &>/dev/null; then
    echo "📥 Installing NGINX Ingress Controller..."
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
    
    echo "⏳ Waiting for Ingress Controller to be ready (this may take 1-2 minutes)..."
    kubectl wait --namespace ingress-nginx \
      --for=condition=ready pod \
      --selector=app.kubernetes.io/component=controller \
      --timeout=180s || echo "⚠️  Ingress Controller not ready yet, continuing..."
  else
    echo "✅ NGINX Ingress Controller already installed"
  fi
fi

# ---------------------------------------------------------------------------
# STEP 2: Apply Kubernetes Manifests (in dependency order)
# ---------------------------------------------------------------------------
# RBAC & ConfigMaps first (ServiceAccount must exist before backend deploys)
PRE_APPLY_FILES=("09-rbac.yaml" "07-fluentbit-config.yaml" "00-storage.yaml")
for fname in "${PRE_APPLY_FILES[@]}"; do
  file="$PROJECT_ROOT/k8s/$fname"
  if [ -f "$file" ]; then
    echo "Applying $fname (pre-requisite)..."
    sed "s|\${PROJECT_ROOT}|$PROJECT_ROOT|g" "$file" | kubectl apply -f -
  fi
done

# Then all other manifests EXCEPT ingress (applied separately with retries)
for file in "$PROJECT_ROOT"/k8s/*.yaml; do
  fname=$(basename "$file")
  # Skip files already applied above and ingress (handled below)
  case "$fname" in
    09-rbac.yaml|07-fluentbit-config.yaml|00-storage.yaml|08-ingress.yaml) continue ;;
  esac
  echo "Applying $fname..."
  sed "s|\${PROJECT_ROOT}|$PROJECT_ROOT|g" "$file" | kubectl apply -f -
done

# Apply Ingress with retry (admission webhook may take extra time)
INGRESS_FILE="$PROJECT_ROOT/k8s/08-ingress.yaml"
if [ -f "$INGRESS_FILE" ]; then
  echo ""
  echo "🌐 Applying Ingress (with webhook retry)..."
  INGRESS_APPLIED="false"
  for attempt in $(seq 1 12); do
    if sed "s|\${PROJECT_ROOT}|$PROJECT_ROOT|g" "$INGRESS_FILE" | kubectl apply -f - 2>/dev/null; then
      INGRESS_APPLIED="true"
      break
    fi
    echo "   ⏳ Webhook not ready, retrying... ($attempt/12)"
    sleep 5
  done
  if [ "$INGRESS_APPLIED" = "true" ]; then
    echo "   ✅ Ingress applied successfully"
  else
    echo "   ⚠️  Could not apply Ingress. Apply manually later:"
    echo "   kubectl apply -f $INGRESS_FILE"
  fi
fi

echo ""
echo "=============================================="
echo "✅ Deployment Complete!"
echo "=============================================="

# ---------------------------------------------------------------------------
# STEP 3: Initialize Backend Data Volume
# ---------------------------------------------------------------------------
echo ""
echo "🔧 Initializing backend data volume..."

# Wait for backend pod to be ready
kubectl wait --for=condition=ready pod -l app=backend --timeout=120s 2>/dev/null || true

BACKEND_POD=$(kubectl get pods -l app=backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$BACKEND_POD" ]; then
  # Check if allowed_models.json exists in the PVC
  if ! kubectl exec "$BACKEND_POD" -c backend -- test -f /app/backend/data/allowed_models.json 2>/dev/null; then
    echo "   📄 Copying allowed_models.json to persistent volume..."
    if [ -f "$PROJECT_ROOT/backend/data/allowed_models.json" ]; then
      kubectl cp "$PROJECT_ROOT/backend/data/allowed_models.json" "$BACKEND_POD":/app/backend/data/allowed_models.json -c backend 2>/dev/null || echo "   ⚠️  Could not copy allowed_models.json"
      echo "   ✅ Copied allowed_models.json"
    else
      echo "   ⚠️  Local allowed_models.json not found, backend will use defaults"
    fi
  else
    echo "   ✅ allowed_models.json already exists in persistent volume"
  fi
else
  echo "   ⚠️  Backend pod not ready, skipping data initialization"
fi

if [ "$DEPLOY_MODE" = "local" ]; then
  echo ""
  echo "📍 ACCESS YOUR APP (Local Development):"
  echo "   Frontend:   http://localhost"
  echo "   API:        http://localhost/api"
  echo "   Dashboards: http://localhost/dashboards"
  echo ""
  echo "   (All traffic goes through Ingress on port 80)"
else
  DOMAIN="${DOMAIN:-your-domain.com}"
  echo ""
  echo "📍 ACCESS YOUR APP (Cloud):"
  echo "   Frontend:   https://$DOMAIN"
  echo "   API:        https://$DOMAIN/api"
  echo "   Dashboards: https://$DOMAIN/dashboards"
  echo ""
  echo "   Don't forget to:"
  echo "   1. Point your DNS to the Ingress LoadBalancer IP"
  echo "   2. Set up TLS certificates (cert-manager recommended)"
fi

echo ""
echo "📊 LOGS:"
echo "   kubectl logs -f deployment/backend -c backend"
echo "   kubectl logs -f deployment/frontend -c frontend"
echo ""
echo "=============================================="
echo ""
echo "⏳ Waiting for pods to start..."
sleep 5
kubectl get pods

DASHBOARDS_URL="${DASHBOARDS_URL:-http://localhost/dashboards}"

echo ""
echo "🔍 Checking OpenSearch Dashboards..."
echo "   URL: $DASHBOARDS_URL"

dashboards_ready="false"
for i in {1..30}; do
  if curl -s "${DASHBOARDS_URL}/api/status" > /dev/null 2>&1; then
    dashboards_ready="true"
    break
  fi
  echo "   Waiting for Dashboards... ($i/30)"
  sleep 2
done

if [ "$dashboards_ready" = "true" ]; then
  echo "✅ Dashboards is ready!"
  echo "   Checking saved objects..."
  existing_objects=$(curl -s -H "osd-xsrf: true" \
    "${DASHBOARDS_URL}/api/saved_objects/_find?type=index-pattern&search_fields=title&search=shopple-logs" || true)

  if echo "$existing_objects" | grep -q '"id":"shopple-logs"'; then
    echo "✅ Dashboards objects already exist. Skipping import."
  else
    echo "📊 Importing Dashboards objects..."
    DASHBOARDS_URL="$DASHBOARDS_URL" bash "$PROJECT_ROOT/k8s/scripts/setup_opensearch_dashboards.sh"
  fi
else
  echo "⚠️  Dashboards not ready yet. You can import later with:"
  echo "   DASHBOARDS_URL=$DASHBOARDS_URL bash k8s/scripts/setup_opensearch_dashboards.sh"
fi

echo ""
echo "🎉 All done! Your cluster is ready."
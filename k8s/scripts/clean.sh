#!/bin/bash
set -e

# -----------------------------------------------------------------------------
# Shopple Admin - Kubernetes Cleanup Script
#
# Purpose:
#   Removes Kubernetes resources and (optionally) deletes persistent data,
#   PVCs, and Docker images. Use with care in development environments.
#
# Usage:
#   bash k8s/scripts/clean.sh                    # Clean deployments only
#   bash k8s/scripts/clean.sh --purge-data       # Also delete local hostPath data
#   bash k8s/scripts/clean.sh --purge-pvc        # Also delete PersistentVolumeClaims
#   bash k8s/scripts/clean.sh --purge-images     # Also remove Docker images
#   bash k8s/scripts/clean.sh --purge-all        # Complete cleanup (data + PVC + images)
#
# Options:
#   --purge-data    Deletes local hostPath data directories (opensearch-data)
#   --purge-pvc     Deletes PersistentVolumeClaims (loses all stored data!)
#   --purge-images  Removes local Docker images for Shopple services
#   --purge-all     Combines all purge options (complete reset)
# -----------------------------------------------------------------------------

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP_MANIFEST="$(mktemp)"

PURGE_DATA="false"
PURGE_PVC="false"
PURGE_IMAGES="false"

for arg in "$@"; do
  case "$arg" in
    --purge-data)
      PURGE_DATA="true"
      ;;
    --purge-pvc)
      PURGE_PVC="true"
      ;;
    --purge-images)
      PURGE_IMAGES="true"
      ;;
    --purge-all)
      PURGE_DATA="true"
      PURGE_PVC="true"
      PURGE_IMAGES="true"
      ;;
  esac
done

echo ""
echo "=============================================="
echo " Shopple Admin Kubernetes Cleanup"
echo "=============================================="
echo "   Purge Data:   $PURGE_DATA"
echo "   Purge PVC:    $PURGE_PVC"
echo "   Purge Images: $PURGE_IMAGES"
echo "=============================================="
echo ""

# ---------------------------------------------------------------------------
# STEP 1: Delete Kubernetes Deployments & Services
# ---------------------------------------------------------------------------
echo " Deleting Kubernetes resources..."

for file in "$PROJECT_ROOT"/k8s/*.yaml; do
  echo "   Deleting $(basename "$file")..."
  sed "s|\${PROJECT_ROOT}|$PROJECT_ROOT|g" "$file" > "$TMP_MANIFEST"
  kubectl delete -f "$TMP_MANIFEST" --ignore-not-found 2>/dev/null || true
done

echo "   Deleting secrets..."
kubectl delete secret shopple-secrets --ignore-not-found

rm -f "$TMP_MANIFEST"
echo "   ✅ Kubernetes resources deleted"

# ---------------------------------------------------------------------------
# STEP 2: Delete PersistentVolumeClaims (if requested)
# ---------------------------------------------------------------------------
if [ "$PURGE_PVC" = "true" ]; then
  echo ""
  echo "⚠️  Deleting PersistentVolumeClaims..."
  echo "   This will DELETE ALL STORED DATA (OpenSearch, backend data, etc.)"
  
  # Delete all PVCs in default namespace that start with 'shopple' or belong to our apps
  kubectl delete pvc --all --ignore-not-found 2>/dev/null || true
  
  # Also delete any leftover PVs
  kubectl delete pv --all --ignore-not-found 2>/dev/null || true
  
  echo "   ✅ PVCs deleted"
else
  echo ""
  echo " PVCs preserved. Use --purge-pvc to delete them."
fi

# ---------------------------------------------------------------------------
# STEP 3: Delete local hostPath data (if requested)
# ---------------------------------------------------------------------------
if [ "$PURGE_DATA" = "true" ]; then
  echo ""
  echo "⚠️  Purging local persistent data..."
  
  # Remove OpenSearch data directory
  if [ -d "$PROJECT_ROOT/opensearch-data" ]; then
    rm -rf "$PROJECT_ROOT/opensearch-data"
    echo "   ✅ Deleted opensearch-data"
  fi
  
  # Remove any other local data directories that might exist
  if [ -d "$PROJECT_ROOT/backend-data" ]; then
    rm -rf "$PROJECT_ROOT/backend-data"
    echo "   ✅ Deleted backend-data"
  fi
  
  if [ -d "$PROJECT_ROOT/crawler-data" ]; then
    rm -rf "$PROJECT_ROOT/crawler-data"
    echo "   ✅ Deleted crawler-data"
  fi
  
  echo "   ✅ Local data purged"
else
  echo ""
  echo " Local data preserved. Use --purge-data to remove it."
fi

# ---------------------------------------------------------------------------
# STEP 4: Remove Docker images (if requested)
# ---------------------------------------------------------------------------
if [ "$PURGE_IMAGES" = "true" ]; then
  echo ""
  echo " Removing local Docker images..."
  docker rmi -f shopple-backend:latest 2>/dev/null || true
  docker rmi -f shopple-frontend:latest 2>/dev/null || true
  docker rmi -f shopple-crawler:latest 2>/dev/null || true
  docker rmi -f shopple-worker:latest 2>/dev/null || true
  echo "   ✅ Docker images removed"
else
  echo ""
  echo " Docker images preserved. Use --purge-images to remove them."
fi

echo ""
echo "=============================================="
echo "✅ Cleanup complete!"
echo "=============================================="
echo ""
echo "To start fresh, run:"
echo "   bash k8s/scripts/start.sh"
echo ""
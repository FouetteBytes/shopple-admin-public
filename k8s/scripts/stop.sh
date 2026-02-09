#!/bin/bash

# -----------------------------------------------------------------------------
# Shopple Admin - Kubernetes Stop Script
#
# Purpose:
#   Stops all Kubernetes resources for the Shopple Admin stack.
#   By default: preserves PVCs, Docker images, secrets, and Ingress Controller
#   so you can restart quickly with: bash k8s/scripts/start.sh --skip-build
#
# Usage:
#   bash k8s/scripts/stop.sh                    # Stop app pods (fast restart later)
#   bash k8s/scripts/stop.sh --remove-ingress   # Also remove NGINX Ingress Controller
#   bash k8s/scripts/stop.sh --remove-secrets   # Also remove K8s secrets
#   bash k8s/scripts/stop.sh --remove-pvc       # Also remove persistent volume claims
#   bash k8s/scripts/stop.sh --all              # Remove everything (full teardown)
#
# Options:
#   --remove-ingress  Remove the NGINX Ingress Controller (takes time to reinstall)
#   --remove-secrets  Remove Kubernetes secrets
#   --remove-pvc      Remove persistent volume claims (data loss!)
#   --all             Combine all removal options
#
# NOTE: Docker images are NEVER removed by stop.sh. Use clean.sh --purge-images.
# -----------------------------------------------------------------------------

REMOVE_INGRESS="false"
REMOVE_SECRETS="false"
REMOVE_PVC="false"

for arg in "$@"; do
  case "$arg" in
    --remove-ingress) REMOVE_INGRESS="true" ;;
    --remove-secrets) REMOVE_SECRETS="true" ;;
    --remove-pvc)     REMOVE_PVC="true" ;;
    --all)
      REMOVE_INGRESS="true"
      REMOVE_SECRETS="true"
      REMOVE_PVC="true"
      ;;
  esac
done

echo ""
echo "=============================================="
echo "🛑 Stopping Shopple Admin Kubernetes"
echo "=============================================="
echo "   Remove Ingress Controller: $REMOVE_INGRESS"
echo "   Remove Secrets:            $REMOVE_SECRETS"
echo "   Remove PVCs:               $REMOVE_PVC"
echo "   Docker Images:             preserved (use clean.sh --purge-images)"
echo "=============================================="
echo ""

# Delete all deployments
echo "📦 Deleting deployments..."
kubectl delete deployment backend frontend crawler worker opensearch-dashboards --ignore-not-found=true 2>/dev/null || true

# Delete statefulsets
echo "📦 Deleting statefulsets..."
kubectl delete statefulset opensearch --ignore-not-found=true 2>/dev/null || true

# Delete services (except kubernetes default service)
echo "🔌 Deleting services..."
kubectl delete service backend frontend crawler opensearch opensearch-dashboards --ignore-not-found=true 2>/dev/null || true

# Delete ingress resource (not the controller)
echo "🌐 Deleting ingress resource..."
kubectl delete ingress shopple-ingress --ignore-not-found=true 2>/dev/null || true

# Delete configmaps
echo "📄 Deleting configmaps..."
kubectl delete configmap fluent-bit-config --ignore-not-found=true 2>/dev/null || true

# Delete RBAC resources
echo "🔐 Deleting RBAC resources..."
kubectl delete rolebinding shopple-backend-pod-manager --ignore-not-found=true 2>/dev/null || true
kubectl delete role pod-manager --ignore-not-found=true 2>/dev/null || true
kubectl delete serviceaccount shopple-backend --ignore-not-found=true 2>/dev/null || true

# Wait for pods to terminate
echo ""
echo "⏳ Waiting for pods to terminate..."
kubectl wait --for=delete pod -l 'app in (backend,frontend,crawler,worker,opensearch,opensearch-dashboards)' --timeout=60s 2>/dev/null || true

# Optional: Remove secrets
if [ "$REMOVE_SECRETS" = "true" ]; then
  echo "🔑 Removing Kubernetes secrets..."
  kubectl delete secret shopple-secrets --ignore-not-found=true 2>/dev/null || true
  echo "   ✅ Secrets removed"
else
  echo "🔑 Secrets preserved (use --remove-secrets to remove)"
fi

# Optional: Remove PVCs
if [ "$REMOVE_PVC" = "true" ]; then
  echo "💾 Removing persistent volume claims (data will be lost!)..."
  kubectl delete pvc backend-data crawler-output crawler-cache crawler-jobs crawler-logs --ignore-not-found=true 2>/dev/null || true
  echo "   ✅ PVCs removed"
else
  echo "💾 PVCs preserved (use --remove-pvc to remove)"
fi

# Optional: Remove Ingress Controller
if [ "$REMOVE_INGRESS" = "true" ]; then
  echo "🌐 Removing NGINX Ingress Controller..."
  kubectl delete namespace ingress-nginx --ignore-not-found=true 2>/dev/null || true
  echo "   ✅ Ingress Controller removed"
else
  echo "🌐 Ingress Controller preserved (use --remove-ingress to remove)"
fi

echo ""
echo "=============================================="
echo "✅ Shopple Admin stopped!"
echo "=============================================="
echo ""
echo "To verify:  kubectl get all"
echo ""
echo "To restart quickly (no rebuild):"
echo "   bash k8s/scripts/start.sh --skip-build"
echo ""
echo "To restart with rebuild:"
echo "   bash k8s/scripts/start.sh --with-cache    # fast (uses Docker cache)"
echo "   bash k8s/scripts/start.sh                 # full rebuild (no cache)"
echo ""
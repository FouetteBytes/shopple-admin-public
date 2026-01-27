#!/bin/bash

# -----------------------------------------------------------------------------
# Shopple Admin - Kubernetes Stop Script
#
# Purpose:
#   Stops all Kubernetes resources for the Shopple Admin stack. Data volumes are
#   preserved (OpenSearch data remains intact).
#
# Usage:
#   bash k8s/scripts/stop.sh
# -----------------------------------------------------------------------------

echo " Stopping Shopple Admin Kubernetes resources..."

# Delete all deployments
echo "Deleting deployments..."
kubectl delete deployment backend frontend crawler worker opensearch-dashboards --ignore-not-found=true

# Delete statefulsets
echo "Deleting statefulsets..."
kubectl delete statefulset opensearch --ignore-not-found=true

# Delete services (except kubernetes default service)
echo "Deleting services..."
kubectl delete service backend frontend opensearch opensearch-dashboards --ignore-not-found=true

# Delete ingress if exists
echo "Deleting ingress..."
kubectl delete ingress shopple-ingress --ignore-not-found=true

# Delete configmaps
echo "Deleting configmaps..."
kubectl delete configmap fluentbit-config --ignore-not-found=true

echo ""
echo "✅ All resources deleted. Data volumes (PVCs) preserved."
echo ""
echo "To verify: kubectl get all"
echo "To restart: bash k8s/scripts/start.sh"
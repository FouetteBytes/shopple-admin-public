from typing import List, Dict, Any, Optional
import os
import time
from common.base.base_service import BaseService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Check if running in Kubernetes
def is_kubernetes():
    return os.path.exists('/var/run/secrets/kubernetes.io/serviceaccount/token')

class SystemService(BaseService):
    def __init__(self):
        self._k8s_client = None
        self._k8s_available = None
    
    def _get_k8s_client(self):
        """Get Kubernetes API client (lazy initialization)"""
        if self._k8s_available is False:
            return None
        if self._k8s_client is not None:
            return self._k8s_client
            
        try:
            from kubernetes import client, config
            if is_kubernetes():
                config.load_incluster_config()
            else:
                config.load_kube_config()
            self._k8s_client = client.CoreV1Api()
            self._k8s_available = True
            logger.info("Kubernetes client initialized successfully")
            return self._k8s_client
        except Exception as e:
            logger.warning(f"Kubernetes client not available: {e}")
            self._k8s_available = False
            return None
    
    def get_docker_client(self):
        try:
            import docker
            return docker.from_env()
        except Exception as e:
            logger.debug(f"Docker client not available: {e}")
            return None

    def get_services_status(self) -> List[Dict[str, Any]]:
        """Get service status - supports both Docker and Kubernetes"""
        
        # Try Kubernetes first (preferred in K8s environment)
        k8s_client = self._get_k8s_client()
        if k8s_client:
            return self._get_k8s_services_status(k8s_client)
        
        # Fall back to Docker
        docker_client = self.get_docker_client()
        if docker_client:
            return self._get_docker_services_status(docker_client)
        
        raise Exception('Neither Kubernetes nor Docker client available')
    
    def _get_k8s_services_status(self, k8s_client) -> List[Dict[str, Any]]:
        """Get service status from Kubernetes API"""
        from datetime import datetime, timezone
        
        # Map service names to K8s deployment/pod labels
        service_map = {
            'backend': {'app': 'backend'},
            'frontend': {'app': 'frontend'},
            'crawler': {'app': 'crawler'},
            'worker': {'app': 'worker'},
            'opensearch': {'app': 'opensearch'},
            'opensearch-dashboards': {'app': 'opensearch-dashboards'}
        }
        
        namespace = os.environ.get('K8S_NAMESPACE', 'default')
        services = []
        
        for service_key, labels in service_map.items():
            try:
                label_selector = ','.join([f"{k}={v}" for k, v in labels.items()])
                pods = k8s_client.list_namespaced_pod(namespace, label_selector=label_selector)
                
                if pods.items:
                    pod = pods.items[0]  # Get first pod
                    status = 'offline'
                    uptime = None
                    ready_containers = 0
                    total_containers = 0
                    
                    # Check pod phase and container statuses
                    phase = pod.status.phase
                    if phase == 'Running':
                        status = 'online'
                        # Calculate uptime
                        if pod.status.start_time:
                            start_time = pod.status.start_time
                            if start_time.tzinfo is None:
                                start_time = start_time.replace(tzinfo=timezone.utc)
                            now = datetime.now(timezone.utc)
                            uptime_seconds = (now - start_time).total_seconds()
                            
                            if uptime_seconds < 60:
                                uptime = f"{int(uptime_seconds)}s"
                            elif uptime_seconds < 3600:
                                uptime = f"{int(uptime_seconds / 60)}m"
                            elif uptime_seconds < 86400:
                                uptime = f"{int(uptime_seconds / 3600)}h {int((uptime_seconds % 3600) / 60)}m"
                            else:
                                uptime = f"{int(uptime_seconds / 86400)}d {int((uptime_seconds % 86400) / 3600)}h"
                    elif phase == 'Pending':
                        status = 'starting'
                    elif phase in ('Failed', 'Unknown'):
                        status = 'error'
                    
                    # Count ready containers
                    if pod.status.container_statuses:
                        for cs in pod.status.container_statuses:
                            total_containers += 1
                            if cs.ready:
                                ready_containers += 1
                    
                    services.append({
                        'id': service_key,
                        'name': service_key,
                        'container_name': pod.metadata.name,
                        'status': status,
                        'uptime': uptime,
                        'ready': f"{ready_containers}/{total_containers}",
                        'cpu': 0,  # Would need metrics-server for this
                        'memory': 0,
                        'restart_count': sum(cs.restart_count for cs in pod.status.container_statuses) if pod.status.container_statuses else 0
                    })
                else:
                    services.append({
                        'id': service_key,
                        'name': service_key,
                        'container_name': f'{service_key}-*',
                        'status': 'not_found',
                        'uptime': None
                    })
            except Exception as e:
                logger.error(f"Error getting K8s status for {service_key}: {e}")
                services.append({
                    'id': service_key,
                    'name': service_key,
                    'container_name': f'{service_key}-*',
                    'status': 'error',
                    'error': str(e)
                })
        
        return services
    
    def _get_docker_services_status(self, client) -> List[Dict[str, Any]]:
        """Get service status from Docker (original implementation)"""
        service_map = {
            'backend': 'shopple-backend',
            'crawler': 'shopple-crawler',
            'worker': 'shopple-worker',
            'fluent-bit': 'shopple-fluent-bit',
            'opensearch': 'shopple-opensearch'
        }
        
        services = []
        for service_key, container_name in service_map.items():
            status = 'offline'
            uptime = None
            cpu_usage = 0
            memory_usage = 0
            
            try:
                container = client.containers.get(container_name)
                state = container.attrs.get('State', {})
                
                if state.get('Running'):
                    status = 'online'
                    started_at = state.get('StartedAt')
                    # Calculate uptime logic (simplified from legacy or re-implemented if needed)
                    # Legacy used arrow or datetime.
                    pass 
                
                # Stats collection is intentionally deferred to avoid heavy polling.
                services.append({
                    'id': service_key,
                    'name': service_key,
                    'container_name': container_name,
                    'status': status,
                    'uptime': uptime,
                    'cpu': cpu_usage,
                    'memory': memory_usage
                })
            except Exception as e:
                services.append({
                    'id': service_key,
                    'name': service_key,
                    'container_name': container_name,
                    'status': 'error',
                    'error': str(e)
                })
        return services

    def restart_service(self, service_id: str) -> bool:
        """Restart a service - supports both Docker and Kubernetes"""
        
        # Try Kubernetes first
        k8s_client = self._get_k8s_client()
        if k8s_client:
            return self._restart_k8s_service(k8s_client, service_id)
        
        # Fall back to Docker
        docker_client = self.get_docker_client()
        if docker_client:
            return self._restart_docker_service(docker_client, service_id)
        
        raise Exception('Neither Kubernetes nor Docker client available')
    
    def _restart_k8s_service(self, k8s_client, service_id: str) -> bool:
        """Restart a Kubernetes deployment by deleting pods (they'll be recreated)"""
        from kubernetes import client
        
        # Map service names to K8s deployment labels
        service_map = {
            'backend': {'app': 'backend'},
            'frontend': {'app': 'frontend'},
            'crawler': {'app': 'crawler'},
            'worker': {'app': 'worker'},
            'opensearch': {'app': 'opensearch'},
            'opensearch-dashboards': {'app': 'opensearch-dashboards'}
        }
        
        labels = service_map.get(service_id)
        if not labels:
            raise ValueError(f"Unknown service: {service_id}")
        
        namespace = os.environ.get('K8S_NAMESPACE', 'default')
        label_selector = ','.join([f"{k}={v}" for k, v in labels.items()])
        
        # Delete pods to trigger restart (deployment will recreate them)
        pods = k8s_client.list_namespaced_pod(namespace, label_selector=label_selector)
        if not pods.items:
            raise ValueError(f"No pods found for service: {service_id}")
        
        for pod in pods.items:
            k8s_client.delete_namespaced_pod(pod.metadata.name, namespace)
            logger.info(f"Deleted pod {pod.metadata.name} for restart")
        
        return True
    
    def _restart_docker_service(self, client, service_id: str) -> bool:
        """Restart a Docker container"""
        service_map = {
            'backend': 'shopple-backend',
            'crawler': 'shopple-crawler',
            'worker': 'shopple-worker',
            'fluent-bit': 'shopple-fluent-bit',
            'opensearch': 'shopple-opensearch'
        }
        
        container_name = service_map.get(service_id)
        if not container_name:
            raise ValueError(f"Unknown service: {service_id}")
            
        container = client.containers.get(container_name)
        container.restart()
        return True

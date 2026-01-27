"""
Service for monitoring system resources and container stats.
"""
import os
import psutil
import docker
from typing import Dict, Any, List

from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

class ResourceMonitorService:
    def __init__(self):
        self.docker_client = None
        # Check if Docker socket exists before trying to connect
        if os.path.exists('/var/run/docker.sock'):
            try:
                self.docker_client = docker.from_env()
                logger.info("Docker client initialized successfully")
            except Exception as e:
                logger.warning("Docker client failed to initialize", extra={"error": str(e)})
        else:
            logger.info("Docker socket not found - Container monitoring disabled")

    def get_system_stats(self) -> Dict[str, Any]:
        """Get host/container system stats using psutil"""
        try:
            cpu_percent = psutil.cpu_percent(interval=None)
            memory = psutil.virtual_memory()
            
            return {
                "cpu": {
                    "usage_percent": cpu_percent,
                    "count": psutil.cpu_count(),
                },
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "used": memory.used,
                    "percent": memory.percent
                }
            }
        except Exception as e:
            log_error(logger, e, context={"operation": "get_system_stats"})
            return {}

    def get_container_stats(self) -> List[Dict[str, Any]]:
        """Get stats for shopple containers if running in Docker"""
        if not self.docker_client:
            return []
            
        containers = []
        try:
            # Filter for our specific containers
            target_containers = ['shopple-backend', 'shopple-crawler', 'shopple-worker']
            
            for container in self.docker_client.containers.list():
                if container.name in target_containers:
                    try:
                        stats = container.stats(stream=False)
                        
                        # Calculate CPU percentage
                        # Docker stats logic is complex, simplified approximation:
                        cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                                    stats['precpu_stats']['cpu_usage']['total_usage']
                        system_cpu_delta = stats['cpu_stats']['system_cpu_usage'] - \
                                           stats['precpu_stats']['system_cpu_usage']
                        number_cpus = stats['cpu_stats']['online_cpus']
                        
                        cpu_percent = 0.0
                        if system_cpu_delta > 0 and cpu_delta > 0:
                            cpu_percent = (cpu_delta / system_cpu_delta) * number_cpus * 100.0

                        # Memory usage
                        mem_usage = stats['memory_stats']['usage']
                        mem_limit = stats['memory_stats']['limit']
                        mem_percent = (mem_usage / mem_limit) * 100.0 if mem_limit > 0 else 0

                        containers.append({
                            "name": container.name,
                            "status": container.status,
                            "cpu_percent": round(cpu_percent, 2),
                            "memory_usage_mb": round(mem_usage / (1024 * 1024), 2),
                            "memory_limit_mb": round(mem_limit / (1024 * 1024), 2),
                            "memory_percent": round(mem_percent, 2)
                        })
                    except Exception as inner_e:
                        logger.warning(f"Could not get stats for {container.name}", extra={"error": str(inner_e)})
                        containers.append({
                            "name": container.name,
                            "status": container.status,
                            "error": "Stats unavailable"
                        })
                        
            return containers
        except Exception as e:
            log_error(logger, e, context={"operation": "get_container_stats"})
            return []

_resource_monitor = ResourceMonitorService()

def get_resource_monitor():
    return _resource_monitor

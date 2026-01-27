from datetime import datetime, timezone, timedelta
import psutil
from common.base.base_service import BaseService
from services.system.initialization import (
    get_classifier, 
    get_crawler_manager, 
    get_file_storage_manager,
    is_services_initializing
)
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class HealthService(BaseService):
    def __init__(self):
        self.startup_time = datetime.now(timezone.utc)

    def _get_server_time_payload(self):
        localized = datetime.now(timezone.utc).astimezone()
        offset = localized.utcoffset() or timedelta(0)

        tzinfo = localized.tzinfo
        tz_label = getattr(tzinfo, 'key', None) if tzinfo else None
        if not tz_label and tzinfo:
            tz_label = tzinfo.tzname(localized)

        return {
            'timestamp': localized.isoformat(),
            'timezone': tz_label or 'UTC',
            'utc_offset_minutes': int(offset.total_seconds() // 60)
        }

    def get_health_data(self):
        initializing = is_services_initializing()
        classifier = get_classifier()
        crawler_manager = get_crawler_manager()
        file_storage = get_file_storage_manager()
        
        # System Metrics
        cpu_percent = psutil.cpu_percent(interval=0)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Uptime
        uptime_duration = datetime.now(timezone.utc) - self.startup_time
        uptime_hours = uptime_duration.total_seconds() / 3600
        uptime_percentage = min(99.9, (uptime_hours / (24 * 30)) * 100)

        services_health = {
            'classifier': classifier is not None,
            'crawler_manager': crawler_manager is not None,
            'file_storage': file_storage is not None
        }

        health_data = {
            'status': 'initializing' if initializing else 'healthy',
            'initializing': initializing,
            **self._get_server_time_payload(),
            'uptime': f"{uptime_percentage:.1f}%",
            'uptime_hours': round(uptime_hours, 2),
            'system_metrics': {
                'cpu_usage': round(cpu_percent, 1),
                'memory_usage': round(memory.percent, 1),
                'disk_usage': round(disk.percent, 1),
                'memory_total_gb': round(memory.total / (1024**3), 2),
                'memory_available_gb': round(memory.available / (1024**3), 2),
                'disk_total_gb': round(disk.total / (1024**3), 2),
                'disk_free_gb': round(disk.free / (1024**3), 2)
            },
            'services': services_health,
            'all_services_healthy': all(services_health.values()) and not initializing
        }

        if classifier:
            try:
                cache_stats = classifier.get_cache_stats()
                health_data['cache_status'] = {
                    'entries': cache_stats.get('total_entries', 0),
                    'hit_rate': cache_stats.get('hit_rate_percentage', 0),
                    'size': cache_stats.get('cache_file_size', '0 KB')
                }
            except Exception:
                health_data['cache_status'] = {'error': 'Stats unavailable'}
        
        return health_data

    def get_simple_health(self):
        classifier = get_classifier()
        return {
            'status': 'healthy',
            'classifier_ready': classifier is not None,
            **self._get_server_time_payload()
        }

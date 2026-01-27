from flask import Blueprint
from backend.features.system.controller.system_controller import SystemController
from backend.features.system.service.system_service import SystemService
from backend.features.system.controller.health_controller import HealthController
from backend.features.system.service.health_service import HealthService
from backend.features.system.controller.cache_controller import CacheController
from backend.features.system.service.cache_management_service import CacheManagementService
from backend.features.system.controller.storage_controller import StorageController
from backend.features.system.service.storage_service import StorageService
from backend.features.system.controller.key_controller import KeyController
from backend.features.system.service.key_management_service import KeyManagementService
from backend.features.system.controller.audit_controller import AuditController
from backend.features.system.service.audit_service import AuditService
from backend.features.system.controller.proxy_controller import ProxyController
from backend.features.system.service.proxy_service import ProxyService
from backend.features.system.controller.resource_controller import ResourceController

# Instantiate Services
system_service = SystemService()
health_service = HealthService()
cache_service = CacheManagementService()
storage_service = StorageService()
key_service = KeyManagementService()
audit_service = AuditService()
proxy_service = ProxyService()

# Instantiate Controllers
system_controller = SystemController(system_service)
health_controller = HealthController(health_service)
cache_controller = CacheController(cache_service)
storage_controller = StorageController(storage_service)
key_controller = KeyController(key_service)
audit_controller = AuditController(audit_service)
proxy_controller = ProxyController(proxy_service)
resource_controller = ResourceController()

# Blueprint
system_bp = Blueprint('system', __name__)

# System Routes (Docker/Services)
system_bp.add_url_rule('/api/system/services', view_func=system_controller.get_services_status, methods=['GET'])
system_bp.add_url_rule('/api/system/services/<service_id>/restart', view_func=system_controller.restart_service, methods=['POST'])

# Resource Monitoring & Config
system_bp.add_url_rule('/api/system/resources', view_func=resource_controller.get_stats, methods=['GET'])
system_bp.add_url_rule('/api/system/crawler-config', view_func=resource_controller.update_crawler_config, methods=['PUT'])

# Health Routes
system_bp.add_url_rule('/health', view_func=health_controller.health_check, methods=['GET'])
system_bp.add_url_rule('/api/health', view_func=health_controller.health_check, methods=['GET'])
system_bp.add_url_rule('/api/stats', view_func=health_controller.get_stats, endpoint='health_stats', methods=['GET'])
system_bp.add_url_rule('/api/system/usage', view_func=health_controller.get_usage, methods=['GET'])

# Cache Routes
system_bp.add_url_rule('/api/cache/stats', view_func=cache_controller.get_cache_stats, methods=['GET'])
system_bp.add_url_rule('/api/cache/entries', view_func=cache_controller.get_cache_entries, methods=['GET'])
system_bp.add_url_rule('/api/cache/suggestions', view_func=cache_controller.get_cache_suggestions, methods=['POST'])
system_bp.add_url_rule('/api/cache/entry', view_func=cache_controller.update_cache_entry, methods=['PUT'])
system_bp.add_url_rule('/api/cache/entry', view_func=cache_controller.delete_cache_entry, methods=['DELETE'])
system_bp.add_url_rule('/api/cache/cleanup', view_func=cache_controller.cleanup_cache, methods=['POST'])
system_bp.add_url_rule('/api/cache/clear', view_func=cache_controller.clear_cache, methods=['POST'])
system_bp.add_url_rule('/api/cache/save-edited', view_func=cache_controller.save_edited_data_to_cache, methods=['POST'])
system_bp.add_url_rule('/api/cache/config', view_func=cache_controller.get_cache_config, methods=['GET'])
system_bp.add_url_rule('/api/cache/configure', view_func=cache_controller.configure_cache, methods=['POST'])
system_bp.add_url_rule('/api/cache/debug', view_func=cache_controller.debug_cache, methods=['POST'])
system_bp.add_url_rule('/api/cache/debug-keys', view_func=cache_controller.debug_cache_keys, methods=['POST'])

# Storage Routes
system_bp.add_url_rule('/api/crawler/storage/files', view_func=storage_controller.handle_files, methods=['GET', 'POST', 'DELETE'])
system_bp.add_url_rule('/api/crawler/storage/config', view_func=storage_controller.handle_config, methods=['GET', 'POST'])
system_bp.add_url_rule('/api/crawler/storage/status/<store>/<category>/<filename>', view_func=storage_controller.get_file_status, methods=['GET'])
system_bp.add_url_rule('/api/crawler/storage/progress', view_func=storage_controller.get_progress, methods=['GET'])
system_bp.add_url_rule('/api/crawler/storage/files/<store>/<category>/<path:filename>/download-inspect', view_func=storage_controller.download_inspect, methods=['GET'])

# Key Routes
system_bp.add_url_rule('/api/keys/status', view_func=key_controller.get_status, methods=['GET'])
system_bp.add_url_rule('/api/keys/allowed-models', view_func=key_controller.get_allowed_models, methods=['GET'])
system_bp.add_url_rule('/api/keys/default-models', view_func=key_controller.get_model_defaults, methods=['GET'])
system_bp.add_url_rule('/api/keys/allowed-models', view_func=key_controller.update_allowed_models, methods=['POST'])
system_bp.add_url_rule('/api/keys/set', view_func=key_controller.set_keys, methods=['POST'])
system_bp.add_url_rule('/api/keys/test', view_func=key_controller.test_key, methods=['POST'])
system_bp.add_url_rule('/api/keys/reload', view_func=key_controller.reload_keys, methods=['POST'])

# Audit Routes
system_bp.add_url_rule('/api/audit/log', view_func=audit_controller.ingest_audit_log, methods=['POST'])
system_bp.add_url_rule('/api/frontend/log', view_func=audit_controller.ingest_frontend_log, methods=['POST'])
system_bp.add_url_rule('/api/audit/list', view_func=audit_controller.list_audit_logs, methods=['GET'])
system_bp.add_url_rule('/api/audit/stats', view_func=audit_controller.get_audit_stats, methods=['GET'])
system_bp.add_url_rule('/api/audit/retention', view_func=audit_controller.enforce_retention, methods=['POST'])
system_bp.add_url_rule('/api/audit/storage', view_func=audit_controller.get_storage_usage, methods=['GET'])
system_bp.add_url_rule('/api/audit/optimize', view_func=audit_controller.optimize_storage, methods=['POST'])
system_bp.add_url_rule('/api/audit/cleanup', view_func=audit_controller.delete_oldest_records, methods=['POST'])

# Proxy Routes
system_bp.add_url_rule('/api/products/proxy-image', view_func=proxy_controller.proxy_image, methods=['GET'])

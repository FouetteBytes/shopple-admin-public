import re
import json
from datetime import datetime
from common.base.base_service import BaseService
from services.system.initialization import get_file_storage_manager, is_file_storage_available
from backend.features.ai.service.classifier_history_service import ClassificationHistoryService
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

class ClassifierExportService(BaseService):
    def __init__(self):
        self.history_service = ClassificationHistoryService()

    def _slugify(self, value: str | None, fallback: str = "general") -> str:
        if not value: return fallback
        sanitized = re.sub(r'[^a-z0-9]+', '-', value.strip().lower())
        sanitized = re.sub(r'-+', '-', sanitized).strip('-')
        return sanitized or fallback

    def build_export_payload(self, results: list, supermarket: str, classification_date: str, custom_name: str):
        now = datetime.utcnow()
        total_products = len(results)
        success_count = sum(1 for item in results if item.get('status') == 'success')
        failed_count = total_products - success_count
        
        supermarket_label = (supermarket or '').strip() or 'unknown'
        supermarket_slug = self._slugify(supermarket_label, fallback='supermarket')

        try:
            parsed_date = datetime.fromisoformat(classification_date.replace('Z', '+00:00')) if classification_date else None
        except: parsed_date = None

        filename_parts = []
        if supermarket_slug != 'unknown': filename_parts.append(supermarket_slug)
        custom_slug = self._slugify(custom_name, fallback='') if custom_name else ''
        if custom_slug: filename_parts.append(custom_slug)
        
        date_segment = parsed_date.strftime('%Y%m%d') if parsed_date else now.strftime('%Y%m%d_%H%M%S')
        filename_parts.extend(['classification', date_segment])
        filename = '_'.join(filename_parts) + '.json'

        classification_iso = (parsed_date or now).isoformat()
        
        metadata = {
            'generated_at': now.isoformat(), 'supermarket': supermarket_label, 'supermarket_slug': supermarket_slug,
            'custom_name': custom_name, 'classification_date': classification_iso, 'total_products': total_products,
            'successful_classifications': success_count, 'failed_classifications': failed_count, 'filename': filename
        }
        
        storage_metadata = {
            'type': 'classification_results', 'supermarket': supermarket_slug, 'display_supermarket': supermarket_label,
            'custom_name': custom_name, 'classification_date': classification_iso, 'total_products': str(total_products),
            'successful': str(success_count), 'failed': str(failed_count), 'upload_time': now.isoformat(), 'filename': filename
        }
        
        return filename, {'metadata': metadata, 'results': results}, storage_metadata

    def upload_to_cloud(self, results, supermarket, classification_date, custom_name):
        if not is_file_storage_available(): raise Exception("File storage system not available")
        manager = get_file_storage_manager()
        
        filename, payload, storage_meta = self.build_export_payload(results, supermarket, classification_date, custom_name)
        content = json.dumps(payload, indent=2, ensure_ascii=False)
        
        res = manager.save_classification_result(
            storage_meta.get('supermarket', 'classifier'),
            filename,
            content,
            storage_meta
        )
        
        if res.get('success'):
             self.history_service.record_event('cloud_upload', 'Classification results uploaded to cloud', {
                  'cloud_path': res.get('cloud_path'), 'filename': filename, 'metadata': storage_meta
             })
             
        return res, payload, storage_meta, filename

    def manual_upload(self, results, supermarket, classification_date, custom_name, filename_override):
        if not is_file_storage_available(): raise Exception("File storage system not available")
        manager = get_file_storage_manager()

        filename, payload, storage_meta = self.build_export_payload(results, supermarket, classification_date, custom_name)
        if filename_override:
            storage_meta['filename'] = filename_override
            filename = filename_override if filename_override.endswith('.json') else f"{filename_override}.json"
            
        content = json.dumps(payload, indent=2, ensure_ascii=False)
        res = manager.save_classification_result(
             storage_meta.get('supermarket', 'classifier'), filename, content, storage_meta
        )
        
        if res.get('success'):
             self.history_service.record_event('cloud_manual_upload', 'Manual classification results uploaded', {
                  'cloud_path': res.get('cloud_path'), 'filename': filename, 'metadata': storage_meta
             })
             
        return res, filename, storage_meta

    def list_files(self):
        if not is_file_storage_available(): raise Exception("File storage not available")
        return get_file_storage_manager().list_classification_results()

    def download_file(self, cloud_path):
        if not is_file_storage_available(): raise Exception("File storage not available")
        return get_file_storage_manager().download_classification_result(cloud_path)

    def delete_file(self, cloud_path):
        if not is_file_storage_available(): raise Exception("File storage not available")
        res = get_file_storage_manager().delete_classification_result(cloud_path)
        if res.get('success'):
             self.history_service.record_event('cloud_delete', 'Classification result deleted', {'cloud_path': cloud_path})
        return res

    def update_metadata(self, cloud_path, updates):
        if not is_file_storage_available(): raise Exception("File storage not available")
        res = get_file_storage_manager().update_classification_metadata(cloud_path, updates)
        if res.get('success'):
             self.history_service.record_event('cloud_update', 'Metadata updated', {'cloud_path': res.get('cloud_path', cloud_path)})
        return res

from flask import request, jsonify
from common.base.base_controller import BaseController
from backend.features.system.service.cache_management_service import CacheManagementService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class CacheController(BaseController):
    def __init__(self, cache_service: CacheManagementService):
        self.cache_service = cache_service

    def get_cache_stats(self):
        try:
            stats = self.cache_service.get_stats()
            return jsonify(stats)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def get_cache_entries(self):
        try:
            res = self.cache_service.get_entries()
            return jsonify(res)
        except Exception as e:
             return jsonify({'error': str(e)}), 500

    def get_cache_suggestions(self):
        try:
             data = request.get_json()
             suggestions = self.cache_service.get_suggestions(data.get('product_name', ''), data.get('limit', 5))
             return jsonify({'suggestions': suggestions})
        except Exception as e:
             return jsonify({'error': str(e)}), 500

    def update_cache_entry(self):
        try:
            data = request.get_json()
            success = self.cache_service.update_entry(data.get('cache_key'), data.get('updated_result'))
            return jsonify({'message': 'Updated'}) if success else (jsonify({'error': 'Not found'}), 404)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def delete_cache_entry(self):
        try:
            data = request.get_json()
            success = self.cache_service.delete_entry(data.get('cache_key'))
            return jsonify({'message': 'Deleted'}) if success else (jsonify({'error': 'Not found'}), 404)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def cleanup_cache(self):
        try:
            count = self.cache_service.cleanup()
            return jsonify({'message': f'Cleaned {count}', 'removed_count': count})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    def clear_cache(self):
        try:
            self.cache_service.clear()
            return jsonify({'message': 'Cleared'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def save_edited_data_to_cache(self):
        try:
            data = request.get_json()
            result = self.cache_service.save_edited_data(data.get('products', []))
            return jsonify(result)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_cache_config(self):
        try:
            return jsonify(self.cache_service.get_config())
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def configure_cache(self):
        try:
             data = request.get_json()
             self.cache_service.configure(data.get('similarity_threshold'), data.get('fuzzy_threshold'), data.get('max_age_days'))
             return jsonify({'message': 'Updated'})
        except Exception as e:
             return jsonify({'error': str(e)}), 500

    def debug_cache(self):
        try:
            data = request.get_json()
            return jsonify(self.cache_service.debug_cache(data.get('product_names', [])))
        except Exception as e:
             return jsonify({'success': False, 'error': str(e)}), 500

    def debug_cache_keys(self):
        # Mapped to debug_cache usually or separate logic? 
        # Legacy had both. I'll reuse debug_cache logic or split if distinct.
        # Logic in service::debug_cache handles basics.
        return self.debug_cache()

from typing import Dict, Any, Optional
from common.base.base_service import BaseService
from services.system.initialization import get_file_storage_manager, is_file_storage_available
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class StorageService(BaseService):
    def is_available(self) -> bool:
        return is_file_storage_available()

    def get_manager(self):
        if not self.is_available():
            raise Exception('File storage system not available')
        return get_file_storage_manager()

    def list_files(self) -> Dict[str, Any]:
        return self.get_manager().list_all_files_with_status()

    def upload_to_cloud(self, store, category, filename) -> Dict[str, Any]:
        return self.get_manager().upload_file_to_cloud(store, category, filename)

    def download_to_local(self, store, category, filename) -> Dict[str, Any]:
        return self.get_manager().download_file_to_local(store, category, filename)
    
    def download_content(self, cloud_path) -> Dict[str, Any]:
        return self.get_manager().download_file_content(cloud_path)
    
    def make_cloud_only(self, store, category, filename) -> Dict[str, Any]:
        return self.get_manager().make_cloud_only(store, category, filename)
    
    def get_file_content(self, store, category, filename) -> Dict[str, Any]:
        return self.get_manager().get_file_content_as_json(store, category, filename)

    def auto_upload(self, store, category) -> Dict[str, Any]:
        return self.get_manager().auto_upload_new_files(store, category)

    def clear_all(self) -> Dict[str, Any]:
        return self.get_manager().clear_all_files()

    def smart_delete(self, store, category, filename, delete_local, delete_cloud) -> Dict[str, Any]:
        return self.get_manager().smart_delete_file(store, category, filename, delete_local, delete_cloud)

    def get_config(self) -> Dict[str, Any]:
        return self.get_manager().config

    def save_config(self, new_config) -> Dict[str, Any]:
        return self.get_manager().save_config(new_config)

    def get_file_status(self, store, category, filename) -> Dict[str, Any]:
        return self.get_manager().get_file_status(store, category, filename)

    def get_progress(self) -> Dict[str, Any]:
        return self.get_manager().get_upload_progress()

    def download_and_inspect(self, store, category, filename) -> Dict[str, Any]:
        manager = self.get_manager()
        cloud_path = f"crawler-data/{store}/{category}/{filename}"
        
        result = manager.download_file_content(cloud_path)
        if not result.get('success'):
            return result
            
        cleanup_result = manager.make_cloud_only(store, category, filename)
        
        return {
            'success': True,
            'content': result['content'],
            'cleanup_status': cleanup_result.get('status', 'cloud_only')
        }

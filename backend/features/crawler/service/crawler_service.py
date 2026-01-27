from typing import Any, Dict, List, Optional
from services.system.initialization import (
    get_crawler_manager,
    get_crawler_scheduler,
    get_file_storage_manager,
    is_crawler_scheduler_available,
    is_services_initializing
)
from common.base.base_service import BaseService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Cache for lazy initialization status
_initialization_retried = False


def _ensure_crawler_available():
    """Check if crawler is available, with lazy retry for production stability"""
    global _initialization_retried
    
    crawler_manager = get_crawler_manager()
    
    # Retry initialization once when the crawler manager is unavailable.
    if not crawler_manager and not _initialization_retried and not is_services_initializing():
        _initialization_retried = True
        logger.info("Attempting lazy initialization of crawler manager")
        try:
            from services.system.initialization import initialize_crawler
            initialize_crawler()
            crawler_manager = get_crawler_manager()
        except Exception as e:
            logger.warning(f"Lazy initialization of crawler failed: {e}")
    
    if not crawler_manager:
        raise Exception('Crawler system not available')
    return crawler_manager


class CrawlerService(BaseService):
    def get_status(self) -> Dict[str, Any]:
        """Get crawler system status"""
        logger.debug("Fetching crawler status")
        crawler_manager = get_crawler_manager()
        
        # If crawler manager is not ready yet, return loading state
        if not crawler_manager:
            return {
                'available': False,
                'loading': True,
                'active_crawlers': 0,
                'total_available': 0
            }
        
        # Clean up inactive crawlers before counting
        crawler_manager.cleanup_inactive_crawlers()
        
        return {
            'available': True,  
            'loading': False,
            'active_crawlers': crawler_manager.get_active_crawler_count(),
            'total_available': crawler_manager._count_total_crawlers()
        }

    def get_available_crawlers(self) -> List[Dict[str, Any]]:
        """Get all available crawlers with metadata"""
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.get_available_crawlers()

    def start_crawler(self, store: str, category: str, max_items: Optional[int], headless_mode: bool, limit_mode: str) -> str:
        crawler_manager = _ensure_crawler_available()
        
        crawler_manager = get_crawler_manager()
        return crawler_manager.start_crawler(store, category, max_items, headless_mode, limit_mode)

    def start_crawlers_batch(self, crawler_specs: List[Dict[str, Any]], mode: str, wait_for_completion: bool) -> List[str]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.start_crawlers_batch(
            crawler_specs,
            mode=mode,
            wait_for_completion=wait_for_completion,
        )

    def start_store_group(self, store: str, categories: Optional[List[str]], mode: str, max_items: Optional[int], headless_mode: bool, limit_mode: str) -> List[str]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.start_store_group(
            store,
            categories=categories,
            mode=mode,
            max_items=max_items,
            headless_mode=headless_mode,
            limit_mode=limit_mode,
        )

    def start_category_group(self, category: str, stores: Optional[List[str]], mode: str, max_items: Optional[int], headless_mode: bool, limit_mode: str) -> List[str]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.start_category_group(
            category,
            stores=stores,
            mode=mode,
            max_items=max_items,
            headless_mode=headless_mode,
            limit_mode=limit_mode,
        )

    def start_all_available_crawlers(self, mode: str, max_items: Optional[int], headless_mode: bool, limit_mode: str) -> List[str]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.start_all_available_crawlers(
            mode=mode,
            max_items=max_items,
            headless_mode=headless_mode,
            limit_mode=limit_mode,
        )

    def stop_crawler(self, crawler_id: str) -> bool:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.stop_crawler(crawler_id)

    def stop_all_crawlers(self) -> int:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.stop_all_crawlers()

    def get_crawler_status(self, crawler_id: str) -> Dict[str, Any]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.get_crawler_status(crawler_id)

    def get_all_crawler_statuses(self) -> List[Dict[str, Any]]:
        crawler_manager = _ensure_crawler_available()
        crawler_manager.cleanup_inactive_crawlers()
        return crawler_manager.get_all_crawler_statuses()

    def get_crawler_results(self, crawler_id: str) -> Optional[Dict[str, Any]]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.get_crawler_results(crawler_id)
    
    def get_all_results(self) -> Dict[str, Any]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.get_all_results()

    def list_output_files(self) -> List[Dict[str, Any]]:
        crawler_manager = _ensure_crawler_available()
        
        file_storage_manager = get_file_storage_manager()
        if file_storage_manager:
            files_data = file_storage_manager.list_all_files()
            return files_data.get('files', [])
        else:
            files = crawler_manager.list_output_files()
            formatted_files = []
            for store, file_list in files.items():
                for filename in file_list:
                    formatted_files.append({
                        'name': filename, 
                        'store': store, 
                        'category': 'unknown', 
                        'location': 'local'
                    })
            return formatted_files

    def load_output_file(self, store: str, filename: str) -> Dict[str, Any]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.load_output_file(store, filename)

    def delete_output_file(self, store: str, filename: str) -> Dict[str, Any]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.delete_output_file(store, filename)

    def aggregate_results(self, crawler_ids: List[str]) -> Dict[str, Any]:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.aggregate_results(crawler_ids)

    def cleanup_completed_crawlers(self, max_age_hours: int) -> int:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.cleanup_completed_crawlers(max_age_hours)

    def clear_all_results(self) -> int:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.clear_all_results()

    def clear_results(self, result_ids: List[str]) -> int:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.clear_results(result_ids)

    def clear_all_activities(self) -> int:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.clear_all_activities()

    def clear_specific_activities(self, activity_ids: List[str]) -> int:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.clear_specific_activities(activity_ids)

    def delete_result(self, result_id: str) -> bool:
        crawler_manager = _ensure_crawler_available()
        return crawler_manager.delete_result(result_id)

    def get_crawler_settings(self) -> Dict[str, Any]:
        """Get current crawler settings including concurrency limits"""
        import os
        import json
        
        # Get config path
        crawler_dir = os.path.join(os.getenv('PROJECT_ROOT', os.getcwd()), 'crawler')
        config_path = os.path.join(crawler_dir, 'config', 'crawler_settings.json')
        
        # Default settings
        settings = {
            'max_concurrent_crawlers': 2,
            'config_path': config_path
        }
        
        # Read from config file
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    file_config = json.load(f)
                    settings.update(file_config)
            except Exception:
                pass
        
        # Override with env var if set
        env_max = os.environ.get('MAX_CONCURRENT_CRAWLERS')
        if env_max:
            settings['max_concurrent_crawlers'] = int(env_max)
        
        return settings

    def set_crawler_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Update crawler settings"""
        import os
        import json
        
        # Get config path
        crawler_dir = os.path.join(os.getenv('PROJECT_ROOT', os.getcwd()), 'crawler')
        config_path = os.path.join(crawler_dir, 'config', 'crawler_settings.json')
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        
        # Load existing config
        current_config = {}
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    current_config = json.load(f)
            except Exception:
                pass
        
        # Update with new settings
        if 'max_concurrent_crawlers' in settings:
            max_val = int(settings['max_concurrent_crawlers'])
            # Validate range (1-10 reasonable limit)
            if max_val < 1:
                max_val = 1
            elif max_val > 10:
                max_val = 10
            current_config['max_concurrent_crawlers'] = max_val
        
        # Save updated config
        with open(config_path, 'w') as f:
            json.dump(current_config, f, indent=4)
        
        logger.info("Crawler settings updated", extra={"settings": current_config})
        
        return current_config

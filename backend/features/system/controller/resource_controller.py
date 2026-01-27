from flask import Blueprint, jsonify, request
from backend.features.system.service.resource_monitor import get_resource_monitor
from services.system.logger_service import get_logger
import os
import json

logger = get_logger(__name__)

class ResourceController:
    def __init__(self):
        self.monitor = get_resource_monitor()
        # Path mapped in docker-compose
        self.crawler_config_path = os.path.join(
            os.getenv('PROJECT_ROOT', '/app'), 
            'crawler', 'config', 'crawler_settings.json'
        )

    def get_stats(self):
        """Get system and container resource stats"""
        system_stats = self.monitor.get_system_stats()
        container_stats = self.monitor.get_container_stats()
        
        # Also include current crawler config
        crawler_config = {}
        try:
            if os.path.exists(self.crawler_config_path):
                with open(self.crawler_config_path, 'r') as f:
                    crawler_config = json.load(f)
        except Exception:
            pass

        return jsonify({
            "success": True,
            "system": system_stats,
            "containers": container_stats,
            "crawler_config": crawler_config
        })

    def update_crawler_config(self):
        """Update crawler configuration"""
        try:
            data = request.json
            max_concurrent = data.get('max_concurrent_crawlers')
            
            if max_concurrent is not None:
                try:
                    max_concurrent = int(max_concurrent)
                    if max_concurrent < 1:
                        return jsonify({'success': False, 'error': 'Must be at least 1'}), 400
                except ValueError:
                    return jsonify({'success': False, 'error': 'Invalid number'}), 400

            # Read existing
            current_config = {}
            if os.path.exists(self.crawler_config_path):
                with open(self.crawler_config_path, 'r') as f:
                    current_config = json.load(f)
            
            # Update
            if max_concurrent:
                current_config['max_concurrent_crawlers'] = max_concurrent
                
            # Save
            os.makedirs(os.path.dirname(self.crawler_config_path), exist_ok=True)
            with open(self.crawler_config_path, 'w') as f:
                json.dump(current_config, f, indent=4)
                
            logger.info("Updated crawler config", extra={"config": current_config})
            
            return jsonify({
                "success": True, 
                "message": "Configuration updated",
                "config": current_config
            })
            
        except Exception as e:
            logger.error(f"Failed to update crawler config: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

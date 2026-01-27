from flask import jsonify
from common.base.base_controller import BaseController
from backend.features.system.service.health_service import HealthService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class HealthController(BaseController):
    def __init__(self, health_service: HealthService):
        self.health_service = health_service

    def health_check(self):
        try:
            data = self.health_service.get_health_data()
            logger.debug("Health check", extra={"initializing": data.get('initializing')})
            return jsonify(data)
        except Exception as e:
            return jsonify({
                'status': 'unhealthy',
                'error': str(e)
            }), 500

    def simple_health_check(self):
        try:
            data = self.health_service.get_simple_health()
            return jsonify(data)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def get_stats(self):
        try:
            # Reuse get_health_data or create specific stats method
            data = self.health_service.get_health_data()
            return jsonify(data)
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def get_usage(self):
        try:
             # Basic usage stats
             import psutil
             usage = {
                'cpu_percent': psutil.cpu_percent(interval=0),
                'memory_percent': psutil.virtual_memory().percent
             }
             return jsonify(usage)
        except Exception as e:
             return jsonify({'error': str(e)}), 500


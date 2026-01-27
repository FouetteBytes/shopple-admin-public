from flask import jsonify, request
from common.base.base_controller import BaseController
from backend.features.system.service.system_service import SystemService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class SystemController(BaseController):
    def __init__(self, system_service: SystemService):
        self.system_service = system_service

    def get_services_status(self):
        try:
            services = self.system_service.get_services_status()
            return jsonify({'success': True, 'services': services})
        except Exception as e:
            if 'Docker client' in str(e):
                 return jsonify({'services': [], 'error': str(e)}) # Return 200 with error as per legacy?
            return jsonify({'success': False, 'error': str(e)}), 500

    def restart_service(self, service_id):
        try:
            self.system_service.restart_service(service_id)
            return jsonify({'success': True, 'message': f'Service {service_id} restarting...'})
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

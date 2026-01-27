from flask import request, jsonify, Response
from common.base.base_controller import BaseController
from backend.features.system.service.proxy_service import ProxyService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class ProxyController(BaseController):
    def __init__(self, service: ProxyService):
        self.service = service

    def proxy_image(self):
        try:
            image_url = (request.args.get('url') or '').strip()
            result = self.service.fetch_image(image_url)
            
            return Response(
                result['content'],
                mimetype=result['content_type'],
                status=result['status_code']
            )
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 400
        except Exception as e:
             if "Upstream error" in str(e):
                  return jsonify({'success': False, 'error': str(e)}), 502
             return jsonify({'success': False, 'error': str(e)}), 500

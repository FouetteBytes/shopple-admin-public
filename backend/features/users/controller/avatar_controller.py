from flask import send_file, abort
from common.base.base_controller import BaseController
from backend.features.users.service.avatar_service import AvatarService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class AvatarController(BaseController):
    def __init__(self, service: AvatarService):
        self.service = service

    def serve_memoji(self, memoji_id: str):
        logger.debug("Memoji asset requested", extra={"memoji_id": memoji_id})
        
        path = self.service.get_memoji_path(memoji_id)
        if path:
             return send_file(path, mimetype="image/png", conditional=True, max_age=86400)
             
        # Generate placeholder
        buffer = self.service.generate_placeholder(memoji_id)
        
        # Determine name for download
        if memoji_id.startswith('assets/memoji/'):
            safe_name = memoji_id.replace('assets/memoji/', '')
        else:
            safe_name = memoji_id
        if "." not in safe_name: safe_name = f"{safe_name}.png"

        return send_file(buffer, mimetype="image/png", download_name=safe_name)

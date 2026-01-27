from flask import request, jsonify
from common.base.base_controller import BaseController
from backend.features.system.service.key_management_service import KeyManagementService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class KeyController(BaseController):
    def __init__(self, service: KeyManagementService):
        self.service = service

    def get_status(self):
        try:
            return jsonify(self.service.get_status())
        except Exception as e:
            logger.error(f"Error getting key status: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    def get_allowed_models(self):
        try:
            return jsonify(self.service.get_allowed_models())
        except Exception as e:
            logger.error(f"Error getting allowed models: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    def get_model_defaults(self):
        try:
            return jsonify(self.service.get_model_defaults())
        except Exception as e:
            logger.error(f"Error getting model defaults: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    def update_allowed_models(self):
        try:
            data = request.get_json(force=True, silent=True) or {}
            
            # Determine payload shape.
            if 'models' in data and 'defaults' in data:
                # Full configuration update
                payload = data
            elif 'models' in data and isinstance(data['models'], dict):
                # Legacy wrapper containing model settings only.
                payload = data['models']
            else:
                # Direct dict
                payload = data

            updated = self.service.update_allowed_models(payload)
            
            # Handle new return type from service
            if isinstance(updated, dict) and "defaults" in updated:
                return jsonify({"ok": True, "models": updated["models"], "defaults": updated["defaults"]})
            else:
                return jsonify({"ok": True, "models": updated})

        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": f"Failed to save models: {exc}"}), 500

    def set_keys(self):
        try:
            data = request.get_json(force=True, silent=True) or {}
            allowed = {k: data.get(k) for k in ['groq', 'openrouter', 'gemini', 'cerebras'] if k in data}
            return jsonify(self.service.set_keys(allowed))
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def test_key(self):
        try:
            logger.info(f"Test Key Request Headers: {dict(request.headers)}")
            logger.info(f"Test Key Request Body: {request.get_data(as_text=True)}")
            
            data = request.get_json(force=True, silent=True)
            if data is None:
                logger.error("Failed to parse JSON body (force=True returned None)")
                data = {}
            logger.info(f"Parsed JSON: {data}")
            
            res = self.service.test_provider(data.get('provider', ''), data.get('model'))
            if res.get('loading'): return jsonify(res), 503
            return jsonify(res)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400
        except Exception as e:
             return jsonify({"ok": False, "error": str(e)}), 200 # Return 200 with ok:False as per legacy

    def reload_keys(self):
        try:
            ok = self.service.reload_keys()
            return jsonify({"ok": ok})
        except Exception as e:
             return jsonify({'error': str(e)}), 500

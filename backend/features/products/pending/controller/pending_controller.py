from flask import request, jsonify
from common.base.base_controller import BaseController
from backend.features.products.pending.service.pending_service import PendingService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class PendingController(BaseController):
    def __init__(self, pending_service: PendingService):
        self.pending_service = pending_service

    def list_pending_products(self):
        try:
            status = request.args.get("status", "")
            products = self.pending_service.list_pending_products(status)
            return jsonify({"success": True, "products": products})
        except Exception as exc:
            logger.error(f"Failed to list pending: {exc}")
            return jsonify({"success": False, "error": str(exc)}), 500

    def create_pending_product(self):
        try:
            body = request.get_json() or {}
            admin_id = request.headers.get("X-Admin-Id", "admin")
            admin_name = request.headers.get("X-Admin-Name", "Admin User")
            
            request_id = body.get("requestId")
            if not request_id:
                return jsonify({"success": False, "error": "requestId is required"}), 400

            product = self.pending_service.create_pending_product(request_id, admin_id, admin_name)
            logger.info(f"Pending product created from req {request_id}", extra={"product": product})
            return jsonify({"success": True, "product": product}), 201

        except ValueError as exc:
            return jsonify({"success": False, "error": str(exc)}), 400 if "not found" not in str(exc) else 404
        except Exception as exc:
            logger.error(f"Failed to create pending product: {exc}")
            return jsonify({"success": False, "error": str(exc)}), 500

    def mark_pending_complete(self, pending_id: str):
        try:
            body = request.get_json() or {}
            request_id = body.get("requestId") # Optional if in doc, but passing it is safe
            admin_id = request.headers.get("X-Admin-Id", "system")
            admin_name = request.headers.get("X-Admin-Name", "System")

            self.pending_service.mark_complete(pending_id, request_id, admin_id, admin_name)
            
            logger.info(f"Pending product {pending_id} complete")
            return jsonify({"success": True, "message": "Marked as completed"})
        except ValueError as exc:
             return jsonify({"success": False, "error": str(exc)}), 404 if "not found" in str(exc) else 400
        except Exception as exc:
             logger.error(f"Failed to complete pending product: {exc}")
             return jsonify({"success": False, "error": str(exc)}), 500

    def delete_pending_product(self, pending_id: str):
        try:
            success = self.pending_service.delete_pending(pending_id)
            if not success:
                 return jsonify({"success": False, "error": "Pending product not found"}), 404
            
            logger.info(f"Pending product {pending_id} deleted")
            return jsonify({"success": True, "message": "Deleted successfully"})
        except Exception as exc:
             logger.error(f"Failed to delete pending product: {exc}")
             return jsonify({"success": False, "error": str(exc)}), 500

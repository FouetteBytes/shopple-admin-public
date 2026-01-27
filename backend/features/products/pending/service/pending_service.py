from typing import Any, Dict, List, Optional
from firebase_admin import firestore
from common.base.base_service import BaseService
from backend.features.products.pending.repository.pending_repository import PendingRepository
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class PendingService(BaseService):
    def __init__(self):
        self.repository = PendingRepository()

    def list_pending_products(self, status: Optional[str]) -> List[Dict[str, Any]]:
        products = self.repository.list_all(status)
        # Format timestamps
        for product in products:
            for field in ["createdAt", "updatedAt"]:
                val = product.get(field)
                if val and hasattr(val, "isoformat"):
                    product[field] = val.isoformat()
            
            approved_by = product.get("approvedBy")
            if approved_by and isinstance(approved_by, dict):
                approved_at = approved_by.get("approvedAt")
                if approved_at and hasattr(approved_at, "isoformat"):
                    approved_by["approvedAt"] = approved_at.isoformat()
        return products

    def create_pending_product(self, request_id: str, admin_id: str, admin_name: str) -> Dict[str, Any]:
        request_data = self.repository.get_request(request_id)
        if not request_data:
            raise ValueError("Product request not found")

        pending_data = {
            "requestId": request_id,
            "productName": request_data.get("productName", ""),
            "brand": request_data.get("brand", ""),
            "size": request_data.get("size", ""),
            "category": request_data.get("categoryHint", ""),
            "store": request_data.get("store", ""),
            "storeLocation": request_data.get("storeLocation", {}),
            "photoUrls": request_data.get("photoUrls", []),
            "description": request_data.get("description", ""),
            "submittedBy": request_data.get("submittedBy", {}),
            "approvedBy": {
                "adminId": admin_id,
                "adminName": admin_name,
                "approvedAt": firestore.SERVER_TIMESTAMP
            },
            "status": "pending",
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP
        }

        # Create
        pending_id = self.repository.create(pending_data)
        pending_data["id"] = pending_id
        
        # Firestore SERVER_TIMESTAMP sentinels are not JSON-serializable.
        # Return ISO-8601 strings for response payloads.
        
        response_data = pending_data.copy()
        now_iso = firestore.datetime.datetime.now().isoformat()
        response_data['createdAt'] = now_iso
        response_data['updatedAt'] = now_iso
        response_data['approvedBy']['approvedAt'] = now_iso

        return response_data

    def mark_complete(self, pending_id: str, request_id: str, admin_id: str, admin_name: str) -> bool:
        pending = self.repository.get_by_id(pending_id)
        if not pending:
            raise ValueError("Pending product not found")
        
        actual_request_id = pending.get("requestId") or request_id
        if not actual_request_id:
             raise ValueError("requestId is required")

        # Update pending
        self.repository.update(pending_id, {
            "status": "completed",
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "completedAt": firestore.SERVER_TIMESTAMP
        })

        # Update Request
        req_data = self.repository.get_request(actual_request_id)
        if req_data:
            self.repository.update_request(actual_request_id, {
                "status": "completed",
                "updatedAt": firestore.SERVER_TIMESTAMP,
                "latestActivity": {
                    "timestamp": firestore.SERVER_TIMESTAMP,
                    "action": "completed",
                    "actor": admin_id,
                    "actorName": admin_name,
                    "summary": "Product added to database"
                }
            })
            self.repository.add_request_activity(actual_request_id, {
                "timestamp": firestore.SERVER_TIMESTAMP,
                "action": "completed",
                "actorId": admin_id,
                "actorName": admin_name,
                "summary": "Product successfully added to database",
                "metadata": {"pendingProductId": pending_id}
            })
        
        return True

    def delete_pending(self, pending_id: str) -> bool:
        if not self.repository.get_by_id(pending_id):
            return False
        return self.repository.delete(pending_id)

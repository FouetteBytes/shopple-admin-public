from typing import Any, Dict, List, Optional
from google.cloud import firestore
from google.cloud.firestore_v1 import FieldFilter
from common.base.base_repository import BaseRepository
from services.firebase.firebase_service import firebase_service
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class PendingRepository(BaseRepository[Dict[str, Any]]):
    @property
    def db(self):
         return firebase_service.get_client()

    def list_all(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        collection = self.db.collection("pending_products")
        query = collection.order_by("createdAt", direction=firestore.Query.DESCENDING)
        if status:
            query = query.where(filter=FieldFilter("status", "==", status))
        
        documents = query.stream()
        products = []
        for doc in documents:
            data = doc.to_dict()
            data["id"] = doc.id
            products.append(data)
        return products

    def find_by_id(self, id: str) -> Optional[Dict[str, Any]]:
        return self.get_by_id(id)
        
    def save(self, entity: Dict[str, Any]) -> Dict[str, Any]:
        try:
            # Create a copy to avoid modifying original
            data_to_save = entity.copy()
            doc_id = data_to_save.pop('id', None)
            
            if doc_id:
                doc_ref = self.db.collection('pending_products').document(doc_id)
                doc_ref.set(data_to_save, merge=True)
                entity['id'] = doc_id
            else:
                update_time, doc_ref = self.db.collection('pending_products').add(data_to_save)
                entity['id'] = doc_ref.id
            
            return entity
        except Exception as e:
            logger.error(f"Error saving pending product: {e}")
            raise

    def get_by_id(self, pending_id: str) -> Optional[Dict[str, Any]]:
        doc = self.db.collection("pending_products").document(pending_id).get()
        if doc.exists:
            data = doc.to_dict()
            data["id"] = doc.id
            return data
        return None

    def create(self, data: Dict[str, Any]) -> str:
        doc_ref = self.db.collection("pending_products").document()
        doc_ref.set(data)
        return doc_ref.id

    def update(self, pending_id: str, data: Dict[str, Any]) -> bool:
        ref = self.db.collection("pending_products").document(pending_id)
        if not ref.get().exists:
            return False
        ref.update(data)
        return True

    def delete(self, pending_id: str) -> bool:
        ref = self.db.collection("pending_products").document(pending_id)
        if not ref.get().exists:
            return False
        ref.delete()
        return True

    # Interaction with product_requests collection (Cross-domain, usually discouraged but needed for transaction/atomic op)
    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
         doc = self.db.collection("product_requests").document(request_id).get()
         return doc.to_dict() if doc.exists else None

    def update_request(self, request_id: str, data: Dict[str, Any]):
        self.db.collection("product_requests").document(request_id).update(data)

    def add_request_activity(self, request_id: str, activity: Dict[str, Any]):
        self.db.collection("product_requests").document(request_id).collection("activity").add(activity)

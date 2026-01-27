from typing import Any, Dict, List, Optional
from google.cloud import firestore
from common.base.base_repository import BaseRepository
from services.firebase.firebase_client import initialize_firebase
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class CategoryRepository(BaseRepository[Dict[str, Any]]):
    def __init__(self):
        # Initialize any base repository state.
        super().__init__()

    @property
    def db(self):
         return initialize_firebase()

    def find_by_id(self, id: str) -> Optional[Dict[str, Any]]:
        try:
            doc_ref = self.db.collection('categories').document(id)
            doc = doc_ref.get()
            if doc.exists:
                data = doc.to_dict()
                data['id'] = doc.id
                return data
            return None
        except Exception as e:
            logger.error(f"Error finding category by id {id}: {e}")
            return None

    def save(self, entity: Dict[str, Any]) -> Dict[str, Any]:
        try:
            # Create a copy to avoid modifying the original dictionary if needed
            data_to_save = entity.copy()
            doc_id = data_to_save.pop('id', None)
            
            if doc_id:
                doc_ref = self.db.collection('categories').document(doc_id)
                doc_ref.set(data_to_save, merge=True)
                entity['id'] = doc_id
            else:
                update_time, doc_ref = self.db.collection('categories').add(data_to_save)
                entity['id'] = doc_ref.id
            
            return entity
        except Exception as e:
            logger.error(f"Error saving category: {e}")
            raise

    def get_all_categories(self) -> List[Dict[str, Any]]:
        categories = []
        try:
            docs = self.db.collection('categories').stream()
            for doc in docs:
                data = doc.to_dict()
                data['id'] = doc.id
                categories.append(data)
        except Exception as e:
            logger.error(f"Error fetching categories: {e}")
            raise
        return categories

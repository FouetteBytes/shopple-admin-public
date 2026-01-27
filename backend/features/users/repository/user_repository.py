from typing import Optional, Any
from google.cloud import firestore
from common.base.base_repository import BaseRepository
from backend.features.users.domain.user_entity import User
from services.firebase.firebase_service import firebase_service
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class UserRepository(BaseRepository[User]):
    def __init__(self):
        self.db = firebase_service.get_client()
        if self.db:
            self.collection = self.db.collection('users')
        else:
            self.collection = None # Handle missing DB gracefully

    def find_by_id(self, id: str) -> Optional[User]:
        # Implementation for full entity loading if needed in future
        # Currently we prioritize existing behavior (no read before write for bans)
        if not self.collection:
            return None
            
        doc = self.collection.document(id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        return User(id=id, **data) # Simplified mapping

    def save(self, entity: User) -> User:
        # Full save
        if self.collection:
            logger.debug(f"Saving user entity: {entity.id}")
            self.collection.document(entity.id).set(entity.__dict__, merge=True)
        return entity

    def update_fields(self, uid: str, data: dict[str, Any]) -> None:
        """
        Perform a partial update on a user document.
        Preserves existing behavior of direct Firestore updates.
        """
        if self.collection:
            logger.debug(f"Updating fields for user {uid}: {list(data.keys())}")
            self.collection.document(uid).update(data)

"""
Note Repository.
"""
from typing import Optional, List, Dict, Any, Tuple
from google.cloud import firestore
from common.base.base_repository import BaseRepository
from backend.features.notes.domain.note_entity import Note
from backend.features.notes.mapper.note_mapper import from_firestore_dict, to_dict_from_entity
from services.firebase.firebase_client import initialize_firebase
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class NoteRepository(BaseRepository[Note]):
    def _db(self):
        return initialize_firebase()

    def find_by_id(self, id: str) -> Optional[Note]:
        """
        Global find by ID is not supported natively due to subcollection structure.
        Use find_by_user_and_id instead.
        """
        return None

    def save(self, entity: Note) -> Note:
        """
        Save or update a note.
        """
        data = to_dict_from_entity(entity)
        
        # Firestore client handles datetime serialization; preserve entity timestamps.
        
        doc_ref = self._db().collection('users').document(entity.user_id).collection('notes').document(entity.id)
        doc_ref.set(data, merge=True)
        return entity

    def find_by_user_and_id(self, user_id: str, note_id: str) -> Optional[Note]:
        doc = self._db().collection('users').document(user_id).collection('notes').document(note_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        data['id'] = doc.id
        return from_firestore_dict(data, user_id)

    def find_all_by_user(self, user_id: str) -> List[Note]:
        try:
            docs = self._db().collection('users').document(user_id).collection('notes').stream()
            notes = []
            for doc in docs:
                data = doc.to_dict()
                data['id'] = doc.id
                notes.append(from_firestore_dict(data, user_id))
            return notes
        except Exception as e:
            logger.error(f"Error finding notes for user {user_id}: {str(e)}")
            return []

    def delete_by_user_and_id(self, user_id: str, note_id: str) -> bool:
        try:
            doc_ref = self._db().collection('users').document(user_id).collection('notes').document(note_id)
            doc_ref.delete()
            return True
        except Exception as e:
            logger.error(f"Error deleting note {note_id}: {str(e)}")
            return False

    def get_stats(self, user_id: str) -> Dict[str, Any]:
        # Use find_all_by_user to compute note statistics.
        notes = self.find_all_by_user(user_id)
        total_notes = len(notes)
        completed_notes = len([n for n in notes if n.completed])
        
        categories = {}
        priorities = {}
        
        for note in notes:
            cat = note.category or 'personal'
            prio = note.priority or 'medium'
            categories[cat] = categories.get(cat, 0) + 1
            priorities[prio] = priorities.get(prio, 0) + 1
            
        return {
            'total': total_notes,
            'completed': completed_notes,
            'pending': total_notes - completed_notes,
            'categories': categories,
            'priorities': priorities,
            'completion_rate': round((completed_notes / total_notes * 100) if total_notes > 0 else 0, 1)
        }

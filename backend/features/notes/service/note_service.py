"""
Note Service.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
from google.cloud import firestore
from common.base.base_service import BaseService
from backend.features.notes.repository.note_repository import NoteRepository
from backend.features.notes.domain.note_entity import Note
from backend.features.notes.dto.note_request import CreateNoteRequest, UpdateNoteRequest
from backend.features.notes.dto.note_response import NoteResponse
from backend.features.notes.mapper.note_mapper import to_note_response
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class NoteService(BaseService):
    def __init__(self, note_repository: NoteRepository):
        super().__init__()
        self.note_repository = note_repository

    def get_notes(self, user_id: str) -> List[Dict[str, Any]]:
        # Return dictionaries to preserve the legacy API response shape.
        # Controllers serialize lists of note dictionaries.
        
        notes = self.note_repository.find_all_by_user(user_id)
        # Map entities to response dictionaries.
        return [to_note_response(n).to_dict() for n in notes]

    def create_note(self, user_id: str, request: CreateNoteRequest) -> Dict[str, Any]:
        # Logic from legacy create_note.
        # Generate an ID when not provided.
        note_id = request.id or str(int(datetime.now().timestamp() * 1000))
        
        if not request.title:
            raise ValueError("Note title is required")
            
        note = Note(
            id=note_id,
            user_id=user_id,
            title=request.title,
            content=request.content,
            completed=request.completed,
            category=request.category,
            priority=request.priority,
            created_at=request.createdAt or firestore.SERVER_TIMESTAMP,
            updated_at=firestore.SERVER_TIMESTAMP,
            due_date=request.dueDate
        )
        
        saved_note = self.note_repository.save(note)
        
        
        return to_note_response(saved_note).to_dict()

    def update_note(self, user_id: str, note_id: str, request: UpdateNoteRequest) -> bool:
        # Existing note check.
        current_note = self.note_repository.find_by_user_and_id(user_id, note_id)
        
        
        if not current_note:
            
            raise ValueError("Note not found") 

        # Apply updates.
        if request.title is not None: current_note.title = request.title
        if request.content is not None: current_note.content = request.content
        if request.completed is not None: current_note.completed = request.completed
        if request.category is not None: current_note.category = request.category
        if request.priority is not None: current_note.priority = request.priority
        if request.dueDate is not None: current_note.due_date = request.dueDate
        
        current_note.updated_at = firestore.SERVER_TIMESTAMP
        
        self.note_repository.save(current_note)
        return True

    def delete_note(self, user_id: str, note_id: str) -> bool:
        return self.note_repository.delete_by_user_and_id(user_id, note_id)

    def get_stats(self, user_id: str) -> Dict[str, Any]:
        return self.note_repository.get_stats(user_id)

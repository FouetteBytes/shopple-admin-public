"""
Note Mapper.
"""
from typing import Dict, Any
from backend.features.notes.domain.note_entity import Note
from backend.features.notes.dto.note_response import NoteResponse
from backend.features.notes.dto.note_request import CreateNoteRequest
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def to_note_response(note: Note) -> NoteResponse:
    return NoteResponse(
        id=note.id,
        title=note.title,
        content=note.content,
        completed=note.completed,
        category=note.category,
        priority=note.priority,
        createdAt=note.created_at,
        updatedAt=note.updated_at,
        dueDate=note.due_date
    )

def to_dict_from_entity(note: Note) -> Dict[str, Any]:
    # Maps domain entity back to Firestore structure (camelCase usually in this app based on routes)
    return {
        'id': note.id,
        'title': note.title,
        'content': note.content,
        'completed': note.completed,
        'category': note.category,
        'priority': note.priority,
        'createdAt': note.created_at,
        'updatedAt': note.updated_at,
        'dueDate': note.due_date
    }

def from_firestore_dict(data: Dict[str, Any], user_id: str) -> Note:
    return Note(
        id=data.get('id', ''),
        user_id=user_id,
        title=data.get('title', ''),
        content=data.get('content', ''),
        completed=data.get('completed', False),
        category=data.get('category', 'personal'),
        priority=data.get('priority', 'medium'),
        created_at=data.get('createdAt'),
        updated_at=data.get('updatedAt'),
        due_date=data.get('dueDate')
    )

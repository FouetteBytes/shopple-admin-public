"""
Notes Feature Module.
"""
from flask import Blueprint
from backend.features.notes.controller.note_controller import NoteController
from backend.features.notes.service.note_service import NoteService
from backend.features.notes.repository.note_repository import NoteRepository

# Dependency Injection
note_repository = NoteRepository()
note_service = NoteService(note_repository=note_repository)
note_controller = NoteController(note_service=note_service)

# Blueprint
notes_bp = Blueprint('notes', __name__)

# Routes
notes_bp.add_url_rule(
    '/api/notes/<user_id>',
    view_func=note_controller.get_notes,
    methods=['GET']
)

notes_bp.add_url_rule(
    '/api/notes/<user_id>',
    view_func=note_controller.create_note,
    methods=['POST']
)

notes_bp.add_url_rule(
    '/api/notes/<user_id>/<note_id>',
    view_func=note_controller.update_note,
    methods=['PUT']
)

notes_bp.add_url_rule(
    '/api/notes/<user_id>/<note_id>',
    view_func=note_controller.delete_note,
    methods=['DELETE']
)

notes_bp.add_url_rule(
    '/api/notes/<user_id>/stats',
    view_func=note_controller.get_notes_stats,
    methods=['GET']
)

notes_bp.add_url_rule(
    '/api/notes/firebase/status',
    view_func=note_controller.get_firebase_status,
    methods=['GET']
)

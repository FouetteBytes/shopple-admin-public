"""
Note Controller.
"""
from flask import request, jsonify
from common.base.base_controller import BaseController
from backend.features.notes.service.note_service import NoteService
from backend.features.notes.dto.note_request import CreateNoteRequest, UpdateNoteRequest
from services.system.logger_service import get_logger
from services.firebase.firebase_client import initialize_firebase

logger = get_logger(__name__)

class NoteController(BaseController):
    def __init__(self, note_service: NoteService):
        self.note_service = note_service

    def get_notes(self, user_id: str):
        try:
            notes = self.note_service.get_notes(user_id)
            logger.info("Notes retrieved", extra={"user_id": user_id, "count": len(notes)})
            
            return jsonify({
                'success': True,
                'notes': notes,
                'count': len(notes),
                'source': 'firebase'
            })
        except Exception as e:
            logger.error("Failed to retrieve notes", extra={"user_id": user_id, "error": str(e)})
            return jsonify({
                'success': False,
                'error': str(e),
                'source': 'firebase'
            }), 500

    def create_note(self, user_id: str):
        try:
            note_data = request.get_json()
            logger.debug("Note creation requested", extra={"user_id": user_id})
            
            if not note_data or not note_data.get('title'):
                return jsonify({
                    'success': False,
                    'error': 'Note title is required'
                }), 400
            
            # Map JSON to DTO
            req_dto = CreateNoteRequest(
                title=note_data['title'],
                id=note_data.get('id'),
                content=note_data.get('content', ''),
                completed=note_data.get('completed', False),
                category=note_data.get('category', 'personal'),
                priority=note_data.get('priority', 'medium'),
                dueDate=note_data.get('dueDate'),
                createdAt=note_data.get('createdAt')
            )
            
            new_note = self.note_service.create_note(user_id, req_dto)
            
            return jsonify({
                'success': True,
                'note': new_note,
                'source': 'firebase'
            })
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'source': 'firebase'
            }), 500

    def update_note(self, user_id: str, note_id: str):
        try:
            update_data = request.get_json()
            if not update_data:
                return jsonify({
                    'success': False,
                    'error': 'Update data is required'
                }), 400
            
            # Map JSON to DTO
            req_dto = UpdateNoteRequest(
                title=update_data.get('title'),
                content=update_data.get('content'),
                completed=update_data.get('completed'),
                category=update_data.get('category'),
                priority=update_data.get('priority'),
                dueDate=update_data.get('dueDate')
            )
            
            success = self.note_service.update_note(user_id, note_id, req_dto)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': 'Note updated successfully',
                    'source': 'firebase'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Failed to update note in Firebase',
                    'source': 'firebase'
                }), 500
                
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'source': 'firebase'
            }), 500

    def delete_note(self, user_id: str, note_id: str):
        try:
            success = self.note_service.delete_note(user_id, note_id)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': 'Note deleted successfully',
                    'source': 'firebase'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Note not found or failed to delete',
                    'source': 'firebase'
                }), 404
                
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'source': 'firebase'
            }), 500

    def get_notes_stats(self, user_id: str):
        try:
            stats = self.note_service.get_stats(user_id)
            return jsonify({
                'success': True,
                'stats': stats,
                'source': 'firebase'
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e),
                'source': 'firebase'
            }), 500

    def get_firebase_status(self):
        try:
            # Check connection
            db = initialize_firebase()
            is_connected = db is not None
            
            return jsonify({
                'success': True,
                'connected': is_connected,
                'service': 'Firebase Firestore',
                'project_id': 'shopple-7a67b' if is_connected else None
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'connected': False,
                'error': str(e)
            }), 500

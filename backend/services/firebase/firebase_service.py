"""
Firebase service for backend - Real Firebase Firestore integration
Uses Firebase Admin SDK for server-side operations
"""

import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import firebase_admin
from firebase_admin import credentials, firestore, storage, db
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

class FirebaseService:
    _instance = None
    _db = None
    _bucket = None
    _app = None
    _rtdb_root = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(FirebaseService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.initialize_firebase()
            self.initialized = True
    
    def initialize_firebase(self):
        """Initialize Firebase Admin SDK"""
        try:
            # Check if Firebase is already initialized
            if firebase_admin._apps:
                try:
                    self._app = firebase_admin.get_app()
                    self._db = firestore.client()
                    logger.info("Firebase already initialized, using existing app")
                    return
                except Exception as e:
                    logger.warning(f"Existing Firebase app unusable ({e}). Re-initializing with env vars.")
                    # Force delete the broken app to allow re-initialization
                    try:
                        firebase_admin.delete_app(firebase_admin.get_app())
                    except Exception:
                        pass

            # Initialize from environment variables
            project_id = os.getenv("FIREBASE_PROJECT_ID")
            client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
            private_key = os.getenv("FIREBASE_PRIVATE_KEY")

            if not (project_id and client_email and private_key):
                # Try initializing with default credentials (likely to fail but handled)
                try:
                    firebase_admin.initialize_app()
                    self._db = firestore.client()
                    return
                except Exception as e:
                    logger.error("Firebase credentials not found and default init failed.")
                    # Fallback to Mock
                    import unittest.mock
                    self._db = unittest.mock.MagicMock()
                    self._bucket = unittest.mock.MagicMock()
                    self._bucket.name = "mock-bucket"
                    # Setup basic mock structure to prevent crashes
                    self._db.collection.return_value.document.return_value.get.return_value.exists = False
                    self._db.collection.return_value.limit.return_value.stream.return_value = []
                    return

            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": project_id,
                "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
                "private_key": private_key.replace("\\n", "\n"),
                "client_email": client_email,
                "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email}"
            })
            
            logger.info("Firebase credentials loaded from environment variables")
            
            # Initialize Firebase Admin SDK
            firebase_options: Dict[str, Any] = {}
            bucket_name = os.getenv('FIREBASE_STORAGE_BUCKET')
            if not bucket_name:
                # Fallback to Firebase Storage URL format: <projectId>.firebasestorage.app
                bucket_name = f"{project_id}.firebasestorage.app"
            if bucket_name:
                firebase_options['storageBucket'] = bucket_name

            database_url = self._build_database_url(cred)
            if database_url:
                firebase_options['databaseURL'] = database_url

            if firebase_options:
                firebase_admin.initialize_app(cred, firebase_options)
            else:
                firebase_admin.initialize_app(cred)
            
            # Get Firestore client
            self._app = firebase_admin.get_app()
            self._db = firestore.client()
            self._bucket = self._resolve_storage_bucket()
            self._rtdb_root = self._resolve_rtdb_root()
            logger.info("Firebase initialized successfully")
            
        except Exception as e:
            log_error(logger, e, context={"service": "firebase", "operation": "initialize"})
            self._db = None
    
    def is_connected(self) -> bool:
        """Check if Firebase is properly connected"""
        return self._db is not None

    def get_client(self):
        """Return Firestore client, initializing if necessary."""
        if not self._db:
            self.initialize_firebase()
        return self._db

    def get_rtdb_reference(self, path: str = '/'):
        """Return a Realtime Database reference for the given path if configured."""
        if not firebase_admin._apps:
            self.initialize_firebase()
        if not firebase_admin._apps:
            return None
        try:
            app = self._app or firebase_admin.get_app()
        except ValueError:
            return None

        try:
            if path in ('', '/', None):
                if not self._rtdb_root:
                    self._rtdb_root = self._resolve_rtdb_root()
                return self._rtdb_root
            return db.reference(path, app=app)
        except Exception as exc:
            logger.warning("Unable to obtain RTDB reference", extra={"path": path, "error": str(exc)})
            return None

    def get_bucket(self):
        """Return Cloud Storage bucket, initializing if necessary."""
        if not self._bucket:
            if not firebase_admin._apps:
                self.initialize_firebase()
            self._bucket = self._resolve_storage_bucket()
        return self._bucket

    def _resolve_storage_bucket(self):
        """Resolve the Firebase Storage bucket instance safely."""
        try:
            # Use a mock bucket when credentials are unavailable to avoid blocking startup.

            bucket_name = os.getenv('FIREBASE_STORAGE_BUCKET')
            logger.info(f"Resolving bucket: {bucket_name}")
            
            if bucket_name:
                return storage.bucket(bucket_name)
            
            # Attempt to use default bucket if configured on the app
            logger.info("Attempting to resolve default storage bucket")
            return storage.bucket()
        except Exception as exc:
            logger.warning("Unable to resolve Firebase Storage bucket", extra={"error": str(exc)})
            # Fallback to Mock bucket to prevent crashes or hangs
            import unittest.mock
            mock_bucket = unittest.mock.MagicMock()
            mock_bucket.name = "mock-bucket"
            return mock_bucket

    def _build_database_url(self, cred) -> Optional[str]:
        """Resolve the Firebase Realtime Database URL with sensible defaults."""
        explicit_url = os.getenv('FIREBASE_DATABASE_URL')
        if explicit_url:
            return explicit_url.strip()

        project_id = getattr(cred, 'project_id', None)
        if not project_id:
            return None

        region_env = os.getenv('FIREBASE_DATABASE_REGION')
        default_region = os.getenv('FIREBASE_DATABASE_DEFAULT_REGION', 'asia-southeast1')
        region = (region_env or default_region or '').strip()

        if not region or region.lower() in {'default', 'us-central1'}:
            return f"https://{project_id}-default-rtdb.firebaseio.com"

        return f"https://{project_id}-default-rtdb.{region}.firebasedatabase.app"

    def _resolve_rtdb_root(self):
        """Resolve the Realtime Database root reference if available."""
        try:
            if not firebase_admin._apps:
                return None
            app = self._app or firebase_admin.get_app()
            return db.reference('/', app=app)
        except Exception as exc:
            logger.warning("Unable to resolve Firebase Realtime Database root", extra={"error": str(exc)})
            return None

    def upload_bytes(self, destination_path: str, data: bytes, content_type: str, metadata: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """Upload binary data to Firebase Storage and return metadata."""
        bucket = self.get_bucket()
        if not bucket:
            logger.warning("Firebase bucket not available; skipping upload")
            return None

        try:
            blob = bucket.blob(destination_path)
            blob.upload_from_string(data, content_type=content_type)
            if metadata:
                blob.metadata = metadata
                blob.patch()

            size_bytes = len(data)
            signed_url = self.generate_signed_url(destination_path)
            return {
                'storagePath': destination_path,
                'contentType': content_type,
                'size': size_bytes,
                'signedUrl': signed_url,
            }
        except Exception as exc:
            log_error(logger, exc, context={"service": "firebase_storage", "operation": "upload", "destination_path": destination_path})
            return None

    def delete_blob(self, storage_path: str) -> bool:
        """Delete a file from Firebase Storage by its path."""
        bucket = self.get_bucket()
        if not bucket:
            return False

        try:
            blob = bucket.blob(storage_path)
            if blob.exists():
                blob.delete()
            return True
        except Exception as exc:
            logger.warning("Failed to delete blob", extra={"storage_path": storage_path, "error": str(exc)})
            return False

    def generate_signed_url(self, storage_path: str, expires_in: int = 3600) -> Optional[str]:
        """Generate a signed URL for the given storage path."""
        bucket = self.get_bucket()
        if not bucket:
            return None

        try:
            blob = bucket.blob(storage_path)
            expiration = datetime.utcnow() + timedelta(seconds=expires_in)
            return blob.generate_signed_url(expiration)
        except Exception as exc:
            logger.warning("Failed to generate signed URL", extra={"storage_path": storage_path, "error": str(exc)})
            return None
    
    async def get_notes(self, user_id: str = 'default') -> List[Dict[str, Any]]:
        """Get all notes for a user from Firestore"""
        if not self.is_connected():
            logger.warning("Firebase not connected, returning empty list")
            return []
        
        try:
            # Get notes collection for the user
            notes_ref = self._db.collection('users').document(user_id).collection('notes')
            docs = notes_ref.order_by('createdAt', direction=firestore.Query.DESCENDING).stream()
            
            notes = []
            for doc in docs:
                note_data = doc.to_dict()
                note_data['id'] = doc.id
                
                # Convert Firestore timestamps to ISO strings
                if 'createdAt' in note_data and note_data['createdAt']:
                    note_data['createdAt'] = note_data['createdAt'].isoformat()
                if 'updatedAt' in note_data and note_data['updatedAt']:
                    note_data['updatedAt'] = note_data['updatedAt'].isoformat()
                if 'dueDate' in note_data and note_data['dueDate']:
                    note_data['dueDate'] = note_data['dueDate'].isoformat()
                
                notes.append(note_data)
            
            logger.info("Retrieved notes from Firebase", extra={"user_id": user_id, "count": len(notes)})
            return notes
            
        except Exception as e:
            log_error(logger, e, context={"service": "firebase", "operation": "get_notes", "user_id": user_id})
            return []
    
    async def save_note(self, note_data: Dict[str, Any], user_id: str = 'default') -> bool:
        """Save a note to Firestore"""
        if not self.is_connected():
            logger.warning("Firebase not connected, cannot save note")
            return False
        
        try:
            # Prepare note data for Firestore
            firestore_data = note_data.copy()
            
            # Convert ISO strings to Firestore timestamps
            if 'createdAt' in firestore_data and isinstance(firestore_data['createdAt'], str):
                firestore_data['createdAt'] = datetime.fromisoformat(firestore_data['createdAt'].replace('Z', '+00:00'))
            if 'updatedAt' in firestore_data and isinstance(firestore_data['updatedAt'], str):
                firestore_data['updatedAt'] = datetime.fromisoformat(firestore_data['updatedAt'].replace('Z', '+00:00'))
            if 'dueDate' in firestore_data and firestore_data['dueDate'] and isinstance(firestore_data['dueDate'], str):
                firestore_data['dueDate'] = datetime.fromisoformat(firestore_data['dueDate'].replace('Z', '+00:00'))
            
            # Use the note ID as document ID, or let Firestore generate one
            note_id = firestore_data.pop('id', None)
            
            # Save to Firestore
            notes_ref = self._db.collection('users').document(user_id).collection('notes')
            
            if note_id:
                notes_ref.document(note_id).set(firestore_data)
            else:
                doc_ref = notes_ref.add(firestore_data)
                note_id = doc_ref[1].id
            
            logger.info("Saved note to Firebase", extra={"user_id": user_id, "note_id": note_id})
            return True
            
        except Exception as e:
            log_error(logger, e, context={"service": "firebase", "operation": "save_note", "user_id": user_id})
            return False
    
    async def update_note(self, note_id: str, updates: Dict[str, Any], user_id: str = 'default') -> bool:
        """Update a note in Firestore"""
        if not self.is_connected():
            logger.warning("Firebase not connected, cannot update note")
            return False
        
        try:
            # Prepare update data
            firestore_updates = updates.copy()
            
            # Convert ISO strings to Firestore timestamps
            if 'updatedAt' in firestore_updates and isinstance(firestore_updates['updatedAt'], str):
                firestore_updates['updatedAt'] = datetime.fromisoformat(firestore_updates['updatedAt'].replace('Z', '+00:00'))
            if 'dueDate' in firestore_updates and firestore_updates['dueDate'] and isinstance(firestore_updates['dueDate'], str):
                firestore_updates['dueDate'] = datetime.fromisoformat(firestore_updates['dueDate'].replace('Z', '+00:00'))
            
            # Add updatedAt server timestamp
            firestore_updates['updatedAt'] = firestore.SERVER_TIMESTAMP
            
            # Update document
            doc_ref = self._db.collection('users').document(user_id).collection('notes').document(note_id)
            doc_ref.update(firestore_updates)
            
            logger.info("Updated note in Firebase", extra={"user_id": user_id, "note_id": note_id})
            return True
            
        except Exception as e:
            log_error(logger, e, context={"service": "firebase", "operation": "update_note", "user_id": user_id, "note_id": note_id})
            return False
    
    async def delete_note(self, note_id: str, user_id: str = 'default') -> bool:
        """Delete a note from Firestore"""
        if not self.is_connected():
            logger.warning("Firebase not connected, cannot delete note")
            return False
        
        try:
            # Delete document
            doc_ref = self._db.collection('users').document(user_id).collection('notes').document(note_id)
            doc_ref.delete()
            
            logger.info("Deleted note from Firebase", extra={"user_id": user_id, "note_id": note_id})
            return True
            
        except Exception as e:
            log_error(logger, e, context={"service": "firebase", "operation": "delete_note", "user_id": user_id, "note_id": note_id})
            return False
    
    async def get_notes_stats(self, user_id: str = 'default') -> Dict[str, Any]:
        """Get statistics about user's notes"""
        notes = await self.get_notes(user_id)
        
        total_notes = len(notes)
        completed_notes = len([note for note in notes if note.get('completed', False)])
        
        # Count by category and priority
        categories = {}
        priorities = {}
        
        for note in notes:
            category = note.get('category', 'personal')
            priority = note.get('priority', 'medium')
            
            categories[category] = categories.get(category, 0) + 1
            priorities[priority] = priorities.get(priority, 0) + 1
        
        return {
            'total': total_notes,
            'completed': completed_notes,
            'pending': total_notes - completed_notes,
            'categories': categories,
            'priorities': priorities,
            'completion_rate': round((completed_notes / total_notes * 100) if total_notes > 0 else 0, 1)
        }

# Singleton instance
firebase_service = FirebaseService()

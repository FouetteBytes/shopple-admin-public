"""Shared Firebase initialization helper."""
from __future__ import annotations

import os
import threading
from functools import lru_cache
from typing import Any

import firebase_admin
from firebase_admin import credentials, firestore
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Thread-safe initialization lock
_firebase_init_lock = threading.Lock()
_firebase_initialized = False


@lru_cache(maxsize=1)
def initialize_firebase() -> Any:
    """Initialize Firebase Admin SDK and return Firestore client.
    
    Thread-safe implementation for multi-worker environments (Gunicorn).
    """
    global _firebase_initialized
    
    # Thread-safe double-checked locking pattern
    if _firebase_initialized:
        try:
            return firestore.client()
        except Exception:
            pass
    
    with _firebase_init_lock:
        # Double-check after acquiring lock
        if _firebase_initialized:
            try:
                return firestore.client()
            except Exception:
                pass
        
        # Check if app is already initialized (safe check)
        try:
            if firebase_admin._apps:
                logger.debug("Firebase already initialized, returning existing client")
                _firebase_initialized = True
                return firestore.client()
        except Exception:
            pass

        try:
            # Try environment variables first
            project_id = os.getenv("FIREBASE_PROJECT_ID")
            client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
            private_key = os.getenv("FIREBASE_PRIVATE_KEY")

            if project_id and client_email and private_key:
                logger.info("Initializing Firebase with environment variables")
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
                firebase_admin.initialize_app(cred)
                _firebase_initialized = True
            else:
                # Try default credentials (ADC)
                try:
                    firebase_admin.initialize_app()
                    _firebase_initialized = True
                except Exception:
                    # If ADC fails, we must rely on Mock to allow app to start
                    logger.warning("Firebase credentials not configured, using mock client")
                    import unittest.mock
                    mock_db = unittest.mock.MagicMock()
                    mock_db.collection.return_value.document.return_value.get.return_value.exists = False
                    return mock_db

            return firestore.client()
        except Exception as e:
            # Fallback for any initialization error
            logger.warning(f"Firebase initialization failed: {e}, using mock client")
            import unittest.mock
            mock_db = unittest.mock.MagicMock()
            mock_db.collection.return_value.document.return_value.get.return_value.exists = False
            return mock_db

"""Classification history service backed by Firebase Firestore."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from firebase_admin import firestore
from services.firebase.firebase_client import initialize_firebase
from services.system import cache_keys
from services.system.cache_service import get_cache_service
from services.system.logger_service import get_logger

logger = get_logger(__name__)


@dataclass
class ClassificationEvent:
    """Represents a classification event entry."""

    id: str
    event_type: str
    timestamp: datetime
    summary: str
    details: Dict[str, Any]
    duration_seconds: Optional[float] = None
    total_products: Optional[int] = None
    successful: Optional[int] = None
    failed: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_firestore(self) -> Dict[str, Any]:
        data = asdict(self)
        data['timestamp'] = self.timestamp
        return data


class ClassificationHistoryService:
    """Firestore-backed history store for classification runs and actions."""

    def __init__(self, collection_name: str = 'classification_history') -> None:
        self.db = None
        self.collection = None
        self.cache = get_cache_service()
        self._collection_name = collection_name
        
        try:
            # Use the shared Firebase initialization that handles credentials properly
            self.db = initialize_firebase()
            if self.db:
                self.collection = self.db.collection(collection_name)
                logger.info(f"Firestore collection '{collection_name}' initialized successfully")
        except Exception as e:
            logger.warning(f"Failed to initialize Firestore for ClassificationHistory: {e}")

    @staticmethod
    def _now() -> datetime:
        return datetime.utcnow()

    def record_event(self, event_type: str, summary: str, details: Dict[str, Any]) -> Dict[str, Any]:
        if not self.collection:
            return {}

        event_id = details.get('id') or uuid.uuid4().hex
        timestamp = details.get('timestamp')
        if isinstance(timestamp, str):
            try:
                timestamp = datetime.fromisoformat(timestamp)
            except ValueError:
                timestamp = self._now()
        elif not isinstance(timestamp, datetime):
            timestamp = self._now()

        # Ensure numeric fields are integers
        total_products = details.get('total_products')
        if total_products is not None:
            try:
                total_products = int(total_products)
            except (ValueError, TypeError):
                total_products = None

        successful = details.get('successful')
        if successful is not None:
            try:
                successful = int(successful)
            except (ValueError, TypeError):
                successful = None

        failed = details.get('failed')
        if failed is not None:
            try:
                failed = int(failed)
            except (ValueError, TypeError):
                failed = None

        event = ClassificationEvent(
            id=event_id,
            event_type=event_type,
            timestamp=timestamp,
            summary=summary,
            details=details,
            duration_seconds=details.get('duration_seconds'),
            total_products=total_products,
            successful=successful,
            failed=failed,
            metadata=details.get('metadata') or {},
        )

        self.collection.document(event.id).set(event.to_firestore())
        
        # Invalidate cache
        if self.cache and self.cache.is_available():
            self.cache.invalidate_prefix("classification:history")
            
        logger.info("Classification event recorded", extra={
            "event_id": event.id,
            "event_type": event_type,
            "total_products": details.get('total_products')
        })
        return {'success': True, 'id': event.id}

    def list_events(self, limit: int = 100) -> Dict[str, Any]:
        limit = max(1, min(limit, 500))
        
        # Check if Firestore is available
        if not self.collection:
            logger.warning("Firestore collection not initialized, returning empty history")
            return {'success': True, 'events': []}
        
        # Try cache first
        cache_key = cache_keys.classification_history_key(limit)
        if self.cache and self.cache.is_available():
            cached = self.cache.get_json(cache_key)
            if cached:
                logger.info(f"Cache HIT for classification history (limit={limit})")
                return cached

        try:
            docs = (
                self.collection
                .order_by('timestamp', direction=firestore.Query.DESCENDING)
                .limit(limit)
                .stream()
            )
            events: List[Dict[str, Any]] = []
            for doc in docs:
                item = doc.to_dict()
                item['id'] = doc.id
                ts = item.get('timestamp')
                if isinstance(ts, datetime):
                    item['timestamp'] = ts.isoformat()
                events.append(item)
            
            result = {'success': True, 'events': events}
            
            # Set cache
            if self.cache and self.cache.is_available():
                self.cache.set_json(cache_key, result, ttl_seconds=300)
                
            return result
        except Exception as exc:  # noqa: BLE001
            return {'success': False, 'error': str(exc)}

    def delete_event(self, event_id: str) -> Dict[str, Any]:
        if not event_id:
            return {'success': False, 'error': 'event_id is required'}
        try:
            self.collection.document(event_id).delete()
            
            # Invalidate cache
            if self.cache and self.cache.is_available():
                self.cache.invalidate_prefix("classification:history")
                
            return {'success': True}
        except Exception as exc:  # noqa: BLE001
            return {'success': False, 'error': str(exc)}

    def update_event(self, event_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not event_id:
            return {'success': False, 'error': 'event_id is required'}
        try:
            doc_ref = self.collection.document(event_id)
            doc_ref.update(updates)
            snapshot = doc_ref.get()
            data = snapshot.to_dict() if snapshot.exists else {}
            if isinstance(data.get('timestamp'), datetime):
                data['timestamp'] = data['timestamp'].isoformat()
                
            # Invalidate cache
            if self.cache and self.cache.is_available():
                self.cache.invalidate_prefix("classification:history")
                
            return {'success': True, 'data': data}
        except Exception as exc:  # noqa: BLE001
            return {'success': False, 'error': str(exc)}


_history_service: Optional[ClassificationHistoryService] = None


def initialize_history_service() -> None:
    global _history_service
    try:
        _history_service = ClassificationHistoryService()
        logger.info("Classification History service initialized")
    except Exception as exc:  # noqa: BLE001
        _history_service = None
        logger.warning("Classification History service unavailable", extra={"error": str(exc)})

def get_history_service() -> Optional[ClassificationHistoryService]:
    return _history_service

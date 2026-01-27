"""Storage helpers for crawler scheduler persistence."""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Protocol

from services.firebase.firebase_service import firebase_service
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

ScheduleMap = Dict[str, Dict[str, Any]]


class ScheduleStorage(Protocol):
    """Protocol for schedule persistence providers."""

    def load(self) -> Optional[ScheduleMap]:
        """Return all schedules or ``None`` if the backend is unavailable."""

    def save_all(self, schedules: ScheduleMap, deleted_ids: Optional[list[str]] = None) -> bool:
        """Persist the provided schedules. ``deleted_ids`` is optional for cleanup."""


class LocalJSONScheduleStorage:
    """Persist schedules on disk as JSON."""

    def __init__(self, storage_path: str) -> None:
        self.storage_path = storage_path
        os.makedirs(os.path.dirname(storage_path), exist_ok=True)

    def load(self) -> Optional[ScheduleMap]:
        try:
            if os.path.exists(self.storage_path):
                with open(self.storage_path, "r", encoding="utf-8") as handle:
                    data = json.load(handle)
                    if isinstance(data, dict):
                        return data
            return {}
        except Exception as exc:  # noqa: BLE001
            log_error(logger, exc, context={"operation": "load_schedules", "storage": "local"})
            return None

    def save_all(self, schedules: ScheduleMap, deleted_ids: Optional[list[str]] = None) -> bool:
        try:
            with open(self.storage_path, "w", encoding="utf-8") as handle:
                json.dump(schedules, handle, indent=2, ensure_ascii=False)
            return True
        except Exception as exc:  # noqa: BLE001
            log_error(logger, exc, context={"operation": "save_schedules", "storage": "local"})
            return False


class FirebaseScheduleStorage:
    """Persist schedules to Firebase Firestore if available."""

    def __init__(self, collection_name: str = "crawler_schedules") -> None:
        self.collection_name = collection_name

    def _get_client(self):
        if not firebase_service:
            return None
        return firebase_service.get_client()

    def is_available(self) -> bool:
        try:
            return bool(self._get_client())
        except Exception:  # pragma: no cover - defensive
            return False

    def load(self) -> Optional[ScheduleMap]:
        client = self._get_client()
        if not client:
            return None
        try:
            collection = client.collection(self.collection_name)
            data: ScheduleMap = {}
            for doc in collection.stream():
                doc_data = doc.to_dict() or {}
                if "id" not in doc_data:
                    doc_data["id"] = doc.id
                data[doc.id] = doc_data
            return data
        except Exception as exc:
            logger.warning("Failed to load schedules", extra={"error": str(exc)})
            return {}

    def save_all(self, schedules: ScheduleMap, deleted_ids: Optional[list[str]] = None) -> bool:
        client = self._get_client()
        if not client:
            return False
        try:
            collection = client.collection(self.collection_name)
            batch = client.batch()
            operations = 0
            commit_threshold = 450  # stay below Firestore batch limit of 500

            def commit_batch() -> None:
                nonlocal batch, operations
                if operations == 0:
                    return
                batch.commit()
                batch = client.batch()
                operations = 0

            for schedule_id, schedule in schedules.items():
                doc_ref = collection.document(schedule_id)
                batch.set(doc_ref, schedule)
                operations += 1
                if operations >= commit_threshold:
                    commit_batch()

            if deleted_ids:
                for schedule_id in deleted_ids:
                    doc_ref = collection.document(schedule_id)
                    batch.delete(doc_ref)
                    operations += 1
                    if operations >= commit_threshold:
                        commit_batch()

            commit_batch()
            return True
        except Exception as exc:
            logger.warning("Failed to persist schedules", extra={"error": str(exc)})
            return False

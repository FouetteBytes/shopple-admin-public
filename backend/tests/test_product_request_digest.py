"""Unit tests for product-request digest helpers."""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

# Mock Google Cloud dependencies.
sys.modules['google'] = MagicMock()
sys.modules['google.cloud'] = MagicMock()
sys.modules['google.cloud.firestore_v1'] = MagicMock()
sys.modules['firebase_admin'] = MagicMock()
sys.modules['firebase_admin.firestore'] = MagicMock()
sys.modules['PIL'] = MagicMock()
sys.modules['PIL.Image'] = MagicMock()
sys.modules['werkzeug'] = MagicMock()
sys.modules['werkzeug.utils'] = MagicMock()

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.products.product_request_service import ProductRequestService


class FakeSnapshot:
    def __init__(self, doc_id: str, data: dict) -> None:
        self.id = doc_id
        self._data = data

    def to_dict(self) -> dict:
        return dict(self._data)


def _make_service() -> ProductRequestService:
    service = ProductRequestService.__new__(ProductRequestService)
    service.db = None  # type: ignore[attr-defined]
    service.bucket = None  # type: ignore[attr-defined]
    service._matcher = None  # type: ignore[attr-defined]
    return service  # type: ignore[return-value]


def test_priority_rank_handles_unknown_values() -> None:
    service = _make_service()
    assert service._priority_rank("high") == service.PRIORITY_ORDER["high"]
    assert service._priority_rank("NORMAL") == service.PRIORITY_ORDER["normal"]
    # Unknown priorities fall back to the default.
    assert service._priority_rank("urgent") == service.PRIORITY_ORDER[service.DEFAULT_PRIORITY]


def test_collect_digest_entries_filters_priority_and_status() -> None:
    now = datetime.now(timezone.utc)
    service = _make_service()
    docs = [
        FakeSnapshot(
            "req-1",
            {
                "productName": "Alpha",
                "priority": "high",
                "status": "pending",
                "requestType": "newProduct",
                "store": "Store A",
                "createdAt": now,
                "updatedAt": now,
            },
        ),
        FakeSnapshot(
            "req-2",
            {
                "productName": "Beta",
                "priority": "low",
                "status": "completed",
                "requestType": "updateProduct",
                "store": "Store B",
                "createdAt": now,
                "updatedAt": now,
            },
        ),
    ]

    digest = service._collect_digest_entries(
        docs,
        priority_threshold=service._priority_rank("normal"),
        include_completed=False,
        max_items=5,
    )

    assert len(digest["items"]) == 1
    assert digest["items"][0]["productName"] == "Alpha"
    assert digest["counts"]["priority"]["high"] == 1
    # Completed low-priority requests are filtered out.
    assert digest["counts"]["priority"]["low"] == 0


def test_build_priority_digest_uses_injected_documents() -> None:
    now = datetime.now(timezone.utc)
    service = _make_service()
    docs = [
        FakeSnapshot(
            "req-3",
            {
                "productName": "Gamma",
                "priority": "high",
                "status": "pending",
                "requestType": "reportError",
                "store": "Store C",
                "createdAt": now,
                "updatedAt": now,
            },
        )
    ]

    digest = service.build_priority_digest(
        since_minutes=30,
        min_priority="normal",
        max_items=2,
        include_completed=False,
        _documents=docs,
    )

    assert digest["items"][0]["productName"] == "Gamma"
    assert digest["minPriority"] == "normal"
    assert digest["windowMinutes"] == 30
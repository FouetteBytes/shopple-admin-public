"""Cache key helpers for Redis-backed caches."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Optional
from services.system.logger_service import get_logger

logger = get_logger(__name__)


def _hash_payload(prefix: str, payload: Dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, default=str)
    digest = hashlib.sha1(serialized.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def product_stats_key() -> str:
    return "product:stats:all"


def product_list_key(page: int, per_page: int, search: str = "", category: str = "", brand: str = "") -> str:
    payload = {
        "page": page,
        "per_page": per_page,
        "search": search or "",
        "category": category or "",
        "brand": brand or "",
    }
    return _hash_payload("product:list", payload)


def product_detail_key(product_id: str) -> str:
    return f"product:detail:{product_id}"


def price_current_key(product_id: str) -> str:
    return f"price:current:{product_id}"


def price_comparison_key(product_id: str) -> str:
    return f"price:comparison:{product_id}"


def price_stats_key() -> str:
    return "price:stats:all"


def price_comparisons_key() -> str:
    return "price:comparisons:all"


def price_overview_key(
    supermarket: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    per_page: int = 50,
) -> str:
    payload = {
        "supermarket": supermarket or "",
        "category": category or "",
        "page": page,
        "per_page": per_page,
    }
    return _hash_payload("price:overview", payload)


def price_history_key(product_id: str) -> str:
    return f"price:history:{product_id}"


def classification_history_key(limit: int) -> str:
    return f"classification:history:limit:{limit}"

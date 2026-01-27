"""High-precision product search service leveraging the intelligent matcher cache."""

from __future__ import annotations

import os
import sys
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.services.firebase.firebase_service import firebase_service
from backend.services.system.logger_service import get_logger
from .matcher import IntelligentProductMatcher

logger = get_logger(__name__)


class ProductSearchService:
    """Reusable fuzzy product search utilising cached catalogue embeddings."""

    CACHE_TTL_SECONDS = 15 * 60

    def __init__(self) -> None:
        self.db = firebase_service.get_client()
        self._matcher: Optional[IntelligentProductMatcher] = None
        self._matcher_lock = threading.Lock()
        self._last_cache_refresh: Optional[datetime] = None

    def search_products(
        self,
        query: str,
        *,
        brand: Optional[str] = None,
        size: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Return the best matching products for an arbitrary search query."""

        query = (query or "").strip()
        if not query:
            return []

        matcher = self._get_matcher()
        if not matcher:
            return []

        candidate = {
            "name": query,
            "brand_name": (brand or "").strip(),
            "sizeRaw": (size or "").strip(),
            "variety": "",
        }

        raw_matches = matcher.find_similar_products(candidate, limit=max(limit * 2, 10))

        # Optimization: Batch fetch all matched documents to avoid N+1 queries
        match_ids = [m.product_id for m in raw_matches]
        docs_map = {}
        if match_ids:
            try:
                refs = [self.db.collection("products").document(pid) for pid in match_ids]
                # get_all is more efficient than individual gets
                docs = self.db.get_all(refs)
                for doc in docs:
                    if doc.exists:
                        data = doc.to_dict()
                        data['id'] = doc.id
                        docs_map[doc.id] = data
            except Exception as e:
                logger.error(f"Batch fetch failed: {e}")
                # Fall back to per-document fetch on batch failure.

        results: List[Dict[str, Any]] = []
        for match in raw_matches:
            # Use pre-fetched data
            product_data = docs_map.get(match.product_id)
            
            if not product_data:
                continue

            if category and product_data.get("category") != category:
                continue
            if brand and product_data.get("brand_name", "").lower() != brand.lower():
                continue

            product_data.update(
                {
                    "id": product_data.get("id") or match.product_id,
                    "similarity": round(match.similarity_score, 3),
                    "matchReasons": match.match_reasons,
                    "isDuplicate": match.is_duplicate,
                }
            )
            results.append(product_data)
            if len(results) >= limit:
                break

        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _resolve_product(self, product_id: str, cached: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Merge cached matcher data with the canonical Firestore document."""
        try:
            doc = self.db.collection("products").document(product_id).get()
            if doc.exists:
                data = doc.to_dict() or {}
                data["id"] = product_id
                return data
        except Exception as exc:
            logger.warning("Failed to hydrate product from Firestore", extra={"product_id": product_id, "error": str(exc)})
        # Fallback to cached matcher data (may be partial)
        fallback = dict(cached or {})
        if not fallback:
            return None
        fallback.setdefault("id", product_id)
        fallback.setdefault("name", cached.get("name"))
        fallback.setdefault("brand_name", cached.get("brand_name"))
        fallback.setdefault("category", cached.get("category"))
        fallback.setdefault("size", cached.get("size"))
        return fallback

    def _get_matcher(self, *, force_refresh: bool = False) -> Optional[IntelligentProductMatcher]:
        with self._matcher_lock:
            if not self._matcher:
                # Path to root cache folder
                # backend/features/products/service/product_search_service.py -> ../../../../cache
                cache_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "cache", "product_cache.pkl")
                self._matcher = IntelligentProductMatcher(cache_file=cache_path)
                force_refresh = True

            if force_refresh or self._cache_stale():
                db_client = firebase_service.get_client()
                try:
                    self._matcher.refresh_cache_from_db(db_client)
                    self._last_cache_refresh = datetime.now(timezone.utc)
                except Exception as exc:
                    logger.warning("Failed to refresh product matcher cache", extra={"error": str(exc)})
        return self._matcher

    def _cache_stale(self) -> bool:
        if not self._last_cache_refresh:
            return True
        delta = datetime.now(timezone.utc) - self._last_cache_refresh
        return delta.total_seconds() > self.CACHE_TTL_SECONDS


product_search_service = ProductSearchService()

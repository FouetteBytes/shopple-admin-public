"""Upstash Redis cache service wrapper."""
from __future__ import annotations

import json
import os
import threading
from typing import Any, Dict, Optional

from services.system.logger_service import get_logger

try:
    from upstash_redis import Redis  # type: ignore
except Exception:  # pragma: no cover - optional dependency during tests
    Redis = None

logger = get_logger(__name__)


class CacheService:
    """Singleton wrapper around Upstash Redis REST API."""

    _instance: Optional["CacheService"] = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return

        self.url = os.getenv("UPSTASH_REDIS_REST_URL")
        self.token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
        self._client = None
        self._available = False
        self._stats: Dict[str, int] = {
            "hits": 0,
            "misses": 0,
            "writes": 0,
            "errors": 0,
        }

        if self.url and self.token and Redis is not None:
            try:
                self._client = Redis(url=self.url, token=self.token)
                self._available = True
                logger.info("Redis cache client initialized", extra={"provider": "upstash"})
            except Exception as exc:  # pragma: no cover - network heavy
                self._stats["errors"] += 1
                logger.error("Failed to initialize Redis cache", extra={"error": str(exc)})
        else:
            if not self.url or not self.token:
                logger.info("Upstash Redis credentials missing; cache disabled")
            elif Redis is None:
                logger.warning("upstash-redis package not available; cache disabled")

        self._initialized = True

    def is_available(self) -> bool:
        return self._available and self._client is not None

    def get_json(self, key: str) -> Optional[Any]:
        if not self.is_available():
            return None
        try:
            raw = self._client.get(key)  # type: ignore[attr-defined]
            if raw is None:
                self._stats["misses"] += 1
                return None
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            self._stats["hits"] += 1
            return json.loads(raw)
        except Exception as exc:  # pragma: no cover - network heavy
            self._stats["errors"] += 1
            logger.warning("Redis cache get failed", extra={"key": key, "error": str(exc)})
            return None

    def set_json(self, key: str, value: Any, ttl_seconds: Optional[int] = 300) -> bool:
        if not self.is_available():
            return False
        try:
            serialized = json.dumps(value, default=str)
            kwargs = {"ex": ttl_seconds} if ttl_seconds else {}
            self._client.set(key, serialized, **kwargs)  # type: ignore[attr-defined]
            self._stats["writes"] += 1
            return True
        except Exception as exc:  # pragma: no cover - network heavy
            self._stats["errors"] += 1
            logger.warning("Redis cache set failed", extra={"key": key, "error": str(exc)})
            return False

    def delete(self, *keys: str) -> int:
        if not self.is_available() or not keys:
            return 0
        try:
            deleted = self._client.delete(*keys)  # type: ignore[attr-defined]
            return int(deleted or 0)
        except Exception as exc:  # pragma: no cover - network heavy
            self._stats["errors"] += 1
            logger.warning("Redis cache delete failed", extra={"keys": keys, "error": str(exc)})
            return 0

    def invalidate_prefix(self, prefix: str) -> int:
        if not self.is_available():
            return 0
        try:
            pattern = f"{prefix}*"
            keys = self._client.keys(pattern)  # type: ignore[attr-defined]
            if not keys:
                return 0
            if isinstance(keys, str):
                keys = [keys]
            return self.delete(*keys)
        except Exception as exc:  # pragma: no cover - network heavy
            self._stats["errors"] += 1
            logger.warning("Redis cache prefix invalidation failed", extra={"prefix": prefix, "error": str(exc)})
            return 0

    def get_stats(self) -> Dict[str, int]:
        return dict(self._stats)


cache_service = CacheService()


def get_cache_service() -> CacheService:
    return cache_service

"""Shared primitives for Slack webhook notifications."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from services.system.logger_service import get_logger

logger = get_logger(__name__)

ISO_FORMATS = ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S")


def parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    for fmt in ISO_FORMATS:
        candidate = value
        if value.endswith("Z") and "%z" in fmt and not value.endswith("+0000"):
            candidate = value.replace("Z", "+0000")
        try:
            return datetime.strptime(candidate, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def format_timestamp(value: Optional[str]) -> str:
    dt = parse_iso(value)
    if not dt:
        return "—"
    local = dt.astimezone()
    return local.strftime("%Y-%m-%d %H:%M %Z")


def truncate_text(value: str, limit: int = 300) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def format_change_value(value: Any, limit: int = 160) -> str:
    if isinstance(value, (dict, list)):
        serialized = json.dumps(value, ensure_ascii=False)
        return truncate_text(serialized, limit)
    if value is None:
        return "—"
    return truncate_text(str(value), limit)


def summarize_specs(specs: Optional[List[Dict[str, Any]]]) -> str:
    if not specs:
        return "0 crawlers"
    store_counts: Dict[str, int] = {}
    for spec in specs:
        store = spec.get("store", "unknown")
        store_counts[store] = store_counts.get(store, 0) + 1
    parts = [f"{store}: {count}" for store, count in sorted(store_counts.items())]
    return f"{len(specs)} crawlers ({', '.join(parts)})"


class SlackWebhookClient:
    """Thin wrapper around a Slack incoming webhook."""

    def __init__(
        self,
        *,
        webhook_url: Optional[str],
        channel: Optional[str] = None,
        username: str = "Shopple Bot",
        icon_emoji: Optional[str] = ":robot_face:",
        timeout: int = 5,
    ) -> None:
        self.webhook_url = webhook_url
        self.channel = channel
        self.username = username
        self.icon_emoji = icon_emoji
        self.timeout = timeout

    @property
    def enabled(self) -> bool:
        return bool(self.webhook_url)

    def _post(self, payload: Dict[str, Any]) -> bool:
        if not self.webhook_url:
            return False
        try:
            response = requests.post(self.webhook_url, json=payload, timeout=self.timeout)
            if response.status_code >= 400:
                logger.warning("Failed to deliver Slack notification", extra={
                    "status_code": response.status_code,
                    "response_text": response.text[:256]
                })
                return False
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Error delivering Slack notification", extra={"error": str(exc)})
            return False

    def send_message(self, text: str, *, blocks: Optional[List[Dict[str, Any]]] = None) -> bool:
        if not self.enabled:
            return False
        payload: Dict[str, Any] = {
            "text": text,
            "username": self.username,
        }
        if self.channel:
            payload["channel"] = self.channel
        if self.icon_emoji and self.icon_emoji.startswith(":"):
            payload["icon_emoji"] = self.icon_emoji
        if blocks:
            payload["blocks"] = blocks
        return self._post(payload)

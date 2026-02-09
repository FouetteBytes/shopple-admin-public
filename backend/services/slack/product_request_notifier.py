"""Slack digests for product request triage."""

from __future__ import annotations

import os
from typing import Any, Dict, List
from services.system.logger_service import get_logger

logger = get_logger(__name__)

from .base import SlackWebhookClient, format_timestamp, truncate_text


class ProductRequestSlackNotifier(SlackWebhookClient):
    def __init__(self) -> None:
        super().__init__(
            webhook_url=os.getenv("SLACK_PRODUCT_REQUEST_WEBHOOK"),
            channel=os.getenv("SLACK_PRODUCT_REQUEST_CHANNEL"),
            username=os.getenv("SLACK_PRODUCT_REQUEST_USERNAME", "Product Requests"),
            icon_emoji=os.getenv("SLACK_PRODUCT_REQUEST_ICON", ":rotating_light:"),
        )

    def send_product_request_digest(self, digest: Dict[str, Any]) -> bool:
        if not digest.get("items"):
            return False
            
        logger.info(f"Sending product request digest with {len(digest['items'])} items")
        blocks = build_product_request_digest_blocks(digest)
        summary = (
            f"{len(digest['items'])} urgent product request(s) in the last {digest['windowMinutes']} minutes"
        )
        return self.send_message(summary, blocks=blocks)


def _priority_icon(priority: str) -> str:
    return {
        "high": ":rotating_light:",
        "normal": ":large_orange_diamond:",
        "low": ":white_circle:",
    }.get(priority, ":white_circle:")


def _status_badge(status: str) -> str:
    return {
        "pending": "Pending",
        "inReview": "In Review",
        "approved": "Approved",
        "completed": "Completed",
        "rejected": "Rejected",
    }.get(status, status.title())


def _format_request_section(item: Dict[str, Any]) -> Dict[str, Any]:
    product = item.get("productName", "Unnamed product")
    priority = item.get("priority", "normal")
    status = item.get("status", "pending")
    request_type = item.get("requestType", "newProduct")
    description = item.get("description") or "No description provided."
    description = truncate_text(str(description), 240)

    subtitle_parts = [
        f"{_priority_icon(priority)} {priority.title()}",
        f"Type: `{request_type}`",
        f"Status: {_status_badge(status)}",
    ]
    if item.get("aiRecommendation"):
        subtitle_parts.append(f"AI: `{item['aiRecommendation']}`")

    fields = [
        {"type": "mrkdwn", "text": f"*Product*\n{product}"},
        {"type": "mrkdwn", "text": f"*Store*\n{item.get('store', 'Unknown')}"},
        {"type": "mrkdwn", "text": f"*Submitted By*\n{item.get('submittedBy', 'Unknown')}"},
    ]
    if item.get("assignedTo"):
        fields.append({"type": "mrkdwn", "text": f"*Assigned*\n{item['assignedTo']}"})

    section_text = f"{' • '.join(subtitle_parts)}\n{description}"
    if item.get("aiSummary"):
        section_text += f"\n_AI:_ {item['aiSummary']}"

    block: Dict[str, Any] = {
        "type": "section",
        "text": {"type": "mrkdwn", "text": section_text},
        "fields": fields[:10],
    }

    return block


def _compose_counts_summary(counts: Dict[str, Any]) -> str:
    priority_counts = counts.get("priority", {})
    status_counts = counts.get("status", {})
    request_type_counts = counts.get("requestType", {})

    priority_line = ", ".join(
        f"{priority.title()}: {priority_counts.get(priority, 0)}" for priority in ["high", "normal", "low"]
    )
    status_line = ", ".join(
        f"{name}: {status_counts.get(key, 0)}"
        for key, name in [
            ("pending", "Pending"),
            ("inReview", "In Review"),
            ("approved", "Approved"),
        ]
    )
    type_line = ", ".join(
        f"{rtype}: {request_type_counts.get(rtype, 0)}" for rtype in request_type_counts.keys()
    )

    segments = [
        f"Priority → {priority_line}" if priority_line else None,
        f"Status → {status_line}" if status_line else None,
        f"Type → {type_line}" if type_line else None,
    ]
    return " | ".join(segment for segment in segments if segment)


def build_product_request_digest_blocks(digest: Dict[str, Any]) -> List[Dict[str, Any]]:
    header = {
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": (
                f"*🚨 Product Request Digest*\n"
                f"Window: last {digest['windowMinutes']} minutes | "
                f"Min priority: {digest['minPriority'].title()}"
            ),
        },
    }

    counts = digest.get("counts", {})
    stats_line = _compose_counts_summary(counts)
    context_block = {
        "type": "context",
        "elements": [
            {"type": "mrkdwn", "text": stats_line},
            {"type": "mrkdwn", "text": f"Generated: {format_timestamp(digest.get('generatedAt'))}"},
        ],
    }

    divider = {"type": "divider"}
    sections = [_format_request_section(item) for item in digest.get("items", [])]
    footer = {
        "type": "context",
        "elements": [
            {"type": "mrkdwn", "text": "Reply in Slack to claim a request."},
        ],
    }
    return [header, context_block, divider, *sections, divider, footer]


def get_product_request_notifier() -> ProductRequestSlackNotifier:
    return ProductRequestSlackNotifier()

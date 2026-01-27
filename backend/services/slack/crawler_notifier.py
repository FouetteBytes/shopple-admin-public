"""Slack notifications for crawler scheduler events."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from services.system.logger_service import get_logger

logger = get_logger(__name__)

from .base import (
    SlackWebhookClient,
    format_change_value,
    format_timestamp,
    summarize_specs,
    truncate_text,
)


class CrawlerSlackNotifier(SlackWebhookClient):
    def __init__(self) -> None:
        super().__init__(
            webhook_url=os.getenv("SLACK_AUTOMATION_WEBHOOK"),
            channel=os.getenv("SLACK_AUTOMATION_CHANNEL"),
            username=os.getenv("SLACK_AUTOMATION_USERNAME", "Shopple Automation"),
            icon_emoji=os.getenv("SLACK_AUTOMATION_ICON", ":robot_face:"),
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    def _schedule_label(self, schedule: Dict[str, Any]) -> str:
        return schedule.get("label") or schedule.get("id") or "Unnamed schedule"

    def _describe_selection(self, schedule: Dict[str, Any]) -> str:
        selection = schedule.get("selection") or {}
        mode = (selection.get("mode") or "all").title()
        segments = [mode]
        stores = selection.get("stores") or []
        categories = selection.get("categories") or []
        if stores:
            listing = ", ".join(stores[:3]) + ("…" if len(stores) > 3 else "")
            segments.append(f"Stores: {listing}")
        if categories:
            listing = ", ".join(categories[:3]) + ("…" if len(categories) > 3 else "")
            segments.append(f"Categories: {listing}")
        return " • ".join(segments)

    def _describe_cadence(self, schedule: Dict[str, Any]) -> str:
        config = schedule.get("schedule", {})
        schedule_type = (config.get("type") or "one_time").lower()
        timezone_name = config.get("timezone") or "UTC"
        if schedule_type == "one_time":
            return f"One-time @ {format_timestamp(config.get('run_at'))}"
        if schedule_type == "daily":
            return f"Daily @ {config.get('time_of_day', '00:00')} {timezone_name}"
        if schedule_type == "weekly":
            days = config.get("days_of_week") or []
            day_labels = ", ".join(str(day) for day in days) or "weekly"
            return f"Weekly ({day_labels}) @ {config.get('time_of_day', '00:00')} {timezone_name}"
        if schedule_type == "interval":
            minutes = config.get("interval_minutes") or 60
            return f"Every {minutes} min"
        return schedule_type.replace("_", " ").title()

    # ------------------------------------------------------------------
    # Event notifications
    # ------------------------------------------------------------------
    def notify_schedule_created(self, schedule: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        logger.info(f"Sending schedule created notification for {schedule.get('id', 'unknown')}")
        label = self._schedule_label(schedule)
        header = "🆕 Automation schedule created"
        blocks: List[Dict[str, Any]] = [
            {"type": "header", "text": {"type": "plain_text", "text": label[:150]}},
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Event*\n{header}"},
                    {"type": "mrkdwn", "text": f"*Cadence*\n{self._describe_cadence(schedule)}"},
                    {"type": "mrkdwn", "text": f"*Next Run*\n{format_timestamp(schedule.get('next_run'))}"},
                    {"type": "mrkdwn", "text": f"*Selection*\n{self._describe_selection(schedule)}"},
                ],
            },
        ]
        if schedule.get("description"):
            blocks.append(
                {
                    "type": "context",
                    "elements": [
                        {"type": "mrkdwn", "text": truncate_text(schedule["description"], 200)},
                    ],
                }
            )
        self.send_message(f"{header}: {label}", blocks=blocks)

    def notify_schedule_updated(self, schedule: Dict[str, Any], changes: Optional[Dict[str, Any]] = None) -> None:
        if not self.enabled:
            return
        label = self._schedule_label(schedule)
        header = "Automation schedule updated"
        blocks: List[Dict[str, Any]] = [
            {"type": "header", "text": {"type": "plain_text", "text": label[:150]}},
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Event*\n{header}"},
                    {"type": "mrkdwn", "text": f"*Cadence*\n{self._describe_cadence(schedule)}"},
                    {"type": "mrkdwn", "text": f"*Next Run*\n{format_timestamp(schedule.get('next_run'))}"},
                    {"type": "mrkdwn", "text": f"*Selection*\n{self._describe_selection(schedule)}"},
                ],
            },
        ]
        if changes:
            formatted = "\n".join(
                f"• *{key}*: {format_change_value(value)}" for key, value in changes.items()
            )
            blocks.append(
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*Changes*\n{formatted}"},
                }
            )
        self.send_message(f"{header}: {label}", blocks=blocks)

    def notify_schedule_deleted(self, schedule: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        label = self._schedule_label(schedule)
        header = "Automation schedule deleted"
        blocks = [
            {"type": "header", "text": {"type": "plain_text", "text": label[:150]}},
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Event*\n{header}"},
                    {"type": "mrkdwn", "text": f"*Selection*\n{self._describe_selection(schedule)}"},
                    {"type": "mrkdwn", "text": f"*Cadence*\n{self._describe_cadence(schedule)}"},
                    {"type": "mrkdwn", "text": f"*Created*\n{format_timestamp(schedule.get('created_at'))}"},
                ],
            },
        ]
        self.send_message(f"{header}: {label}", blocks=blocks)

    def notify_schedule_start(
        self,
        schedule: Dict[str, Any],
        *,
        manual: bool = False,
        triggered_specs: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        if not self.enabled:
            return
        label = self._schedule_label(schedule)
        manual_suffix = " (manual)" if manual else ""
        header = f"Starting crawler schedule{manual_suffix}"
        blocks: List[Dict[str, Any]] = [
            {"type": "header", "text": {"type": "plain_text", "text": label[:150]}},
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Event*\n{header}"},
                    {"type": "mrkdwn", "text": f"*Cadence*\n{self._describe_cadence(schedule)}"},
                    {"type": "mrkdwn", "text": f"*Selection*\n{self._describe_selection(schedule)}"},
                    {"type": "mrkdwn", "text": f"*Targets*\n{summarize_specs(triggered_specs)}"},
                ],
            },
        ]
        self.send_message(f"{header}: {label}", blocks=blocks)

    def notify_schedule_run(
        self,
        schedule: Dict[str, Any],
        *,
        success: bool,
        manual: bool = False,
        triggered_specs: Optional[List[Dict[str, Any]]] = None,
        error_message: Optional[str] = None,
    ) -> None:
        if not self.enabled:
            return

        label = self._schedule_label(schedule)
        manual_suffix = " • Manual trigger" if manual else ""
        status_text = "completed" if success else "failed"
        header = f"Crawler schedule {status_text}{manual_suffix}"

        selection = schedule.get("selection", {})
        schedule_conf = schedule.get("schedule", {})
        schedule_type = (schedule_conf.get("type") or "one_time").replace("_", " ").title()

        blocks: List[Dict[str, Any]] = [
            {"type": "header", "text": {"type": "plain_text", "text": label[:150]}},
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Status*\n{header}"},
                    {"type": "mrkdwn", "text": f"*Schedule Type*\n{schedule_type}"},
                    {"type": "mrkdwn", "text": f"*Last Run*\n{format_timestamp(schedule.get('last_run'))}"},
                    {"type": "mrkdwn", "text": f"*Next Run*\n{format_timestamp(schedule.get('next_run'))}"},
                    {"type": "mrkdwn", "text": f"*Selection Mode*\n{(selection.get('mode') or 'all').title()}"},
                    {"type": "mrkdwn", "text": f"*Targets*\n{summarize_specs(triggered_specs)}"},
                ],
            },
        ]

        if error_message:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Error*\n```{truncate_text(error_message, 1800)}```",
                    },
                }
            )

        if schedule.get("description"):
            blocks.append(
                {
                    "type": "context",
                    "elements": [
                        {"type": "mrkdwn", "text": truncate_text(schedule["description"], 200)},
                    ],
                }
            )

        self.send_message(header, blocks=blocks)


def get_crawler_notifier() -> CrawlerSlackNotifier:
    return CrawlerSlackNotifier()

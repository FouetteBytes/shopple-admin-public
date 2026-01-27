"""Backwards-compatible shim for Slack notifier imports."""

from services.system.logger_service import get_logger

logger = get_logger(__name__)

from services.slack.crawler_notifier import (
    CrawlerSlackNotifier,
    get_crawler_notifier,
)
from services.slack.product_request_notifier import (
    ProductRequestSlackNotifier,
    get_product_request_notifier,
)

SlackNotifier = CrawlerSlackNotifier


def get_slack_notifier() -> ProductRequestSlackNotifier:
    """Legacy helper retained for code that still imports this module."""
    logger.warning("Deprecated get_slack_notifier called. Please migrate to specific notifiers.")
    return ProductRequestSlackNotifier()

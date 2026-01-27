"""
Security service for handling Rate Limiting and other security extensions.
"""
import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def get_limiter_storage_uri():
    return os.getenv("UPSTASH_REDIS_REST_URL") or "memory://"

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://", # Default to memory to ensure it works without config first
    strategy="fixed-window"
)


def configure_limiter(app):
    """
    Configure the limiter with the app instance.
    Checks env vars for Redis configuration if needed.
    """
    logger.info("Initializing Flask-Limiter for request rate limiting")
    limiter.init_app(app)

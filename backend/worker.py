import time
import sys
import os

from backend.services.system.logger_service import get_logger

logger = get_logger(__name__)

if __name__ == "__main__":
    logger.info("Worker service started. Waiting for jobs...")
    # Keep the container alive.
    while True:
        time.sleep(60)

"""
Base Service Class.
Provides common utility methods for all services.
"""
from datetime import datetime
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class BaseService:
    """
    Abstract base class for all services.
    """
    
    def now(self) -> datetime:
        """Return current server time."""
        return datetime.now()

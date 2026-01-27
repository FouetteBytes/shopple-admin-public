"""
Base Repository Class.
Provides abstract interface for data access.
"""
from abc import ABC, abstractmethod
from typing import TypeVar, Generic, Optional, Any
from services.system.logger_service import get_logger

logger = get_logger(__name__)

T = TypeVar('T')

class BaseRepository(ABC, Generic[T]):
    """
    Abstract base class for all repositories.
    """
    
    @abstractmethod
    def find_by_id(self, id: str) -> Optional[T]:
        pass
    
    @abstractmethod
    def save(self, entity: T) -> T:
        pass

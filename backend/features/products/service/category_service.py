from typing import Any, Dict, List
from common.base.base_service import BaseService
from backend.features.products.repository.category_repository import CategoryRepository
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class CategoryService(BaseService):
    def __init__(self):
        self.repository = CategoryRepository()

    def get_all_categories(self) -> List[Dict[str, Any]]:
        logger.info("Fetching all categories")
        return self.repository.get_all_categories()

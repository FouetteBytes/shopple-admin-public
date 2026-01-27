from flask import jsonify
from common.base.base_controller import BaseController
from backend.features.products.service.category_service import CategoryService
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class CategoryController(BaseController):
    def __init__(self, category_service: CategoryService):
        self.category_service = category_service

    def get_categories(self):
        """Get all categories for dropdown selections"""
        try:
            logger.debug("Categories requested")
            categories = self.category_service.get_all_categories()
            return jsonify({
                'success': True,
                'categories': categories
            })
        except Exception as e:
            logger.error(f"Error getting categories: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

"""
Price Feature Module.
Wires together Repository, Service, and Controller.
Exports the Blueprint for the application.
"""
from flask import Blueprint
from backend.features.prices.controller.price_controller import PriceController
from backend.features.prices.service.price_service import PriceService
from backend.features.prices.repository.price_repository import PriceRepository
from backend.features.products.service.product_service import ProductService

# Dependency Injection / Orchestration
price_repository = PriceRepository()
price_service = PriceService(price_repository)
product_service = ProductService() # Using legacy service for now
price_controller = PriceController(price_service, product_service)

# Blueprint Creation
price_bp = Blueprint('price', __name__)

# Route Registration
# Maps HTTP endpoints to Controller methods
price_bp.add_url_rule(
    '/api/prices/upload', 
    view_func=price_controller.upload_prices, 
    methods=['POST']
)

price_bp.add_url_rule(
    '/api/prices/current/<product_id>', 
    view_func=price_controller.get_current_prices_for_product, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/history/<supermarket_id>/<product_id>', 
    view_func=price_controller.get_price_history, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/comparison/<product_id>', 
    view_func=price_controller.get_price_comparison, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/supermarkets', 
    view_func=price_controller.get_supermarkets, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/stats', 
    view_func=price_controller.get_price_stats, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/current', 
    view_func=price_controller.get_all_current_prices, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/history/product/<product_id>', 
    view_func=price_controller.get_product_price_history, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/overview/enhanced', 
    view_func=price_controller.get_enhanced_overview, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/cache/clear', 
    view_func=price_controller.clear_price_cache, 
    methods=['POST']
)

price_bp.add_url_rule(
    '/api/prices/cache/info', 
    view_func=price_controller.get_cache_info, 
    methods=['GET']
)

price_bp.add_url_rule(
    '/api/prices/daily-counts', 
    view_func=price_controller.get_daily_upload_counts, 
    methods=['GET']
)

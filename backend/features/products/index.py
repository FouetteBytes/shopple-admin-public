"""
Product Feature Module.
Wires together Repository, Service, and Controller.
Exports the Blueprint for the application.
"""
from flask import Blueprint
from backend.features.products.controller.product_controller import ProductController
from backend.features.products.service.product_service import ProductService
from backend.features.products.service.product_image_service import ProductImageService
from backend.features.products.repository.product_repository import ProductRepository
from backend.features.products.controller.category_controller import CategoryController
from backend.features.products.service.category_service import CategoryService
from backend.features.products.request.controller.request_controller import RequestController
from backend.features.products.request.service.request_service import product_request_service
from backend.features.products.pending.controller.pending_controller import PendingController
from backend.features.products.pending.service.pending_service import PendingService
import os

product_service = ProductService()
image_service = ProductImageService()
category_service = CategoryService()

product_controller = ProductController(product_service, image_service)
category_controller = CategoryController(category_service)
request_controller = RequestController(product_request_service)
pending_service = PendingService()
pending_controller = PendingController(pending_service)

# Blueprint Creation
product_bp = Blueprint('product', __name__)

# Route Registration
product_bp.add_url_rule(
    '/api/products/stats',
    view_func=product_controller.get_products_stats,
    methods=['GET']
)

product_bp.add_url_rule(
    '/api/products',
    view_func=product_controller.get_products,
    methods=['GET']
)

product_bp.add_url_rule(
    '/api/products/missing-prices',
    view_func=product_controller.get_missing_prices,
    methods=['GET']
)

product_bp.add_url_rule(
    '/api/products/<product_id>',
    view_func=product_controller.get_product,
    methods=['GET']
)

product_bp.add_url_rule(
    '/api/products/<product_id>',
    view_func=product_controller.update_product,
    methods=['PUT', 'PATCH']  # Support partial updates via PATCH.
)

product_bp.add_url_rule(
    '/api/products/upload-old',
    view_func=product_controller.upload_products_old,
    methods=['POST']
)

# --- Category Routes ---
product_bp.add_url_rule(
    '/api/categories',
    view_func=category_controller.get_categories,
    methods=['GET']
)
# --- Product Request Routes ---
product_bp.add_url_rule('/api/product-requests', view_func=request_controller.create_product_request, methods=['POST'])
product_bp.add_url_rule('/api/product-requests', view_func=request_controller.list_product_requests, methods=['GET'])
product_bp.add_url_rule('/api/product-requests/<request_id>', view_func=request_controller.get_product_request, methods=['GET'])
product_bp.add_url_rule('/api/product-requests/<request_id>', view_func=request_controller.update_product_request, methods=['PUT'])
product_bp.add_url_rule('/api/product-requests/<request_id>/notes', view_func=request_controller.add_product_request_note, methods=['POST'])
product_bp.add_url_rule('/api/product-requests/<request_id>/acknowledge', view_func=request_controller.acknowledge_product_request, methods=['POST'])
product_bp.add_url_rule('/api/product-requests/acknowledge/bulk', view_func=request_controller.bulk_acknowledge_product_requests, methods=['POST'])
product_bp.add_url_rule('/api/product-requests/<request_id>/ai', view_func=request_controller.rerun_product_request_ai, methods=['POST'])
product_bp.add_url_rule('/api/product-requests/stats', view_func=request_controller.get_product_request_stats, methods=['GET'])
product_bp.add_url_rule('/api/product-requests/cache/refresh', view_func=request_controller.refresh_product_request_cache, methods=['POST'])
product_bp.add_url_rule('/api/product-requests/notifications/digest', view_func=request_controller.dispatch_product_request_digest, methods=['POST'])

# --- Pending Product Routes ---
product_bp.add_url_rule('/api/pending-products', view_func=pending_controller.list_pending_products, methods=['GET'])
product_bp.add_url_rule('/api/pending-products', view_func=pending_controller.create_pending_product, methods=['POST'])
product_bp.add_url_rule('/api/pending-products/<pending_id>/complete', view_func=pending_controller.mark_pending_complete, methods=['POST'])
product_bp.add_url_rule('/api/pending-products/<pending_id>', view_func=pending_controller.delete_pending_product, methods=['DELETE'])

# --- Batch & Management Routes ---
product_bp.add_url_rule('/api/products/<product_id>', view_func=product_controller.delete_product, methods=['DELETE'])
product_bp.add_url_rule('/api/products/delete-all', view_func=product_controller.delete_all_products, methods=['POST'])
product_bp.add_url_rule('/api/products/preview', view_func=product_controller.preview_products, methods=['POST'])
product_bp.add_url_rule('/api/products/confirm', view_func=product_controller.confirm_products, methods=['POST'])
product_bp.add_url_rule('/api/products/test-size-parsing', view_func=product_controller.test_size_parsing, methods=['POST'])
product_bp.add_url_rule('/api/products/migrate-sizes', view_func=product_controller.migrate_existing_product_sizes, methods=['POST'])
product_bp.add_url_rule('/api/products/test-size-formatting', view_func=product_controller.test_size_formatting, methods=['POST'])
product_bp.add_url_rule('/api/products/cleanup-size-display', view_func=product_controller.cleanup_size_display_field, methods=['POST'])
product_bp.add_url_rule('/api/products/preview-stream', view_func=product_controller.preview_products_stream, methods=['POST'])
product_bp.add_url_rule('/api/products/upload-image', view_func=product_controller.upload_product_image, methods=['POST'])
product_bp.add_url_rule('/api/products/download-image', view_func=product_controller.download_product_image, methods=['POST'])
product_bp.add_url_rule('/api/products/matcher-cache-refresh', view_func=product_controller.refresh_matcher_cache, methods=['POST'])

# --- Scalable Index Routes (for 1M+ products) ---
product_bp.add_url_rule('/api/products/index/build', view_func=product_controller.build_scalable_index, methods=['POST'])
product_bp.add_url_rule('/api/products/index/stats', view_func=product_controller.get_index_stats, methods=['GET'])

# --- OpenSearch Product Search Routes ---
product_bp.add_url_rule('/api/products/opensearch/reindex', view_func=product_controller.reindex_opensearch, methods=['POST'])
product_bp.add_url_rule('/api/products/opensearch/stats', view_func=product_controller.get_opensearch_stats, methods=['GET'])

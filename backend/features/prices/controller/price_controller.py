"""
Price Controller.
Handles HTTP requests for price management.
"""
from flask import request, jsonify
from datetime import datetime
import re

from common.base.base_controller import BaseController
from backend.features.prices.service.price_service import PriceService
from backend.features.products.service.product_service import ProductService
from services.system.logger_service import get_logger
from services.system.initialization import is_services_initializing
from services.system.cache_service import get_cache_service
from utils.product_utils import generate_product_id

logger = get_logger(__name__)

class PriceController(BaseController):
    def __init__(self, price_service: PriceService, product_service: ProductService):
        self.price_service = price_service
        self.product_service = product_service

    def _set_cache_header(self, response, hit: bool | None):
        if hit is None:
            return response
        response.headers['X-Cache'] = 'HIT' if hit else 'MISS'
        return response

    def validate_price_data(self, supermarket_id: str, product_id: str, price: float) -> list[str]:
        """Validate price data before processing."""
        errors = []
        
        if not supermarket_id or supermarket_id.strip() == '':
            errors.append('Supermarket ID is required')
        
        if not product_id or product_id.strip() == '':
            errors.append('Product ID is required')
        
        if not isinstance(price, (int, float)) or price <= 0:
            errors.append('Price must be a positive number')
        
        return errors

    def upload_prices(self):
        """
        Upload prices from AI classification results with supermarket selection.
        """
        try:
            if request.content_type != 'application/json':
                return jsonify({'error': 'Content-Type must be application/json'}), 400
            
            data = request.get_json()
            supermarket_id = data.get('supermarket_id', '').strip().lower()
            price_data = data.get('price_data', [])
            price_date_str = data.get('price_date')
            
            if not supermarket_id:
                return jsonify({'success': False, 'error': 'supermarket_id is required'}), 400
            
            if not price_data:
                return jsonify({'success': False, 'error': 'price_data array is required'}), 400
            
            valid_supermarkets = ['keells', 'cargills', 'arpico', 'food_city', 'laugfs']
            if supermarket_id not in valid_supermarkets:
                return jsonify({
                    'success': False,
                    'error': f'Invalid supermarket_id. Must be one of: {", ".join(valid_supermarkets)}'
                }), 400
            
            logger.info("Price upload started", extra={"supermarket_id": supermarket_id, "item_count": len(price_data)})
            
            processed_count = 0
            error_count = 0
            price_updates = []
            history_updates = []
            errors = []
            products_touched = set()
            
            if price_date_str:
                try:
                    price_date = datetime.strptime(price_date_str, '%Y-%m-%d')
                except ValueError:
                    price_date = datetime.now()
            else:
                price_date = datetime.now()
            
            for i, product in enumerate(price_data):
                try:
                    brand_name = product.get('brand_name') or None
                    product_name = product.get('product_name', '')
                    size_raw = product.get('size', '')
                    price_str = product.get('price', '')
                    
                    # Determine date for this item
                    item_price_date = price_date
                    if 'price_date' in product and product['price_date']:
                        try:
                            item_price_date = datetime.strptime(product['price_date'], '%Y-%m-%d')
                        except ValueError:
                            pass
                    elif 'date' in product and product['date']:
                        try:
                            item_price_date = datetime.strptime(product['date'], '%Y-%m-%d')
                        except ValueError:
                            pass
                    
                    if not product_name or not price_str:
                        errors.append(f"Product {i+1}: Missing product_name or price")
                        error_count += 1
                        continue
                    
                    price_match = re.search(r'[\d,]+\.?\d*', str(price_str).replace(',', ''))
                    if not price_match:
                        errors.append(f"Product {i+1}: Could not parse price from '{price_str}'")
                        error_count += 1
                        continue
                    
                    price = float(price_match.group())
                    
                    product_id = generate_product_id(brand_name, product_name, size_raw)
                    
                    # Check product existence via service
                    existing_product = self.product_service.get_product_by_id(product_id)
                    if not existing_product:
                        errors.append(f"Product {i+1}: Product ID '{product_id}' does not exist in products collection")
                        error_count += 1
                        continue
                    
                    validation_errors = self.validate_price_data(supermarket_id, product_id, price)
                    if validation_errors:
                        errors.append(f"Product {i+1}: {', '.join(validation_errors)}")
                        error_count += 1
                        continue
                    
                    # Update via service
                    result = self.price_service.update_price_data(supermarket_id, product_id, price, item_price_date)
                    
                    price_updates.append(result['current_price'])
                    if result.get('history_updated'):
                        history_updates.append(True)
                    
                    processed_count += 1
                    products_touched.add(product_id)
                    
                    if processed_count % 10 == 0:
                        logger.info("Price update progress", extra={"processed_count": processed_count})
                    
                except Exception as e:
                    error_count += 1
                    errors.append(f"Product {i+1}: {str(e)}")
                    continue
            
            # Update daily counts
            if processed_count > 0:
                try:
                    upload_date_str = price_date.strftime('%Y-%m-%d')
                    final_count, added = self.price_service.update_daily_upload_count(
                        upload_date_str, supermarket_id, products_touched
                    )
                    logger.info("Updated price_uploads_daily", extra={
                        "date": upload_date_str, 
                        "count": final_count,
                        "added": added
                    })
                except Exception as e:
                    logger.warning("Failed to update daily counts", extra={"error": str(e)})

            # Invalidate caches
            if products_touched:
                self.price_service.invalidate_cache_for_upload(products_touched)

            return jsonify({
                'success': True,
                'message': f'Price upload completed for {supermarket_id}',
                'stats': {
                    'total_processed': processed_count,
                    'total_errors': error_count,
                    'supermarket': supermarket_id,
                    'upload_date': price_date.isoformat()
                },
                'price_updates_count': len(price_updates),
                'history_updates_count': len(history_updates),
                'errors': errors[:10] if errors else []
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_current_prices_for_product(self, product_id):
        """Get current prices for a product across all supermarkets."""
        try:
            result, cache_hit = self.price_service.get_current_prices(product_id)
            response = jsonify(result)
            return self._set_cache_header(response, cache_hit)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_price_history(self, supermarket_id, product_id):
        """Get price history for a product at a specific supermarket."""
        try:
            months_back = int(request.args.get('months', 6))
            result, cache_hit = self.price_service.get_price_history(supermarket_id, product_id, months_back)
            response = jsonify(result)
            return self._set_cache_header(response, cache_hit)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_price_comparison(self, product_id):
        """Get comprehensive price comparison for a product."""
        try:
            result, cache_hit = self.price_service.get_price_comparison(product_id)
            response = jsonify(result)
            return self._set_cache_header(response, cache_hit)
        except Exception as e:
            if isinstance(e, ValueError):
                return jsonify({'success': False, 'error': str(e)}), 404
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_supermarkets(self):
        """Get list of supported supermarkets."""
        supermarkets = [
            {'id': 'keells', 'name': 'Keells Super', 'active': True},
            {'id': 'cargills', 'name': 'Cargills Food City', 'active': True},
            {'id': 'arpico', 'name': 'Arpico Supercenter', 'active': True},
            {'id': 'food_city', 'name': 'Food City', 'active': True},
            {'id': 'laugfs', 'name': 'Laugfs Super', 'active': True}
        ]
        return jsonify({'success': True, 'supermarkets': supermarkets})

    def get_price_stats(self):
        """Get overall pricing statistics."""
        try:
            result, cache_hit = self.price_service.get_price_stats()
            response = jsonify(result)
            return self._set_cache_header(response, cache_hit)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_all_current_prices(self):
        """Get all current prices with comparison data for all products."""
        try:
            result, cache_hit = self.price_service.get_all_current_price_comparisons()
            response = jsonify(result)
            return self._set_cache_header(response, cache_hit)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_product_price_history(self, product_id):
        """Get complete price history for a specific product across all supermarkets."""
        try:
            result, cache_hit = self.price_service.get_product_price_history(product_id)
            response = jsonify(result)
            return self._set_cache_header(response, cache_hit)
        except Exception as e:
            if isinstance(e, ValueError):
                return jsonify({'success': False, 'error': str(e)}), 404
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_enhanced_overview(self):
        """Get comprehensive overview data optimized for admin dashboard."""
        try:
            if is_services_initializing():
                return jsonify({
                    'initializing': True, 'products': [], 'total_products': 0,
                    'supermarket_stats': {}, 'category_stats': [], 'brand_stats': [],
                    'page': 1, 'per_page': 50, 'total_pages': 0
                }), 200
            
            page = int(request.args.get('page', 1))
            per_page = int(request.args.get('per_page', 50))
            category_filter = request.args.get('category', '')
            supermarket_filter = request.args.get('supermarket', '')

            overview, cache_hit = self.price_service.get_enhanced_overview(
                page=page, per_page=per_page,
                category_filter=category_filter, supermarket_filter=supermarket_filter
            )

            if 'cache_info' in overview:
                overview['cache_info']['cached'] = cache_hit

            response = jsonify(overview)
            return self._set_cache_header(response, cache_hit)
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def clear_price_cache(self):
        """Clear the pricing cache."""
        try:
            self.price_service.invalidate_all_price_views()
            return jsonify({'success': True, 'message': 'Price cache cleared successfully'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_cache_info(self):
        """Get information about current cache status"""
        try:
            cache_service = get_cache_service()
            stats = cache_service.get_stats()
            return jsonify({
                'success': True,
                'cache_available': cache_service.is_available(),
                'stats': stats
            })
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_daily_upload_counts(self):
        """Get upload counts for a date range."""
        try:
            start_date_str = request.args.get('start_date')
            end_date_str = request.args.get('end_date')
            
            if not start_date_str or not end_date_str:
                return jsonify({'error': 'start_date and end_date are required'}), 400
                
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
            
            counts = self.price_service.get_daily_upload_counts(start_date, end_date)
                    
            return jsonify({'success': True, 'counts': counts})
        except Exception as e:
            logger.error(f"Error fetching daily counts: {str(e)}")
            return jsonify({'error': str(e)}), 500

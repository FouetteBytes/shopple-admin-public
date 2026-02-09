"""
Product Controller.
Handles HTTP requests for product management.
"""
from flask import request, jsonify, make_response, Response, stream_with_context
import os
import json
from common.base.base_controller import BaseController
from backend.features.products.service.product_service import ProductService
from backend.features.products.service.product_batch_service import ProductBatchService
from backend.features.products.service.product_image_service import ProductImageService
from services.system.logger_service import get_logger, log_error
from backend.schemas.product_schemas import ProductListRequest
from pydantic import ValidationError
from utils.product_utils import parse_size_string, format_size_display
from services.firebase.firebase_client import initialize_firebase

logger = get_logger(__name__)

class ProductController(BaseController):
    def __init__(self, product_service: ProductService, image_service: ProductImageService, batch_service: ProductBatchService = None):
        self.product_service = product_service
        self.image_service = image_service
        self.batch_service = batch_service or ProductBatchService(product_service, image_service)

    def _set_cache_header(self, response, hit: bool | None):
        if hit is None:
            return response
        response.headers['X-Cache'] = 'HIT' if hit else 'MISS'
        return response

    def get_products_stats(self):
        """Get statistics about the products collection"""
        try:
            stats = self.product_service.get_product_stats()
            
            response = jsonify(stats)
            return response
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    def get_products(self):
        """Get all products with pagination and filtering"""
        try:
            try:
                # Validate params with Pydantic
                params = ProductListRequest(
                    page=request.args.get('page', 1),
                    per_page=request.args.get('per_page', 20),
                    search=request.args.get('search'),
                    category=request.args.get('category'),
                    brand=request.args.get('brand')
                )
            except ValidationError as e:
                return jsonify({'success': False, 'error': e.errors()}), 400

            result = self.product_service.list_products(
                page=params.page,
                per_page=params.per_page,
                search=params.search or '',
                category=params.category or '',
                brand=params.brand or '',
            )

            response = jsonify(result)
            return response
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    def get_missing_prices(self):
        """Get products that have no price data"""
        try:
            products = self.product_service.get_products_missing_prices()
            response = jsonify({
                'success': True,
                'products': products,
                'count': len(products)
            })
            return response
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    def get_product(self, product_id):
        """Get a specific product by ID"""
        try:
            product_data = self.product_service.get_product_by_id(product_id)
            
            if not product_data:
                return jsonify({
                    'success': False,
                    'error': 'Product not found'
                }), 404
                
            return jsonify({
                'success': True,
                'product': product_data
            })
            
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    def update_product(self, product_id):
        """Update a specific product"""
        try:
            if request.content_type != 'application/json':
                return jsonify({'error': 'Content-Type must be application/json'}), 400
            
            data = request.get_json()
            
            # Fetch current data first (needed for migration check and image update)
            current_data = self.product_service.get_product_by_id(product_id)
            if not current_data:
                return jsonify({
                    'success': False,
                    'error': 'Product not found'
                }), 404

            # Initialize update_data with allowed fields
            update_data = {}
            allowed_fields = ['name', 'brand_name', 'category', 'variety', 'size', 'sizeRaw', 'sizeUnit', 'image_url', 'original_name', 'is_active']
            
            for field in allowed_fields:
                if field in data:
                    update_data[field] = data[field]
            
            # Image Update Logic
            if 'image_url' in data and data['image_url']:
                new_source_url = data['image_url']
                old_image_url = current_data.get('image_url', '')
                
                if new_source_url != old_image_url:
                    # Process image (upload new, delete old)
                    new_firebase_url = self.image_service.update_product_image(
                        product_id, 
                        old_image_url, 
                        new_source_url
                    )
                    if new_firebase_url:
                        update_data['image_url'] = new_firebase_url
                    else:
                        # Log warning but continue?
                        logger.warning(f"Failed to update image for product {product_id}")

            # Call Service
            final_product_data, id_changed = self.product_service.update_product(
                product_id, 
                update_data, 
                current_data
            )
            
            message = 'Product migrated successfully' if id_changed else 'Product updated successfully'
            
            return jsonify({
                'success': True,
                'message': message,
                'product': final_product_data,
                'id_changed': id_changed,
                'new_id': final_product_data.get('id') if id_changed else product_id
            })
            
        except Exception as e:
            logger.error(f"Error updating product {product_id}: {str(e)}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    def upload_products_old(self):
        """DEPRECATED"""
        return jsonify({
            'error': 'This endpoint is deprecated. Please use /api/products/preview followed by /api/products/confirm.',
            'updated_endpoints': {
                'preview': '/api/products/preview',
                'confirm': '/api/products/confirm'
            }
        }), 410

    def delete_product(self, product_id):
        try:
            self.product_service.delete_product(product_id)
            return jsonify({'success': True, 'message': 'Product and associated image deleted successfully'})
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 404
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def delete_all_products(self):
        try:
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({'success': False, 'error': 'Missing or invalid Authorization header'}), 401
            
            from firebase_admin import auth
            try:
                id_token = auth_header.split('Bearer ')[1]
                decoded_token = auth.verify_id_token(id_token)
                user = auth.get_user(decoded_token['uid'])
                if not (user.custom_claims or {}).get('superAdmin'):
                    return jsonify({'success': False, 'error': 'Access denied. Super admin privileges required.'}), 403
            except Exception as e:
                 return jsonify({'success': False, 'error': f'Auth failed: {e}'}), 401

            result = self.product_service.delete_all_products()
            return jsonify(result)
        except Exception as e:
             return jsonify({'success': False, 'error': str(e)}), 500

    def preview_products(self):
        try:
            data = request.get_json() or {}
            products = data.get('products', [])
            if not products: return jsonify({'error': 'No products provided'}), 400
            result = self.batch_service.preview_products(products)
            return jsonify({'success': True, 'preview_data': result})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def confirm_products(self):
        try:
            data = request.get_json() or {}
            products = data.get('products', [])
            decisions = data.get('duplicate_decisions', {})
            if not products: return jsonify({'error': 'No products selected'}), 400
            
            result = self.batch_service.confirm_products(products, decisions)
            return jsonify({
                'success': True, 
                'message': f'Successfully processed {result["total"]} products', 
                'stats': result
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def migrate_existing_product_sizes(self):
        """Migrate existing products to use separate size and sizeUnit fields"""
        try:
            db = initialize_firebase()
            from firebase_admin import firestore

            products_ref = db.collection('products')
            products = products_ref.stream()

            migration_stats = {
                'total_products': 0,
                'migrated': 0,
                'already_migrated': 0,
                'failed': 0,
                'errors': []
            }

            batch = db.batch()
            batch_count = 0
            batch_size = 100

            for product_doc in products:
                migration_stats['total_products'] += 1
                product_data = product_doc.to_dict()

                if 'sizeUnit' in product_data:
                    migration_stats['already_migrated'] += 1
                    continue

                size_raw = product_data.get('size', '')

                try:
                    size_value, size_unit = parse_size_string(size_raw)

                    doc_ref = products_ref.document(product_doc.id)
                    update_data = {
                        'size': size_value,
                        'sizeUnit': size_unit,
                        'sizeRaw': size_raw,
                        'updated_at': firestore.SERVER_TIMESTAMP
                    }

                    batch.update(doc_ref, update_data)
                    batch_count += 1
                    migration_stats['migrated'] += 1

                    if batch_count >= batch_size:
                        batch.commit()
                        batch = db.batch()
                        batch_count = 0

                except Exception as e:
                    migration_stats['failed'] += 1
                    migration_stats['errors'].append({
                        'product_id': product_doc.id,
                        'product_name': product_data.get('name', 'Unknown'),
                        'size_raw': size_raw,
                        'error': str(e)
                    })

            if batch_count > 0:
                batch.commit()

            return jsonify({
                'success': True,
                'message': f'Migration completed. {migration_stats["migrated"]} products migrated, {migration_stats["already_migrated"]} already migrated, {migration_stats["failed"]} failed',
                'stats': migration_stats
            })

        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def test_size_formatting(self):
        """Test endpoint for size formatting functionality"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            size_strings = data.get('size_strings', [])
            if not size_strings:
                return jsonify({'error': 'No size_strings provided'}), 400

            results = []
            for size_str in size_strings:
                value, unit = parse_size_string(size_str)
                formatted = format_size_display(value, unit)
                results.append({
                    'input': size_str,
                    'parsed_value': value,
                    'parsed_unit': unit,
                    'formatted_display': formatted,
                    'success': value is not None and unit is not None
                })

            return jsonify({
                'success': True,
                'results': results
            })

        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def cleanup_size_display_field(self):
        """Remove redundant sizeDisplay field from existing products"""
        try:
            db = initialize_firebase()
            from firebase_admin import firestore

            products_ref = db.collection('products')
            products = products_ref.stream()

            cleanup_stats = {
                'total_products': 0,
                'cleaned': 0,
                'no_display_field': 0,
                'failed': 0,
                'errors': []
            }

            batch = db.batch()
            batch_count = 0
            batch_size = 100

            for product_doc in products:
                cleanup_stats['total_products'] += 1
                product_data = product_doc.to_dict()

                if 'sizeDisplay' not in product_data:
                    cleanup_stats['no_display_field'] += 1
                    continue

                try:
                    doc_ref = products_ref.document(product_doc.id)
                    update_data = {
                        'sizeDisplay': firestore.DELETE_FIELD,
                        'updated_at': firestore.SERVER_TIMESTAMP
                    }

                    batch.update(doc_ref, update_data)
                    batch_count += 1
                    cleanup_stats['cleaned'] += 1

                    if batch_count >= batch_size:
                        batch.commit()
                        batch = db.batch()
                        batch_count = 0

                except Exception as e:
                    cleanup_stats['failed'] += 1
                    cleanup_stats['errors'].append({
                        'product_id': product_doc.id,
                        'product_name': product_data.get('name', 'Unknown'),
                        'error': str(e)
                    })

            if batch_count > 0:
                batch.commit()

            return jsonify({
                'success': True,
                'message': f'Cleanup completed. {cleanup_stats["cleaned"]} products cleaned, {cleanup_stats["no_display_field"]} already clean, {cleanup_stats["failed"]} failed',
                'stats': cleanup_stats
            })

        except Exception as e:
            return jsonify({'error': str(e)}), 500

    def preview_products_stream(self):
        """Stream duplicate detection logs in real-time using Server-Sent Events"""
        # Auth check for streaming endpoint (not handled by global middleware)
        from flask import g
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            try:
                from services.system.auth_middleware import verify_firebase_token
                id_token = auth_header.split('Bearer ')[1]
                decoded_token = verify_firebase_token(id_token)
                g.user_id = decoded_token.get('uid')
                g.user_email = decoded_token.get('email')
            except Exception as e:
                logger.warning(f"Product stream auth failed: {e}")
                pass

        def generate():
            try:
                if not request.is_json:
                    yield f"data: {json.dumps({'error': 'Content-Type must be application/json'})}\n\n"
                    return

                data = request.get_json()
                products = data.get('products', [])

                if not products:
                    yield f"data: {json.dumps({'error': 'No products provided'})}\n\n"
                    return

                yield f"data: {json.dumps({'type': 'init', 'total': len(products)})}\n\n"

                db = initialize_firebase()

                from backend.features.products.service.product_creation_service import process_ai_classified_product
                from backend.features.products.service.matcher.core import IntelligentProductMatcher
                import threading
                import time as _time

                cache_file = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'cache', 'product_cache.pkl')
                matcher = IntelligentProductMatcher(cache_file=cache_file, similarity_threshold=0.75)
                
                # Refresh cache in a background thread so SSE keepalives can flow
                if len(matcher.product_cache) == 0:
                    yield f"data: {json.dumps({'type': 'log', 'message': '⏳ Loading product cache from database...'})}\n\n"

                    refresh_done = threading.Event()
                    refresh_error = [None]  # mutable container for thread result

                    def _bg_refresh():
                        try:
                            matcher.refresh_cache_from_db(db)
                        except Exception as exc:
                            refresh_error[0] = exc
                        finally:
                            refresh_done.set()

                    t = threading.Thread(target=_bg_refresh, daemon=True)
                    t.start()

                    # Send keepalive heartbeats every 5s while cache loads
                    _MAX_WAIT = 120  # seconds
                    _elapsed = 0
                    while not refresh_done.is_set():
                        refresh_done.wait(timeout=5)
                        _elapsed += 5
                        if not refresh_done.is_set():
                            yield f"data: {json.dumps({'type': 'log', 'message': f'⏳ Still loading product cache... ({_elapsed}s)'})}\n\n"
                            if _elapsed >= _MAX_WAIT:
                                yield f"data: {json.dumps({'type': 'log', 'message': '⚠️ Cache loading timed out, proceeding with empty cache'})}\n\n"
                                break

                    if refresh_error[0]:
                        yield f"data: {json.dumps({'type': 'log', 'message': f'⚠️ Cache refresh error: {refresh_error[0]}'})}\n\n"

                yield f"data: {json.dumps({'type': 'log', 'message': f'🔍 Matcher ready with {len(matcher.product_cache)} cached products'})}\n\n"

                stats = {
                    'total': len(products),
                    'processed': 0,
                    'duplicates': 0,
                    'new_products': 0,
                    'tier1_matches': 0,
                    'tier2_matches': 0,
                    'tier3_matches': 0
                }

                for product_data in products:
                    try:
                        result = process_ai_classified_product(product_data, db, dry_run=True)

                        if result['success']:
                            product_doc = result['product_doc']
                            product_name = product_doc.get('name', '')
                            product_brand = product_doc.get('brand_name', '')
                            product_size = product_doc.get('size', '')

                            log_msg = f"🔍 Checking: '{product_name}' | Brand: '{product_brand or 'N/A'}' | Size: '{product_size or 'N/A'}'"
                            yield f"data: {json.dumps({'type': 'log', 'message': log_msg})}\n\n"

                            all_matches = matcher.find_similar_products(product_doc, limit=10)

                            if all_matches:
                                best_match = all_matches[0]
                                is_duplicate = best_match.similarity_score >= 0.70

                                match_name = best_match.matched_product.get('name', '')
                                match_brand = best_match.matched_product.get('brand_name', '')
                                match_size = best_match.matched_product.get('size', '')

                                if best_match.similarity_score >= 0.90:
                                    stats['tier1_matches'] += 1
                                    match_tier = "Tier 1 (90%+)"
                                elif best_match.similarity_score >= 0.80:
                                    stats['tier2_matches'] += 1
                                    match_tier = "Tier 2 (80-89%)"
                                else:
                                    stats['tier3_matches'] += 1
                                    match_tier = "Tier 3 (70-79%)"

                                if is_duplicate:
                                    stats['duplicates'] += 1
                                    duplicate_msg = f"   └─ ⚠️ DUPLICATE DETECTED ({best_match.similarity_score*100:.1f}%)"
                                    yield f"data: {json.dumps({'type': 'log', 'message': duplicate_msg})}\n\n"
                                    match_msg = f"   └─ 🔎 Match: '{match_name}' | Brand: '{match_brand or 'N/A'}' | Size: '{match_size or 'N/A'}'"
                                    yield f"data: {json.dumps({'type': 'log', 'message': match_msg})}\n\n"
                                    yield f"data: {json.dumps({'type': 'log', 'message': f'   └─ 🏷️ {match_tier}'})}\n\n"
                                else:
                                    stats['new_products'] += 1
                                    yield f"data: {json.dumps({'type': 'log', 'message': '   └─ ❌ No matches found'})}\n\n"
                                    yield f"data: {json.dumps({'type': 'log', 'message': '   └─ 🆕 Will be added as new product'})}\n\n"

                                yield f"data: {json.dumps({'type': 'log', 'message': ''})}\n\n"
                            else:
                                stats['new_products'] += 1
                                yield f"data: {json.dumps({'type': 'log', 'message': '   └─ ❌ No matches found'})}\n\n"
                                yield f"data: {json.dumps({'type': 'log', 'message': '   └─ 🆕 Will be added as new product'})}\n\n"
                                yield f"data: {json.dumps({'type': 'log', 'message': ''})}\n\n"

                            stats['processed'] += 1

                            progress = {
                                'type': 'progress',
                                'stats': stats
                            }
                            logger.debug("Sending progress update", extra={
                                "processed": stats['processed'],
                                "tier1_matches": stats['tier1_matches'],
                                "tier2_matches": stats['tier2_matches'],
                                "tier3_matches": stats['tier3_matches']
                            })
                            yield f"data: {json.dumps(progress)}\n\n"

                    except Exception as e:
                        error_msg = f"⚠️ Error processing product: {str(e)}"
                        yield f"data: {json.dumps({'type': 'log', 'message': error_msg})}\n\n"

                logger.info("Bulk upload completed", extra={
                    "total": stats['total'],
                    "duplicates": stats['duplicates'],
                    "tier1_matches": stats['tier1_matches'],
                    "tier2_matches": stats['tier2_matches'],
                    "tier3_matches": stats['tier3_matches']
                })
                yield f"data: {json.dumps({'type': 'complete', 'stats': stats})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        return Response(stream_with_context(generate()), mimetype='text/event-stream')

    def refresh_matcher_cache(self):
        """Diagnostic/admin endpoint to refresh the product matcher cache from Firestore."""
        import time as _time
        try:
            db = initialize_firebase()
            from backend.features.products.service.matcher.core import IntelligentProductMatcher

            cache_file = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'cache', 'product_cache.pkl')
            matcher = IntelligentProductMatcher(cache_file=cache_file, similarity_threshold=0.75)

            before_count = len(matcher.product_cache)
            logger.info("Manual matcher cache refresh requested", extra={"before_count": before_count})

            start = _time.time()
            matcher.refresh_cache_from_db(db)
            elapsed = _time.time() - start

            after_count = len(matcher.product_cache)
            logger.info("Matcher cache refreshed", extra={
                "before_count": before_count,
                "after_count": after_count,
                "elapsed_seconds": round(elapsed, 2)
            })

            return jsonify({
                'success': True,
                'before_count': before_count,
                'after_count': after_count,
                'elapsed_seconds': round(elapsed, 2)
            })
        except Exception as e:
            logger.error(f"Matcher cache refresh failed: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def upload_product_image(self):
        """Upload a product image file"""
        try:
            logger.info("🔷 [Backend] Upload image endpoint called")

            if 'image' not in request.files:
                logger.error("❌ [Backend] No image file in request")
                return jsonify({'success': False, 'error': 'No image file provided'}), 400

            file = request.files['image']
            product_id = request.form.get('product_id', '')
            old_image_url = request.form.get('old_image_url', '')

            logger.info("🔷 [Backend] Upload request details", extra={
                "uploaded_filename": file.filename,
                "content_type": file.content_type,
                "product_id": product_id,
                "has_old_image": bool(old_image_url)
            })

            if file.filename == '':
                logger.error("❌ [Backend] Empty filename")
                return jsonify({'success': False, 'error': 'No file selected'}), 400

            if old_image_url and product_id:
                logger.info("🗑️ [Backend] Deleting old product image before upload", extra={
                    "product_id": product_id,
                    "old_image_url": old_image_url
                })
                deletion_result = self.image_service.delete_product_image(product_id, old_image_url)
                logger.info(f"🗑️ [Backend] Deletion result: {deletion_result}")

            logger.info("⬆️ [Backend] Starting image upload to Firebase")
            result = self.image_service.upload_product_image(file, product_id)
            logger.info("⬆️ [Backend] Upload service returned", extra={"result": result})

            if result['success']:
                logger.info("✅ [Backend] Product image uploaded successfully", extra={
                    "product_id": product_id,
                    "image_url": result.get('image_url')
                })
                return jsonify(result), 200
            else:
                logger.error("❌ [Backend] Upload failed", extra={"result": result})
                return jsonify(result), 400

        except Exception as e:
            logger.error("❌ [Backend] Exception in upload_product_image", extra={
                "error": str(e),
                "error_type": type(e).__name__
            })
            log_error(logger, e, {"context": "upload_product_image"})
            return jsonify({'success': False, 'error': str(e)}), 500

    def download_product_image(self):
        """Download an image from URL and store it"""
        try:
            data = request.get_json()
            image_url = data.get('image_url', '').strip()
            product_id = data.get('product_id', '')

            if not image_url:
                return jsonify({'success': False, 'error': 'No image URL provided'}), 400

            result = self.image_service.download_and_store_image(image_url, product_id)

            if result['success']:
                logger.info("Product image downloaded", extra={
                    "product_id": product_id,
                    "source_url": image_url,
                    "stored_url": result.get('image_url')
                })
                return jsonify(result), 200
            else:
                return jsonify(result), 400

        except Exception as e:
            log_error(logger, e, {"context": "download_product_image"})
            return jsonify({'success': False, 'error': str(e)}), 500

    def test_size_parsing(self):
        try:
            data = request.get_json() or {}
            strings = data.get('size_strings', [])
            if not strings: return jsonify({'error': 'No size_strings provided'}), 400
            
            results = []
            for s in strings:
                v, u = parse_size_string(s)
                results.append({'input': s, 'parsed_value': v, 'parsed_unit': u, 'success': v is not None})
            return jsonify({'success': True, 'results': results})
        except Exception as e:
             return jsonify({'error': str(e)}), 500

    def build_scalable_index(self):
        """
        Build/rebuild the scalable product index for 1M+ products.
        
        This creates inverted indexes in Redis for fast candidate retrieval.
        Should be run once initially and then incrementally as products are added.
        """
        try:
            from backend.services.system.product_index_service import get_product_index
            
            index_service = get_product_index()
            
            if not index_service.is_available():
                return jsonify({
                    'success': False,
                    'error': 'Redis not available for scalable indexing'
                }), 503
            
            # Get Firestore client
            db = initialize_firebase()
            
            logger.info("Starting scalable index build")
            
            # Build the index
            stats = index_service.bulk_index_from_db(db, batch_size=500)
            
            return jsonify({
                'success': True,
                'message': f'Scalable index built successfully',
                'stats': stats
            })
            
        except Exception as e:
            log_error(logger, e, {"context": "build_scalable_index"})
            return jsonify({'success': False, 'error': str(e)}), 500
    
    def get_index_stats(self):
        """Get statistics about the product index."""
        try:
            from backend.services.system.product_index_service import get_product_index
            from backend.features.products.service.matcher import IntelligentProductMatcher
            
            index_service = get_product_index()
            matcher = IntelligentProductMatcher()
            
            return jsonify({
                'success': True,
                'index_stats': index_service.get_index_stats(),
                'cache_stats': matcher.get_cache_stats(),
                'scalable_mode': getattr(matcher, 'scalable_mode', False),
                'scalable_threshold': 10000
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    def reindex_opensearch(self):
        """Reindex all products in OpenSearch for high-speed search."""
        try:
            from services.products.opensearch_product_service import get_opensearch_product_service
            
            os_service = get_opensearch_product_service()
            if not os_service.is_available():
                return jsonify({
                    'success': False,
                    'error': 'OpenSearch is not available'
                }), 503
            
            # Get all products from Firestore
            db = initialize_firebase()
            products = []
            for doc in db.collection('products').stream():
                product_data = doc.to_dict()
                product_data['id'] = doc.id
                products.append(product_data)
            
            logger.info(f"Reindexing {len(products)} products in OpenSearch")
            
            # Reindex all products
            result = os_service.reindex_all_products(products)
            
            return jsonify({
                'success': result.get('success', False),
                'indexed': result.get('indexed', 0),
                'errors': result.get('errors', 0),
                'total_products': len(products)
            })
            
        except ImportError:
            return jsonify({
                'success': False,
                'error': 'OpenSearch product service not available'
            }), 503
        except Exception as e:
            logger.error(f"Reindex failed: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def get_opensearch_stats(self):
        """Get OpenSearch product index statistics."""
        try:
            from services.products.opensearch_product_service import get_opensearch_product_service
            
            os_service = get_opensearch_product_service()
            if not os_service.is_available():
                return jsonify({
                    'success': False,
                    'available': False,
                    'error': 'OpenSearch is not available'
                })
            
            stats = os_service.get_index_stats()
            stats['available'] = True
            return jsonify(stats)
            
        except ImportError:
            return jsonify({
                'success': False,
                'available': False,
                'error': 'OpenSearch product service not available'
            })
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

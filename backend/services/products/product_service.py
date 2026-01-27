import time
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List

import firebase_admin
from firebase_admin import firestore

from services.firebase.firebase_client import initialize_firebase
from services.system.logger_service import get_logger, log_product_operation, log_error
from services.system.initialization import get_classifier
from utils.product_utils import generate_product_id, parse_size_string
from services.products.product_image_service import ProductImageService
from services.products.product_repository import product_repository

logger = get_logger(__name__)

class ProductService:
    def __init__(self):
        self.db = initialize_firebase()
        self.image_service = ProductImageService()
    
    def get_product_by_id(self, product_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific product by ID.
        Returns None if product not found.
        """
        doc = self.db.collection('products').document(product_id).get()
        if not doc.exists:
            return None
            
        product_data = doc.to_dict()
        product_data['id'] = doc.id
        return product_data

    def update_product(self, product_id: str, update_data: Dict[str, Any], current_data: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        """
        Update product data, handling ID regeneration, migration, and cache updates.
        
        Args:
            product_id: Current product ID
            update_data: Dictionary of fields to update
            current_data: Current product data from DB
            
        Returns:
            Tuple containing:
            - final_product_data: The updated product data
            - id_changed: Boolean indicating if the product ID changed
        """
        
        # 1. Parse size if provided
        if 'sizeRaw' in update_data and update_data['sizeRaw']:
            size_value, size_unit = parse_size_string(update_data['sizeRaw'])
            if size_value is not None and size_unit:
                update_data['size'] = size_value
                update_data['sizeUnit'] = size_unit
            else:
                update_data['size'] = update_data['sizeRaw']
                update_data['sizeUnit'] = None
                
        # 2. Check for ID change
        current_brand = current_data.get('brand_name', '')
        current_name = current_data.get('name', '')
        current_size_raw = current_data.get('sizeRaw', '') or current_data.get('size', '')
        
        new_brand = update_data.get('brand_name', current_brand)
        new_name = update_data.get('name', current_name)
        new_size_raw = update_data.get('sizeRaw', current_size_raw)
        
        new_product_id = generate_product_id(new_brand, new_name, new_size_raw)
        id_changed = (new_product_id != product_id)
        
        update_data['updated_at'] = firestore.SERVER_TIMESTAMP
        
        final_product_data = {}
        
        # 3. Perform Update or Migration
        if id_changed:
            self._migrate_product(product_id, new_product_id, current_data, update_data)
            final_product_data = current_data.copy()
            final_product_data.update(update_data)
            final_product_data['id'] = new_product_id
        else:
            self._update_in_place(product_id, update_data)
            # Retrieve fresh data
            doc = self.db.collection('products').document(product_id).get()
            final_product_data = doc.to_dict()
            final_product_data['id'] = product_id
            
        # 4. Update AI Cache
        self._update_ai_cache(final_product_data)
        
        # 5. Migrate Prices (if ID changed) or Update Prices (if ID unchanged)
        if id_changed:
            self._migrate_prices(product_id, new_product_id, final_product_data)
        else:
            self._update_price_details(product_id, final_product_data)
            
        return final_product_data, id_changed

    def delete_product(self, product_id: str) -> None:
        """
        Delete a specific product and its associated image from Firebase Storage.
        Raises ValueError if product not found.
        """
        # Check if product exists
        doc_ref = self.db.collection('products').document(product_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise ValueError('Product not found')
        
        # Get product data to retrieve image URL
        product_data = doc.to_dict()
        image_url = product_data.get('image_url', '')
        
        # INTELLIGENT IMAGE CLEANUP: Delete image from Firebase Storage
        if image_url:
            logger.info("Deleting image for product", extra={"product_id": product_id})
            image_deleted = self.image_service.delete_product_image(product_id, image_url)
            
            if image_deleted:
                logger.info("Image successfully deleted from Firebase Storage", extra={"product_id": product_id})
            else:
                logger.warning("Image deletion failed or image not in Firebase Storage", extra={"product_id": product_id})
        
        # Delete the product document
        doc_ref.delete()
        
        # Invalidate cache to ensure UI updates immediately
        self._invalidate_cache()

    def delete_all_products(self) -> Dict[str, Any]:
        """
        Delete all products from the database and their images.
        Returns statistics about the deletion.
        """
        # Get all products for counting and image cleanup
        products_ref = self.db.collection('products')
        products = list(products_ref.stream())
        total_count = len(products)
        
        if total_count == 0:
            return {
                'success': True,
                'message': 'No products found to delete',
                'deleted_count': 0
            }
        
        # INTELLIGENT IMAGE CLEANUP: Delete all product images first
        logger.info("Cleaning up product images from Firebase Storage", extra={"total_count": total_count})
        images_deleted = 0
        images_failed = 0
        
        for doc in products:
            try:
                product_data = doc.to_dict()
                product_id = doc.id
                image_url = product_data.get('image_url', '')
                
                if image_url:
                    success = self.image_service.delete_product_image(product_id, image_url)
                    if success:
                        images_deleted += 1
                    else:
                        images_failed += 1
            except Exception as e:
                logger.warning("Failed to delete image for product", extra={"product_id": doc.id, "error": str(e)})
                images_failed += 1
        
        logger.info("Bulk image deletion completed", extra={"deleted": images_deleted, "failed": images_failed})
        
        # Delete all products in batches
        batch_size = 500  # Firestore batch limit
        deleted_count = 0
        
        for i in range(0, total_count, batch_size):
            batch = self.db.batch()
            batch_products = products[i:i + batch_size]
            
            for doc in batch_products:
                batch.delete(doc.reference)
            
            batch.commit()
            deleted_count += len(batch_products)

        # Invalidate cache
        self._invalidate_cache()
            
        return {
            'success': True,
            'message': f'Successfully deleted all {deleted_count} products',
            'deleted_count': deleted_count,
            'images_deleted': images_deleted,
            'images_failed': images_failed
        }

    def _invalidate_cache(self):
        """Invalidate product caches."""
        product_repository.invalidate_product_stats()
        product_repository.invalidate_product_lists()

    def _migrate_product(self, old_id: str, new_id: str, current_data: Dict, update_data: Dict):
        """Handle migration from old product ID to new product ID."""
        logger.warning(
            "Product ID will change - initiating migration",
            extra={
                "old_id": old_id,
                "new_id": new_id,
                "operation": "MIGRATE"
            }
        )
        
        # Create new document
        new_doc_ref = self.db.collection('products').document(new_id)
        new_product_data = current_data.copy()
        new_product_data.update(update_data)
        new_product_data['id'] = new_id
        new_product_data['migrated_from'] = old_id
        new_product_data['migration_timestamp'] = firestore.SERVER_TIMESTAMP
        
        new_doc_ref.set(new_product_data)
        log_product_operation(logger, "CREATE", new_id, migration_from=old_id)
        
        # Delete old document
        self.db.collection('products').document(old_id).delete()
        log_product_operation(logger, "DELETE", old_id, migration_to=new_id)

    def _update_in_place(self, product_id: str, update_data: Dict):
        """Update product document in place."""
        logger.info("Product ID unchanged - updating in place", extra={"product_id": product_id})
        self.db.collection('products').document(product_id).update(update_data)

    def _update_ai_cache(self, product_data: Dict):
        """Update the classifier cache with user edits."""
        classifier = get_classifier()
        if not (classifier and hasattr(classifier, 'cache') and classifier.cache):
            return

        try:
            original_name = product_data.get('original_name', product_data.get('name', ''))
            if not original_name:
                return

            # Find cache key
            base_cache_key = classifier.cache._generate_cache_key(original_name, "", "")
            actual_cache_key = None
            for key in classifier.cache.cache.keys():
                if key == base_cache_key or key.startswith(f"{base_cache_key}_"):
                    actual_cache_key = key
                    break
            
            if actual_cache_key and actual_cache_key in classifier.cache.cache:
                entry = classifier.cache.cache[actual_cache_key]
                result = entry.get('result', {})
                
                # Update result
                updated_result = result.copy()
                updated_result.update({
                    'product_type': product_data.get('category', result.get('product_type', '')),
                    'brand_name': product_data.get('brand_name', result.get('brand_name', '')),
                    'product_name': product_data.get('name', result.get('product_name', '')),
                    'size': product_data.get('sizeRaw') or product_data.get('size', result.get('size', '')),
                    'variety': product_data.get('variety', result.get('variety', '')),
                    'user_edited': True,
                    'edit_timestamp': datetime.now().isoformat()
                })
                
                # Preserve original
                if 'original_ai_result' not in updated_result:
                    updated_result['original_ai_result'] = {
                        'product_type': result.get('product_type', ''),
                        'brand_name': result.get('brand_name', ''),
                        'product_name': result.get('product_name', ''),
                        'size': result.get('size', ''),
                        'variety': result.get('variety', '')
                    }
                
                entry['result'] = updated_result
                entry['last_accessed'] = datetime.now().isoformat()
                classifier.cache._save_cache()
                logger.info("Cache updated with product edit", extra={"original_name": original_name})
                
        except Exception as e:
            log_error(logger, e, context={"operation": "cache_update", "product_name": original_name})

    def _migrate_prices(self, old_id: str, new_id: str, product_data: Dict):
        """Migrate price records to new product ID."""
        try:
            logger.warning("Starting price migration", extra={"old_id": old_id, "new_id": new_id})
            
            migration_data = {
                'productId': new_id,
                'productName': product_data.get('name', ''),
                'brand_name': product_data.get('brand_name', ''),
                'category': product_data.get('category', ''),
                'sizeRaw': product_data.get('sizeRaw', product_data.get('size', ''))
            }
            
            # Migrate current_prices
            prices = self.db.collection('current_prices').where('productId', '==', old_id).stream()
            count = 0
            for doc in prices:
                doc.reference.update(migration_data)
                count += 1
            
            # Migrate price_history
            history = self.db.collection('price_history').where('productId', '==', old_id).stream()
            hist_count = 0
            for doc in history:
                doc.reference.update(migration_data)
                hist_count += 1
                
            logger.info("Price migration completed", extra={"prices_migrated": count, "history_migrated": hist_count})
            
        except Exception as e:
            log_error(logger, e, context={"operation": "price_migration", "old_id": old_id})

    def _update_price_details(self, product_id: str, product_data: Dict):
        """Update price records with new product details even if ID is unchanged."""
        try:
            logger.info("Updating price records with new product details", extra={"product_id": product_id})
            
            update_data = {
                'productName': product_data.get('name', ''),
                'brand_name': product_data.get('brand_name', ''),
                'category': product_data.get('category', ''),
                'sizeRaw': product_data.get('sizeRaw', product_data.get('size', ''))
            }
            
            # Update current_prices
            prices = self.db.collection('current_prices').where('productId', '==', product_id).stream()
            count = 0
            for doc in prices:
                doc.reference.update(update_data)
                count += 1
            
            # Update price_history
            history = self.db.collection('price_history_monthly').where('productId', '==', product_id).stream()
            hist_count = 0
            for doc in history:
                doc.reference.update(update_data)
                hist_count += 1
                
            logger.info("Price details updated", extra={"prices": count, "history": hist_count})
            
        except Exception as e:
            log_error(logger, e, context={"operation": "price_details_update", "product_id": product_id})

    def get_product_stats(self) -> Tuple[Dict[str, Any], bool]:
        """
        Get product collection statistics.
        Returns (stats, cache_hit)
        """
        return product_repository.get_product_stats()

    def list_products(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str = '',
        category: str = '',
        brand: str = '',
    ) -> Tuple[Dict[str, Any], bool]:
        """
        List products with filtering and pagination.
        Returns (result, cache_hit)
        """
        return product_repository.list_products(
            page=page,
            per_page=per_page,
            search=search,
            category=category,
            brand=brand
        )

    def get_products_missing_prices(self) -> Tuple[List[Dict[str, Any]], bool]:
        """Get list of products without current price."""
        return product_repository.get_products_missing_prices()

    def invalidate_product_stats(self) -> None:
        """Invalidate product statistics cache."""
        product_repository.invalidate_product_stats()

    def invalidate_product_lists(self) -> None:
        """Invalidate product list cache."""
        product_repository.invalidate_product_lists()



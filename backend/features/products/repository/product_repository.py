"""Repository layer for product and pricing data with Redis caching."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

# from google.cloud import firestore
from common.base.base_repository import BaseRepository
from services.system.cache_service import get_cache_service
from services.firebase.firebase_client import initialize_firebase
from services.system import cache_keys
from services.system.logger_service import get_logger
from backend.features.products.service.product_search_service import product_search_service

# Import OpenSearch product service for high-speed search
try:
    from services.products.opensearch_product_service import get_opensearch_product_service
    OPENSEARCH_AVAILABLE = True
except ImportError:
    OPENSEARCH_AVAILABLE = False

logger = get_logger(__name__)


class ProductRepository(BaseRepository[Dict[str, Any]]):
    def __init__(self) -> None:
        self.cache = get_cache_service()

    def _db(self):
        return initialize_firebase()

    # --- BaseRepository Implementation ---
    def find_by_id(self, id: str) -> Optional[Dict[str, Any]]:
        doc = self._db().collection('products').document(id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        data['id'] = doc.id
        return data

    def save(self, entity: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save or update a product. 
        If 'id' is in entity, set/update that doc.
        Automatically indexes to OpenSearch for fast search.
        """
        if 'id' not in entity:
            raise ValueError("Entity must have an ID")
        
        doc_ref = self._db().collection('products').document(entity['id'])
        doc_ref.set(entity, merge=True)
        
        # Index to OpenSearch for fast search
        self._index_product_to_opensearch(entity)
        
        return entity

    def delete(self, id: str) -> None:
        self._db().collection('products').document(id).delete()
        # Remove from OpenSearch index
        self._delete_product_from_opensearch(id)

    def update(self, id: str, data: Dict[str, Any]) -> None:
        self._db().collection('products').document(id).update(data)
        # Re-index updated product to OpenSearch
        updated_product = self.find_by_id(id)
        if updated_product:
            self._index_product_to_opensearch(updated_product)
    
    def _index_product_to_opensearch(self, product: Dict[str, Any]) -> None:
        """Index a single product to OpenSearch for fast search."""
        if not OPENSEARCH_AVAILABLE:
            logger.debug("OpenSearch not available - skipping product indexing")
            return
        try:
            os_service = get_opensearch_product_service()
            if os_service and os_service.is_available():
                success = os_service.index_product(product)
                if success:
                    logger.info(f"[OpenSearch] Indexed product: {product.get('id')} - {product.get('name', 'N/A')[:50]}")
                else:
                    logger.warning(f"[OpenSearch] Failed to index product: {product.get('id')}")
            else:
                logger.debug(f"[OpenSearch] Service not available, skipping index for product: {product.get('id')}")
        except Exception as e:
            logger.warning(f"[OpenSearch] Error indexing product {product.get('id')}: {e}")
    
    def _delete_product_from_opensearch(self, product_id: str) -> None:
        """Delete a product from OpenSearch index."""
        if not OPENSEARCH_AVAILABLE:
            logger.debug("OpenSearch not available - skipping product deletion")
            return
        try:
            os_service = get_opensearch_product_service()
            if os_service and os_service.is_available():
                success = os_service.delete_product(product_id)
                if success:
                    logger.info(f"[OpenSearch] Deleted product from index: {product_id}")
                else:
                    logger.warning(f"[OpenSearch] Failed to delete product: {product_id}")
            else:
                logger.debug(f"[OpenSearch] Service not available, skipping delete for product: {product_id}")
        except Exception as e:
            logger.warning(f"[OpenSearch] Error deleting product {product_id}: {e}")

    # ------------------------------------------------------------------
    # Transactional / Batch Operations (Migrated from Service)
    
    def migrate_product_document(self, old_id: str, new_id: str, new_data: Dict[str, Any]) -> None:
        """
        Atomically (if possible, or closely ordered) create new doc and delete old doc.
        """
        batch = self._db().batch()
        
        new_doc_ref = self._db().collection('products').document(new_id)
        old_doc_ref = self._db().collection('products').document(old_id)
        
        batch.set(new_doc_ref, new_data)
        batch.delete(old_doc_ref)
        
        batch.commit()

    def update_related_prices(self, product_id: str, update_data: Dict[str, Any]) -> Tuple[int, int]:
        """
        Update denormalized product data in 'current_prices' and 'price_history_monthly'.
        """
        db = self._db()
        
        # Update current_prices
        prices = db.collection('current_prices').where('productId', '==', product_id).stream()
        count = 0
        for doc in prices:
            doc.reference.update(update_data)
            count += 1
        
        # Update price_history_monthly
        history = db.collection('price_history_monthly').where('productId', '==', product_id).stream()
        hist_count = 0
        for doc in history:
            doc.reference.update(update_data)
            hist_count += 1
            
        return count, hist_count

    def migrate_related_prices(self, old_id: str, new_id: str, migration_data: Dict[str, Any]) -> Tuple[int, int]:
        """
        Migrate price records to new product ID.
        """
        db = self._db()
        
        # Migrate current_prices
        prices = db.collection('current_prices').where('productId', '==', old_id).stream()
        count = 0
        for doc in prices:
            doc.reference.update(migration_data)
            count += 1
        
        # Migrate price_history
        # Using 'price_history' to match legacy logic
        history = db.collection('price_history').where('productId', '==', old_id).stream()
        hist_count = 0
        for doc in history:
            doc.reference.update(migration_data)
            hist_count += 1
            
        return count, hist_count

    def stream_all_products(self) -> List[Any]:
        return list(self._db().collection('products').stream())

    def delete_batch(self, doc_refs: List[Any]) -> None:
        if not doc_refs:
            return
            
        # Limit to 500 per batch (Firestore limit)
        chunk_size = 500
        for i in range(0, len(doc_refs), chunk_size):
            chunk = doc_refs[i:i + chunk_size]
            batch = self._db().batch()
            for doc in chunk:
                batch.delete(doc.reference)
            batch.commit()

    # ------------------------------------------------------------------
    # Cache Helpers
    def _cache_get(self, key: str) -> Tuple[Optional[Any], bool]:
        if self.cache and self.cache.is_available():
            value = self.cache.get_json(key)
            if value is not None:
                return value, True
        return None, False

    def _cache_set(self, key: str, value: Any, ttl_seconds: int = 600) -> None:
        if self.cache and self.cache.is_available():
            self.cache.set_json(key, value, ttl_seconds=ttl_seconds)

    # ------------------------------------------------------------------
    # Products Stats
    def get_product_stats(self) -> Tuple[Dict[str, Any], bool]:
        key = cache_keys.product_stats_key()
        cached, hit = self._cache_get(key)
        if hit:
            return cached, True

        db = self._db()
        products_ref = db.collection('products')
        products = list(products_ref.stream())

        stats = {
            'total_products': len(products),
            'categories': {},
            'brands': {},
            'has_brand': 0,
            'no_brand': 0,
        }

        for doc in products:
            data = doc.to_dict()
            category = data.get('category', 'unknown')
            stats['categories'][category] = stats['categories'].get(category, 0) + 1

            brand = data.get('brand_name', '')
            if brand:
                stats['brands'][brand] = stats['brands'].get(brand, 0) + 1
                stats['has_brand'] += 1
            else:
                stats['no_brand'] += 1

        self._cache_set(key, stats, ttl_seconds=600)
        return stats, False

    # ------------------------------------------------------------------
    # Product Listing
    def list_products(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str = '',
        category: str = '',
        brand: str = '',
    ) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.product_list_key(page, per_page, search, category, brand)
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        db = self._db()
        products_ref = db.collection('products')

        if category:
            products_ref = products_ref.where('category', '==', category)
        if brand:
            products_ref = products_ref.where('brand_name', '==', brand)

        # Search flow - use OpenSearch for high-performance search across 10,000+ products
        if search:
            products = []
            total = 0
            search_method = 'none'
            
            # Try OpenSearch first (fastest, supports fuzzy matching on large datasets)
            if OPENSEARCH_AVAILABLE:
                try:
                    os_service = get_opensearch_product_service()
                    if os_service.is_available():
                        logger.info(f"[Search] Using OpenSearch for query: '{search[:50]}' (page={page}, per_page={per_page})")
                        offset = (page - 1) * per_page
                        result = os_service.search_products(
                            query=search,
                            brand=brand or None,
                            category=category or None,
                            limit=per_page,
                            offset=offset
                        )
                        if result.get('products'):
                            products = result['products']
                            total = result.get('total', len(products))
                            search_method = 'opensearch'
                            logger.info(f"[Search] OpenSearch returned {len(products)} products (total: {total})")
                    else:
                        logger.warning("[Search] OpenSearch service not available, falling back to intelligent matcher")
                except Exception as exc:
                    logger.warning(f"[Search] OpenSearch product search failed: {exc} - falling back to intelligent matcher")
            else:
                logger.debug("[Search] OpenSearch not configured, using intelligent matcher")
            
            # Fallback to intelligent matcher if OpenSearch didn't return results
            if not products:
                try:
                    limit = min(200, per_page * page + per_page)
                    matches = product_search_service.search_products(
                        query=search,
                        brand=brand or None,
                        category=category or None,
                        limit=limit,
                    )
                    if matches:
                        total = len(matches)
                        start = (page - 1) * per_page
                        end = start + per_page
                        products = matches[start:end]
                        search_method = 'intelligent_matcher'
                        logger.info(f"[Search] Intelligent matcher returned {len(products)} products (total: {total})")
                except Exception as exc:
                    logger.warning(f"[Search] Intelligent matcher search failed: {exc} - falling back to simple search")
            
            # Last-resort fallback: cached products with basic string matching.
            if not products:
                logger.info(f"[Search] Using simple string matching fallback for query: '{search[:50]}'")
                fallback_cache_key = cache_keys.product_list_key(1, 500, '', category, brand)
                cached_list, hit = self._cache_get(fallback_cache_key)
                
                if hit and cached_list and 'products' in cached_list:
                    all_products = cached_list['products']
                    logger.debug(f"[Search] Using {len(all_products)} cached products for simple search")
                else:
                    # Limited query to prevent timeout
                    logger.warning("[Search] No cache available, using limited Firestore query (500 docs)")
                    query = products_ref.limit(500)
                    all_products = []
                    for doc in query.stream():
                        product_data = doc.to_dict()
                        product_data['id'] = doc.id
                        all_products.append(product_data)

                # Basic string matching.
                search_lower = search.lower()
                matches = [
                    p for p in all_products
                    if search_lower in p.get('name', '').lower()
                    or search_lower in p.get('brand_name', '').lower()
                    or search_lower in p.get('original_name', '').lower()
                ]
                
                total = len(matches)
                start = (page - 1) * per_page
                end = start + per_page
                products = matches[start:end]
                search_method = 'simple_fallback'
                logger.info(f"[Search] Simple fallback returned {len(products)} products (total: {total})")
        else:
            # Optimized Firestore Query with Count Aggregation
            try:
                # 1. Get total count efficiently (Server-side aggregation)
                count_query = products_ref.count()
                count_snapshot = count_query.get()
                total = int(count_snapshot[0][0].value)
                
                # 2. Get paginated results directly
                start = (page - 1) * per_page
                query = products_ref.offset(start).limit(per_page)
                
                products = []
                for doc in query.stream():
                    product_data = doc.to_dict()
                    product_data['id'] = doc.id
                    products.append(product_data)
                    
            except Exception as e:
                logger.warning(
                    "Error fetching paginated products",
                    extra={"error": str(e)},
                )
                total = 0
                products = []

        result = {
            'success': True,
            'products': products,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'pages': math.ceil(total / per_page) if per_page else 0,
            },
        }

        self._cache_set(cache_key, result, ttl_seconds=300)
        return result, False

    # ------------------------------------------------------------------
    # Missing Prices
    def get_products_missing_prices(self) -> Tuple[List[Dict[str, Any]], bool]:
        key = "product:missing_prices"
        cached, hit = self._cache_get(key)
        if hit:
            return cached, True

        db = self._db()

        # Get all products
        products_ref = db.collection('products')
        products = {doc.id: doc.to_dict() for doc in products_ref.stream()}

        # Get all current prices
        prices_ref = db.collection('current_prices')
        priced_product_ids = set()
        for doc in prices_ref.stream():
            data = doc.to_dict()
            pid = data.get('productId')
            if pid:
                priced_product_ids.add(pid)

        # Find missing
        missing_products = []
        for pid, data in products.items():
            if pid not in priced_product_ids:
                data['id'] = pid
                missing_products.append(data)

        self._cache_set(key, missing_products, ttl_seconds=300)
        return missing_products, False

    # ------------------------------------------------------------------
    # Invalidations
    def invalidate_product_stats(self) -> None:
        if self.cache and self.cache.is_available():
            self.cache.delete(cache_keys.product_stats_key())

    def invalidate_product_lists(self) -> None:
        if self.cache and self.cache.is_available():
            self.cache.invalidate_prefix('product:list:')

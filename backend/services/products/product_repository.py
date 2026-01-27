"""Repository layer for product and pricing data with Redis caching."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from services.system.cache_service import get_cache_service
from services.firebase.firebase_client import initialize_firebase
from services.system import cache_keys
from services.system.logger_service import get_logger
from backend.features.products.service.product_search_service import product_search_service

logger = get_logger(__name__)


class ProductRepository:
    def __init__(self) -> None:
        self.cache = get_cache_service()

    # ------------------------------------------------------------------
    # Helpers
    def _cache_get(self, key: str) -> Tuple[Optional[Any], bool]:
        if self.cache and self.cache.is_available():
            value = self.cache.get_json(key)
            if value is not None:
                return value, True
        return None, False

    def _cache_set(self, key: str, value: Any, ttl_seconds: int = 600) -> None:
        if self.cache and self.cache.is_available():
            self.cache.set_json(key, value, ttl_seconds=ttl_seconds)

    def _db(self):
        return initialize_firebase()

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

        # Search flow
        if search:
            try:
                limit = min(200, per_page * page + per_page)
                matches = product_search_service.search_products(
                    query=search,
                    brand=brand or None,
                    category=category or None,
                    limit=limit,
                )
            except Exception as exc:
                logger.warning(
                    "Advanced product search failed, falling back to legacy filter",
                    extra={"error": str(exc)},
                )
                matches = []

            if not matches:
                try:
                    matches = []
                    for doc in products_ref.stream():
                        product_data = doc.to_dict()
                        product_data['id'] = doc.id
                        matches.append(product_data)
                except Exception as e:
                    logger.warning(
                        "No products collection or error fetching products",
                        extra={"error": str(e)},
                    )
                    matches = []

                search_lower = search.lower()
                matches = [
                    p
                    for p in matches
                    if search_lower in p.get('name', '').lower()
                    or search_lower in p.get('brand_name', '').lower()
                    or search_lower in p.get('original_name', '').lower()
                ]

            total = len(matches)
            start = (page - 1) * per_page
            end = start + per_page
            products = matches[start:end]
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


product_repository = ProductRepository()

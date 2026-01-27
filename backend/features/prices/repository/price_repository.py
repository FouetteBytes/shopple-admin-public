"""
Repository for price and history data with Redis caching.
Part of the Price feature.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from google.cloud.firestore_v1 import FieldFilter

from common.base.base_repository import BaseRepository
from services.system import cache_keys
from services.system.cache_service import get_cache_service
from services.firebase.firebase_client import initialize_firebase
from services.system.logger_service import get_logger
from utils.string_utils import clean_product_name

logger = get_logger(__name__)

class PriceRepository(BaseRepository[Dict[str, Any]]):
    def __init__(self) -> None:
        self.cache = get_cache_service()

    # --- BaseRepository Implementation ---
    def find_by_id(self, id: str) -> Optional[Dict[str, Any]]:
        # `id` is ambiguous (product_id vs price_id); return None to avoid unintended use.
        return None

    def save(self, entity: Dict[str, Any]) -> Dict[str, Any]:
        # 'entity' structure undefined in legacy code.
        return entity

    # ------------------------------------------------------------------
    # Helpers
    def _cache_get(self, key: str) -> Tuple[Optional[Any], bool]:
        if self.cache and self.cache.is_available():
            value = self.cache.get_json(key)
            if value is not None:
                logger.info(f"Cache HIT for key: {key}")
                return value, True
            logger.info(f"Cache MISS for key: {key}")
        return None, False

    def _cache_set(self, key: str, value: Any, ttl_seconds: int = 600) -> None:
        if self.cache and self.cache.is_available():
            success = self.cache.set_json(key, value, ttl_seconds=ttl_seconds)
            if success:
                logger.info(f"Cache SET success for key: {key}")
            else:
                logger.warning(f"Cache SET failed for key: {key}")
        else:
            logger.warning(f"Cache unavailable, skipping SET for key: {key}")

    def _db(self):
        return initialize_firebase()

    # ------------------------------------------------------------------
    # Data fetch helpers
    def _fetch_current_prices(self, product_id: str) -> List[Dict[str, Any]]:
        db = self._db()
        prices_query = db.collection('current_prices').where(
            filter=FieldFilter('productId', '==', product_id)
        )
        prices = []
        for doc in prices_query.stream():
            price_data = doc.to_dict()
            price_data['id'] = doc.id
            price_data['price'] = float(price_data.get('price', 0) or 0)
            prices.append(price_data)
        prices.sort(key=lambda x: x.get('price', 0))
        return prices

    def _fetch_product_doc(self, product_id: str) -> Dict[str, Any]:
        db = self._db()
        product_doc = db.collection('products').document(product_id).get()
        if not product_doc.exists:
            return {}
        data = product_doc.to_dict() or {}
        data['id'] = product_doc.id
        return data

    # ------------------------------------------------------------------
    # Current Prices
    def get_current_prices_for_product(self, product_id: str) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.price_current_key(product_id)
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        prices = self._fetch_current_prices(product_id)
        result = {
            'success': True,
            'product_id': product_id,
            'current_prices': prices,
            'cheapest_store': prices[0]['supermarketId'] if prices else None,
            'price_range': {
                'min': prices[0]['price'] if prices else None,
                'max': prices[-1]['price'] if prices else None,
                'difference': prices[-1]['price'] - prices[0]['price'] if len(prices) > 1 else 0,
            },
        }

        self._cache_set(cache_key, result, ttl_seconds=300)
        return result, False

    # ------------------------------------------------------------------
    # Price History (single supermarket)
    def get_price_history(self, supermarket_id: str, product_id: str, months_back: int = 6) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.price_history_key(product_id, supermarket_id, months_back)
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        db = self._db()
        current_date = datetime.now()
        
        # Prepare all document references first
        doc_refs = []
        for i in range(months_back):
            target_date = datetime(current_date.year, current_date.month, 1) - timedelta(days=i * 30)
            target_date = target_date.replace(day=1)
            doc_id = f"{supermarket_id}_{product_id}_{target_date.year}_{str(target_date.month).zfill(2)}"
            doc_refs.append(db.collection('price_history_monthly').document(doc_id))

        # Fetch all documents in parallel using get_all
        # This is much faster than sequential gets
        docs = db.get_all(doc_refs)
        
        documents = []
        for doc in docs:
            if doc.exists:
                doc_data = doc.to_dict()
                doc_data['id'] = doc.id
                documents.append(doc_data)

        documents.sort(key=lambda x: (x.get('year', 0), x.get('month', 0)), reverse=True)

        result = {
            'success': True,
            'supermarket_id': supermarket_id,
            'product_id': product_id,
            'months_requested': months_back,
            'history': documents,
        }

        self._cache_set(cache_key, result, ttl_seconds=600)
        return result, False

    # ------------------------------------------------------------------
    # Price Comparison
    def get_price_comparison(self, product_id: str) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.price_comparison_key(product_id)
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        prices = self._fetch_current_prices(product_id)
        if not prices:
            raise ValueError('No prices found for this product')

        product_data = self._fetch_product_doc(product_id)
        cheapest = prices[0]
        most_expensive = prices[-1]
        max_savings = most_expensive['price'] - cheapest['price']

        result = {
            'success': True,
            'product': {
                'id': product_id,
                'name': product_data.get('name', ''),
                'brand_name': product_data.get('brand_name', ''),
                'sizeRaw': product_data.get('sizeRaw', ''),
                'category': product_data.get('category', ''),
            },
            'price_comparison': {
                'cheapest_store': cheapest.get('supermarketId'),
                'cheapest_price': cheapest.get('price'),
                'most_expensive_store': most_expensive.get('supermarketId'),
                'most_expensive_price': most_expensive.get('price'),
                'max_savings': round(max_savings, 2),
                'savings_percentage': round((max_savings / most_expensive['price']) * 100, 2) if most_expensive['price'] > 0 else 0,
            },
            'all_prices': prices,
        }

        self._cache_set(cache_key, result, ttl_seconds=300)
        return result, False

    # ------------------------------------------------------------------
    # Price Stats
    def get_price_stats(self) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.price_stats_key()
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        db = self._db()
        current_price_docs = list(db.collection('current_prices').stream())
        history_docs = list(db.collection('price_history_monthly').stream())

        products_with_prices = {doc.to_dict().get('productId') for doc in current_price_docs if doc.to_dict().get('productId')}
        supermarkets_with_data = {doc.to_dict().get('supermarketId') for doc in current_price_docs if doc.to_dict().get('supermarketId')}

        result = {
            'success': True,
            'stats': {
                'total_current_prices': len(current_price_docs),
                'total_history_documents': len(history_docs),
                'products_with_prices': len(products_with_prices),
                'supermarkets_with_data': len(supermarkets_with_data),
                'active_supermarkets': list(supermarkets_with_data),
            },
        }

        self._cache_set(cache_key, result, ttl_seconds=600)
        return result, False

    # ------------------------------------------------------------------
    # Current price comparisons across all products
    def get_all_current_price_comparisons(self) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.price_comparisons_key()
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        db = self._db()
        current_prices_ref = db.collection('current_prices')
        current_prices_docs = current_prices_ref.stream()

        products_data: Dict[str, List[Dict[str, Any]]] = {}
        for doc in current_prices_docs:
            data = doc.to_dict()
            product_id = data.get('productId')
            if not product_id:
                continue

            products_data.setdefault(product_id, []).append({
                'id': doc.id,
                'price': float(data.get('price', 0) or 0),
                'supermarketId': data.get('supermarketId'),
                'productId': product_id,
                'priceDate': data.get('priceDate', ''),
                'lastUpdated': data.get('lastUpdated', ''),
            })

        comparisons = []
        products_ref = db.collection('products')
        for product_id, prices in products_data.items():
            if len(prices) < 2:
                continue

            sorted_prices = sorted(prices, key=lambda x: x['price'])

            product_doc = products_ref.document(product_id).get()
            if product_doc.exists:
                product_info = product_doc.to_dict() or {}
                raw_name = product_info.get('name') or product_info.get('original_name') or product_id.replace('_', ' ')
            else:
                raw_name = product_id.replace('_', ' ')

            comparison = {
                'product_id': product_id,
                'product_name': clean_product_name(raw_name),
                'current_prices': sorted_prices,
                'cheapest_store': sorted_prices[0]['supermarketId'],
                'price_range': {
                    'min': sorted_prices[0]['price'],
                    'max': sorted_prices[-1]['price'],
                    'difference': sorted_prices[-1]['price'] - sorted_prices[0]['price'],
                },
            }
            comparisons.append(comparison)

        result = {
            'success': True,
            'comparisons': comparisons,
            'total_products': len(comparisons),
        }

        self._cache_set(cache_key, result, ttl_seconds=300)
        return result, False

    # ------------------------------------------------------------------
    # Aggregated product price history
    def get_product_price_history(self, product_id: str) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.price_history_key(product_id)
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        db = self._db()
        product_doc = db.collection('products').document(product_id).get()
        if not product_doc.exists:
            raise ValueError('Product not found')
        product_data = product_doc.to_dict() or {}

        current_prices_query = db.collection('current_prices').where(
            filter=FieldFilter('productId', '==', product_id)
        )
        current_prices_docs = current_prices_query.stream()

        current_prices = []
        supermarkets_with_data = set()
        for doc in current_prices_docs:
            price_data = doc.to_dict()
            supermarket_id = price_data.get('supermarketId')
            supermarkets_with_data.add(supermarket_id)
            current_prices.append({
                'supermarketId': supermarket_id,
                'price': float(price_data.get('price', 0) or 0),
                'priceDate': price_data.get('priceDate', ''),
                'lastUpdated': price_data.get('lastUpdated', ''),
                'id': doc.id,
            })

        history_data: Dict[str, Dict[str, Any]] = {}
        for supermarket in supermarkets_with_data:
            history_query = (
                db.collection('price_history_monthly')
                .where(filter=FieldFilter('supermarketId', '==', supermarket))
                .where(filter=FieldFilter('productId', '==', product_id))
            )
            history_docs = history_query.stream()

            supermarket_history = []
            all_daily_prices: Dict[str, Any] = {}
            for doc in history_docs:
                history_info = doc.to_dict() or {}
                daily_prices = history_info.get('daily_prices', {})
                month_summary = history_info.get('month_summary', {})
                month_value = history_info.get('month', 0)
                try:
                    month_int = int(month_value)
                except (TypeError, ValueError):
                    month_int = 0
                supermarket_history.append({
                    'month': f"{history_info.get('year', '')}-{month_int:02d}",
                    'daily_prices': daily_prices,
                    'monthly_stats': month_summary,
                })
                all_daily_prices.update(daily_prices)

            if supermarket_history:
                price_timeline = [{'date': date_str, 'price': float(price)} for date_str, price in sorted(all_daily_prices.items())]
                history_data[supermarket] = {
                    'daily_prices': price_timeline,
                    'monthly_records': supermarket_history,
                    'total_records': len(all_daily_prices),
                }

        all_prices = [p['price'] for prices in history_data.values() for p in prices['daily_prices']]
        price_analysis = {}
        if all_prices:
            price_analysis = {
                'min_price': min(all_prices),
                'max_price': max(all_prices),
                'avg_price': sum(all_prices) / len(all_prices),
                'price_range': max(all_prices) - min(all_prices),
                'total_data_points': len(all_prices),
            }

        result = {
            'success': True,
            'product': {
                'id': product_id,
                'name': product_data.get('name', ''),
                'brand_name': product_data.get('brand_name', ''),
                'category': product_data.get('category', ''),
                'size': product_data.get('sizeRaw', ''),
                'image_url': product_data.get('image_url', ''),
            },
            'current_prices': sorted(current_prices, key=lambda x: x['price']),
            'price_history': history_data,
            'price_analysis': price_analysis,
            'supermarkets_tracked': list(supermarkets_with_data),
        }

        self._cache_set(cache_key, result, ttl_seconds=900)
        return result, False

    # ------------------------------------------------------------------
    # Enhanced overview
    def get_enhanced_overview(
        self,
        page: int,
        per_page: int,
        category_filter: str = '',
        supermarket_filter: str = '',
    ) -> Tuple[Dict[str, Any], bool]:
        cache_key = cache_keys.price_overview_key(
            supermarket=supermarket_filter or None,
            category=category_filter or None,
            page=page,
            per_page=per_page,
        )
        cached, hit = self._cache_get(cache_key)
        if hit:
            return cached, True

        db = self._db()
        
        # 1. Fetch all current prices (Batch 1)
        current_prices_docs = list(db.collection('current_prices').select(
            ['productId', 'supermarketId', 'price', 'priceDate', 'lastUpdated']
        ).stream())
        logger.info(f"Fetched {len(current_prices_docs)} current_prices documents from Firestore")

        products_with_prices: Dict[str, List[Dict[str, Any]]] = {}
        supermarket_product_count: Dict[str, int] = {}
        
        for doc in current_prices_docs:
            price_data = doc.to_dict()
            product_id = price_data.get('productId')
            if not product_id:
                continue

            products_with_prices.setdefault(product_id, []).append({
                'supermarket': price_data.get('supermarketId'),
                'price': float(price_data.get('price', 0) or 0),
                'priceDate': price_data.get('priceDate', ''),
                'lastUpdated': price_data.get('lastUpdated', ''),
            })

            supermarket_id = price_data.get('supermarketId')
            if supermarket_id:
                supermarket_product_count[supermarket_id] = supermarket_product_count.get(supermarket_id, 0) + 1

        # 2. Fetch all products in one go to avoid N+1 problem (Batch 2)
        # This reduces 500+ network calls to just 1.
        all_product_docs = list(db.collection('products').select(
            ['name', 'brand_name', 'category', 'sizeRaw', 'image_url']
        ).stream())
        logger.info(f"Fetched {len(all_product_docs)} product documents from Firestore for mapping")
        
        # Create O(1) lookup map
        product_lookup = {doc.id: doc.to_dict() for doc in all_product_docs}

        category_stats: Dict[str, Dict[str, Any]] = {}
        brand_stats: Dict[str, Dict[str, Any]] = {}
        all_products: List[Dict[str, Any]] = []

        for product_id, price_entries in products_with_prices.items():
            # Use in-memory lookup instead of DB call
            product_data = product_lookup.get(product_id)
            if not product_data:
                continue

            category_value = product_data.get('category') or 'uncategorized'
            brand = product_data.get('brand_name') or 'No Brand'

            category_stats.setdefault(category_value, {'count': 0, 'products': []})
            category_stats[category_value]['count'] += 1
            category_stats[category_value]['products'].append(product_id)

            brand_stats.setdefault(brand, {'count': 0, 'products': []})
            brand_stats[brand]['count'] += 1
            brand_stats[brand]['products'].append(product_id)

            product_entry = {
                'id': product_id,
                'name': product_data.get('name', ''),
                'brand_name': brand,
                'category': category_value,
                'size': product_data.get('sizeRaw', ''),
                'image_url': product_data.get('image_url', ''),
                'price_data': price_entries,
            }
            all_products.append(product_entry)

        filtered_products = all_products
        if category_filter:
            filtered_products = [
                product for product in filtered_products
                if (product.get('category') or '').lower() == category_filter.lower()
            ]
        if supermarket_filter:
            filtered_products = [
                product for product in filtered_products
                if any(price['supermarket'] == supermarket_filter for price in product['price_data'])
            ]

        total_products = len(filtered_products)
        total_pages = math.ceil(total_products / per_page) if per_page else 0
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_products = filtered_products[start_idx:end_idx]

        result = {
            'success': True,
            'products': paginated_products,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total_products,
                'pages': total_pages,
            },
            'supermarket_stats': supermarket_product_count,
            'category_stats': category_stats,
            'brand_stats': brand_stats,
            'filters_applied': {
                'category': category_filter,
                'supermarket': supermarket_filter,
            },
            'cache_info': {
                'cached': False,
                'cache_key': cache_key,
            },
        }

        # Cache for 1 hour since this is a heavy operation
        self._cache_set(cache_key, result, ttl_seconds=3600)
        return result, False

    # ------------------------------------------------------------------
    # Invalidations
    def invalidate_product_prices(self, product_id: str) -> None:
        if not self.cache or not self.cache.is_available():
            return
        keys = [
            cache_keys.price_current_key(product_id),
            cache_keys.price_comparison_key(product_id),
            cache_keys.price_history_key(product_id),
        ]
        self.cache.delete(*keys)
        self.cache.invalidate_prefix(f"price:history:{product_id}:")

    def invalidate_overview(self) -> None:
        if self.cache and self.cache.is_available():
            self.cache.invalidate_prefix('price:overview')
            self.cache.delete(cache_keys.price_comparisons_key())

    def invalidate_stats(self) -> None:
        if self.cache and self.cache.is_available():
            self.cache.delete(cache_keys.price_stats_key())

    def invalidate_all_price_views(self) -> None:
        if self.cache and self.cache.is_available():
            self.cache.invalidate_prefix('price:')

    # ------------------------------------------------------------------
    # Writes (Persistence Only)
    
    def update_current_price(
        self,
        supermarket_id: str,
        product_id: str,
        price: float,
        price_date: datetime,
    ) -> Dict[str, Any]:
        """Update or create current price document."""
        db = self._db()
        current_price_id = f"{supermarket_id}_{product_id}"
        
        price_data = {
            'supermarketId': supermarket_id,
            'productId': product_id,
            'price': float(price),
            'priceDate': price_date.isoformat(),
            'lastUpdated': price_date.isoformat(),
        }
        
        # Merge=True to preserve other potential fields
        # Note: Using set(merge=True) acts as an upsert/patch
        db.collection('current_prices').document(current_price_id).set(price_data, merge=True)
        
        # Invalidate caches
        if self.cache and self.cache.is_available():
            self.cache.delete(cache_keys.price_current_key(product_id))
            self.cache.delete(cache_keys.price_stats_key())
            self.cache.delete(cache_keys.price_comparison_key(product_id))
        
        return price_data

    def get_monthly_history_doc(self, supermarket_id: str, product_id: str, date: datetime) -> Optional[Dict[str, Any]]:
        """Get a single monthly history document for update purposes."""
        db = self._db()
        year = date.year
        month = str(date.month).zfill(2)
        history_id = f"{supermarket_id}_{product_id}_{year}_{month}"
        
        doc = db.collection('price_history_monthly').document(history_id).get()
        if doc.exists:
            return doc.to_dict()
        return None

    def save_monthly_history_doc(self, supermarket_id: str, product_id: str, date: datetime, data: Dict[str, Any]) -> None:
        """Save a monthly history document."""
        db = self._db()
        year = date.year
        month = str(date.month).zfill(2)
        history_id = f"{supermarket_id}_{product_id}_{year}_{month}"
        
        db.collection('price_history_monthly').document(history_id).set(data)
        
        # Invalidate caches
        if self.cache and self.cache.is_available():
            self.cache.invalidate_prefix(f"price:history:{product_id}")
            self.cache.delete(cache_keys.price_stats_key())


    def update_daily_upload_count(self, date_str: str, supermarket_id: str, new_unique_ids: set) -> Tuple[int, int]:
        """
        Update daily count. 
        Returns (final_count, added_amount).
        """
        db = self._db()
        daily_count_ref = db.collection('price_uploads_daily').document(date_str)
        
        daily_count_doc = daily_count_ref.get()
        
        existing_ids = set()
        current_count = 0
        
        if daily_count_doc.exists:
            data = daily_count_doc.to_dict()
            current_count = data.get('count', 0)
            existing_ids = set(data.get('product_ids', []))
        
        updated_ids = existing_ids.union(new_unique_ids)
        new_unique_count = len(new_unique_ids - existing_ids)
        final_count = current_count + new_unique_count
        
        daily_count_ref.set({
            'count': final_count,
            'date': date_str,
            'lastUpdated': datetime.now(),
            'supermarket': supermarket_id,
            'product_ids': list(updated_ids)
        }, merge=True)
        
        return final_count, new_unique_count

    def get_daily_upload_counts(self, start_date: datetime, end_date: datetime) -> Dict[str, int]:
        """Batch get daily upload counts."""
        db = self._db()
        delta = end_date - start_date
        date_keys = []
        for i in range(delta.days + 1):
            day = start_date + timedelta(days=i)
            date_keys.append(day.strftime('%Y-%m-%d'))
            
        refs = [db.collection('price_uploads_daily').document(k) for k in date_keys]
        snapshots = db.get_all(refs)
        
        counts = {}
        for snap in snapshots:
            if snap.exists:
                data = snap.to_dict()
                counts[snap.id] = data.get('count', 0)
            else:
                counts[snap.id] = 0
        return counts

"""
Scalable Product Index Service for 1M+ Products

Architecture:
- Individual product storage in Redis Hashes
- Inverted indexes for fast candidate retrieval
- N-gram indexing for fuzzy matching
- Bloom filters for fast rejection (optional)

This replaces the O(n) exhaustive search with O(k) candidate retrieval
where k << n (typically k < 1000 even for 1M+ products).

Redis Key Structure:
- products:data:{product_id}          -> Hash with product fields
- products:idx:brand:{brand_norm}     -> Set of product IDs
- products:idx:name:{token}           -> Set of product IDs (word tokens)
- products:idx:ngram:{ngram}          -> Set of product IDs (3-char ngrams)
- products:idx:exact:{name|brand|size}-> Single product ID
- products:meta:count                 -> Total product count
- products:meta:last_sync             -> Last sync timestamp
"""

from __future__ import annotations

import json
import re
import hashlib
from typing import Any, Dict, List, Optional, Set, Tuple
from datetime import datetime
import threading

from services.system.logger_service import get_logger, log_error

try:
    from upstash_redis import Redis
except ImportError:
    Redis = None

logger = get_logger(__name__)


def generate_ngrams(text: str, n: int = 3) -> Set[str]:
    """Generate n-grams from text for fuzzy matching."""
    if not text or len(text) < n:
        return {text.lower()} if text else set()
    
    text = text.lower().strip()
    # Remove special characters but keep spaces
    text = re.sub(r'[^a-z0-9\s]', '', text)
    
    ngrams = set()
    for i in range(len(text) - n + 1):
        ngrams.add(text[i:i+n])
    return ngrams


def normalize_for_index(text: str) -> str:
    """Normalize text for indexing."""
    if not text:
        return ""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text


def tokenize(text: str) -> Set[str]:
    """Split text into searchable tokens."""
    if not text:
        return set()
    normalized = normalize_for_index(text)
    # Filter out very short tokens (noise)
    return {t for t in normalized.split() if len(t) >= 2}


class ProductIndexService:
    """
    Scalable product indexing service using Redis.
    
    Designed to handle 1M+ products with:
    - O(k) candidate retrieval (k << n)
    - Inverted indexes for fast lookups
    - N-gram indexing for fuzzy matching
    - Incremental updates (no full refresh needed)
    """
    
    _instance: Optional["ProductIndexService"] = None
    _instance_lock = threading.Lock()
    
    # Redis key prefixes
    PREFIX = "products"
    DATA_KEY = f"{PREFIX}:data"           # Hash: product_id -> product JSON
    BRAND_IDX = f"{PREFIX}:idx:brand"     # Set: brand -> product_ids
    NAME_IDX = f"{PREFIX}:idx:name"       # Set: token -> product_ids
    NGRAM_IDX = f"{PREFIX}:idx:ngram"     # Set: ngram -> product_ids
    EXACT_IDX = f"{PREFIX}:idx:exact"     # String: exact_key -> product_id
    SIZE_IDX = f"{PREFIX}:idx:size"       # Set: size_norm -> product_ids
    META_COUNT = f"{PREFIX}:meta:count"
    META_SYNC = f"{PREFIX}:meta:last_sync"
    
    # Performance tuning
    MAX_CANDIDATES = 500  # Max candidates to retrieve for comparison
    NGRAM_SIZE = 3
    MIN_NGRAM_MATCHES = 2  # Minimum ngram matches to consider a candidate
    
    def __new__(cls):
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        
        import os
        self.url = os.getenv("UPSTASH_REDIS_REST_URL")
        self.token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
        self._client: Optional[Redis] = None
        self._available = False
        
        if self.url and self.token and Redis is not None:
            try:
                self._client = Redis(url=self.url, token=self.token)
                self._available = True
                logger.info("ProductIndexService initialized with Redis", extra={
                    "provider": "upstash"
                })
            except Exception as e:
                logger.error(f"Failed to initialize Redis for ProductIndexService: {e}")
        else:
            logger.warning("ProductIndexService: Redis not available, falling back to in-memory")
        
        # In-memory fallback for development
        self._memory_store: Dict[str, Any] = {}
        self._memory_indexes: Dict[str, Set[str]] = {}
        
        self._initialized = True
    
    def is_available(self) -> bool:
        return self._available and self._client is not None
    
    # =========================================================================
    # PRODUCT CRUD OPERATIONS
    # =========================================================================
    
    def index_product(self, product_id: str, product_data: Dict[str, Any]) -> bool:
        """
        Index a single product. Call this when:
        - A new product is created
        - An existing product is updated
        
        Automatically updates all relevant indexes.
        """
        try:
            name = product_data.get('name', '')
            brand = product_data.get('brand_name', '')
            size = str(product_data.get('sizeRaw', '') or product_data.get('size', ''))
            category = product_data.get('category', '')
            variety = product_data.get('variety', '')
            
            # Normalize for indexing
            name_norm = normalize_for_index(name)
            brand_norm = normalize_for_index(brand)
            size_norm = normalize_for_index(size)
            
            # Store product data
            product_json = json.dumps({
                'id': product_id,
                'name': name,
                'brand_name': brand,
                'size': size,
                'category': category,
                'variety': variety,
                'image_url': product_data.get('image_url', ''),
                'name_norm': name_norm,
                'brand_norm': brand_norm,
                'indexed_at': datetime.now().isoformat()
            })
            
            if self.is_available():
                pipe = self._client  # Upstash doesn't have pipeline, use direct calls
                
                # 1. Store product data in hash
                self._client.hset(self.DATA_KEY, product_id, product_json)
                
                # 2. Index by brand
                if brand_norm:
                    self._client.sadd(f"{self.BRAND_IDX}:{brand_norm}", product_id)
                
                # 3. Index by name tokens
                for token in tokenize(name):
                    self._client.sadd(f"{self.NAME_IDX}:{token}", product_id)
                
                # 4. Index by brand tokens (for brand search)
                for token in tokenize(brand):
                    self._client.sadd(f"{self.NAME_IDX}:{token}", product_id)
                
                # 5. Index by n-grams for fuzzy matching
                combined_text = f"{name} {brand}"
                for ngram in generate_ngrams(combined_text, self.NGRAM_SIZE):
                    self._client.sadd(f"{self.NGRAM_IDX}:{ngram}", product_id)
                
                # 6. Exact match index (name|brand|size)
                exact_key = f"{name_norm}|{brand_norm}|{size_norm}"
                self._client.set(f"{self.EXACT_IDX}:{exact_key}", product_id)
                
                # 7. Index by size for size-based filtering
                if size_norm:
                    self._client.sadd(f"{self.SIZE_IDX}:{size_norm}", product_id)
                
                # 8. Update count
                self._client.incr(self.META_COUNT)
                
            else:
                # In-memory fallback
                self._memory_store[product_id] = json.loads(product_json)
                
                if brand_norm:
                    self._memory_indexes.setdefault(f"brand:{brand_norm}", set()).add(product_id)
                
                for token in tokenize(name):
                    self._memory_indexes.setdefault(f"name:{token}", set()).add(product_id)
                
                for ngram in generate_ngrams(f"{name} {brand}", self.NGRAM_SIZE):
                    self._memory_indexes.setdefault(f"ngram:{ngram}", set()).add(product_id)
            
            return True
            
        except Exception as e:
            log_error(logger, e, {"context": "index_product", "product_id": product_id})
            return False
    
    def remove_product(self, product_id: str) -> bool:
        """Remove a product from all indexes."""
        try:
            # First get the product to know what indexes to clean
            product_data = self.get_product(product_id)
            if not product_data:
                return True  # Already removed
            
            name = product_data.get('name', '')
            brand = product_data.get('brand_name', '')
            size = product_data.get('size', '')
            
            name_norm = normalize_for_index(name)
            brand_norm = normalize_for_index(brand)
            size_norm = normalize_for_index(size)
            
            if self.is_available():
                # Remove from hash
                self._client.hdel(self.DATA_KEY, product_id)
                
                # Remove from brand index
                if brand_norm:
                    self._client.srem(f"{self.BRAND_IDX}:{brand_norm}", product_id)
                
                # Remove from name token indexes
                for token in tokenize(name):
                    self._client.srem(f"{self.NAME_IDX}:{token}", product_id)
                
                # Remove from ngram indexes
                for ngram in generate_ngrams(f"{name} {brand}", self.NGRAM_SIZE):
                    self._client.srem(f"{self.NGRAM_IDX}:{ngram}", product_id)
                
                # Remove exact match
                exact_key = f"{name_norm}|{brand_norm}|{size_norm}"
                self._client.delete(f"{self.EXACT_IDX}:{exact_key}")
                
                # Remove from size index
                if size_norm:
                    self._client.srem(f"{self.SIZE_IDX}:{size_norm}", product_id)
                
                # Update count
                self._client.decr(self.META_COUNT)
            else:
                # In-memory cleanup
                self._memory_store.pop(product_id, None)
                for key in list(self._memory_indexes.keys()):
                    self._memory_indexes[key].discard(product_id)
            
            return True
            
        except Exception as e:
            log_error(logger, e, {"context": "remove_product", "product_id": product_id})
            return False
    
    def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Get a single product by ID."""
        try:
            if self.is_available():
                data = self._client.hget(self.DATA_KEY, product_id)
                if data:
                    return json.loads(data) if isinstance(data, str) else json.loads(data.decode())
            else:
                return self._memory_store.get(product_id)
        except Exception as e:
            log_error(logger, e, {"context": "get_product", "product_id": product_id})
        return None
    
    def get_product_count(self) -> int:
        """Get total indexed product count."""
        try:
            if self.is_available():
                count = self._client.get(self.META_COUNT)
                return int(count) if count else 0
            else:
                return len(self._memory_store)
        except Exception:
            return 0
    
    # =========================================================================
    # CANDIDATE RETRIEVAL - The Key to Scalability
    # =========================================================================
    
    def find_candidates(
        self,
        name: str,
        brand: str = "",
        size: str = "",
        max_candidates: int = None
    ) -> List[str]:
        """
        Find candidate product IDs that MIGHT match the query.
        
        This is the key to scalability:
        - Instead of checking all 1M+ products, we retrieve ~100-500 candidates
        - Uses inverted indexes for O(k) retrieval where k << n
        
        Returns: List of product IDs to compare against
        """
        max_candidates = max_candidates or self.MAX_CANDIDATES
        candidates: Set[str] = set()
        
        try:
            name_norm = normalize_for_index(name)
            brand_norm = normalize_for_index(brand)
            
            if self.is_available():
                # Strategy 1: Exact match (fastest)
                if name_norm and brand_norm:
                    size_norm = normalize_for_index(size)
                    exact_key = f"{name_norm}|{brand_norm}|{size_norm}"
                    exact_match = self._client.get(f"{self.EXACT_IDX}:{exact_key}")
                    if exact_match:
                        return [exact_match if isinstance(exact_match, str) else exact_match.decode()]
                
                # Strategy 2: Brand + name token intersection
                if brand_norm:
                    brand_products = self._client.smembers(f"{self.BRAND_IDX}:{brand_norm}")
                    if brand_products:
                        candidates.update(
                            p if isinstance(p, str) else p.decode() 
                            for p in brand_products
                        )
                
                # Strategy 3: Name token matching
                name_tokens = tokenize(name)
                if name_tokens:
                    # Get products matching at least one token
                    for token in list(name_tokens)[:5]:  # Limit tokens to check
                        token_products = self._client.smembers(f"{self.NAME_IDX}:{token}")
                        if token_products:
                            for p in token_products:
                                pid = p if isinstance(p, str) else p.decode()
                                candidates.add(pid)
                                if len(candidates) >= max_candidates * 2:
                                    break
                        if len(candidates) >= max_candidates * 2:
                            break
                
                # Strategy 4: N-gram fuzzy matching (for typos/variations)
                if len(candidates) < 50:  # Apply only when candidate count is low.
                    ngrams = generate_ngrams(f"{name} {brand}", self.NGRAM_SIZE)
                    ngram_counts: Dict[str, int] = {}
                    
                    for ngram in list(ngrams)[:20]:  # Check first 20 ngrams
                        ngram_products = self._client.smembers(f"{self.NGRAM_IDX}:{ngram}")
                        if ngram_products:
                            for p in ngram_products:
                                pid = p if isinstance(p, str) else p.decode()
                                ngram_counts[pid] = ngram_counts.get(pid, 0) + 1
                    
                    # Add products with enough ngram matches
                    for pid, count in ngram_counts.items():
                        if count >= self.MIN_NGRAM_MATCHES:
                            candidates.add(pid)
                            if len(candidates) >= max_candidates:
                                break
                
            else:
                # In-memory fallback
                if brand_norm:
                    candidates.update(self._memory_indexes.get(f"brand:{brand_norm}", set()))
                
                for token in tokenize(name):
                    candidates.update(self._memory_indexes.get(f"name:{token}", set()))
                    if len(candidates) >= max_candidates:
                        break
            
            # Limit candidates
            candidate_list = list(candidates)[:max_candidates]
            
            logger.debug(f"Found {len(candidate_list)} candidates for query", extra={
                "name": name[:50],
                "brand": brand,
                "candidates": len(candidate_list)
            })
            
            return candidate_list
            
        except Exception as e:
            log_error(logger, e, {"context": "find_candidates"})
            return []
    
    def get_products_batch(self, product_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Get multiple products in a single batch operation.
        
        Much more efficient than individual gets for candidate comparison.
        """
        if not product_ids:
            return {}
        
        try:
            if self.is_available():
                # Batch get from hash
                products = {}
                for pid in product_ids:
                    data = self._client.hget(self.DATA_KEY, pid)
                    if data:
                        products[pid] = json.loads(data) if isinstance(data, str) else json.loads(data.decode())
                return products
            else:
                return {
                    pid: self._memory_store[pid]
                    for pid in product_ids
                    if pid in self._memory_store
                }
        except Exception as e:
            log_error(logger, e, {"context": "get_products_batch"})
            return {}
    
    # =========================================================================
    # BULK OPERATIONS
    # =========================================================================
    
    def bulk_index_from_db(self, db, batch_size: int = 500, progress_callback=None) -> Dict[str, Any]:
        """
        Bulk index all products from Firestore.
        
        Uses pagination to avoid memory issues with 1M+ products.
        """
        stats = {
            "total_indexed": 0,
            "errors": 0,
            "start_time": datetime.now().isoformat(),
            "end_time": None
        }
        
        logger.info("Starting bulk index from database", extra={"batch_size": batch_size})
        
        try:
            products_ref = db.collection('products')
            last_doc = None
            batch_num = 0
            
            while True:
                batch_num += 1
                
                # Paginated query
                query = products_ref.limit(batch_size)
                if last_doc:
                    query = query.start_after(last_doc)
                
                docs = list(query.stream())
                
                if not docs:
                    break
                
                # Index batch
                for doc in docs:
                    product_data = doc.to_dict()
                    product_data['id'] = doc.id
                    
                    if self.index_product(doc.id, product_data):
                        stats["total_indexed"] += 1
                    else:
                        stats["errors"] += 1
                
                last_doc = docs[-1]
                
                # Progress callback
                if progress_callback:
                    progress_callback(batch_num, stats["total_indexed"])
                
                logger.info(f"Indexed batch {batch_num}", extra={
                    "batch_size": len(docs),
                    "total_so_far": stats["total_indexed"]
                })
                
                # Safety check for very large datasets
                if stats["total_indexed"] >= 2_000_000:  # 2M limit
                    logger.warning("Reached 2M product limit")
                    break
            
            # Update sync timestamp
            if self.is_available():
                self._client.set(self.META_SYNC, datetime.now().isoformat())
            
            stats["end_time"] = datetime.now().isoformat()
            
            logger.info("Bulk indexing complete", extra=stats)
            return stats
            
        except Exception as e:
            log_error(logger, e, {"context": "bulk_index_from_db"})
            stats["error"] = str(e)
            return stats
    
    def clear_all_indexes(self) -> bool:
        """Clear all product indexes. Use with caution!"""
        try:
            if self.is_available():
                # Delete main keys for this prefix.
                # Upstash does not support SCAN; avoid pattern deletes.
                self._client.delete(self.DATA_KEY)
                self._client.delete(self.META_COUNT)
                self._client.delete(self.META_SYNC)
                # Note: Individual index keys need manual cleanup or use KEYS pattern
                logger.warning("Cleared main product indexes")
            else:
                self._memory_store.clear()
                self._memory_indexes.clear()
            
            return True
        except Exception as e:
            log_error(logger, e, {"context": "clear_all_indexes"})
            return False
    
    # =========================================================================
    # STATISTICS
    # =========================================================================
    
    def get_index_stats(self) -> Dict[str, Any]:
        """Get statistics about the index."""
        try:
            stats = {
                "product_count": self.get_product_count(),
                "redis_available": self.is_available(),
                "last_sync": None
            }
            
            if self.is_available():
                sync_time = self._client.get(self.META_SYNC)
                stats["last_sync"] = sync_time if isinstance(sync_time, str) else (sync_time.decode() if sync_time else None)
            
            return stats
        except Exception as e:
            return {"error": str(e)}


# Singleton instance
_product_index: Optional[ProductIndexService] = None


def get_product_index() -> ProductIndexService:
    """Get the singleton ProductIndexService instance."""
    global _product_index
    if _product_index is None:
        _product_index = ProductIndexService()
    return _product_index

import os
import pickle
import base64
import json
from datetime import datetime, timedelta
from typing import Dict, List, Set, Optional, Tuple, Any

from backend.services.system.logger_service import get_logger, log_error
from backend.services.system.cache_service import CacheService
from backend.services.system.product_index_service import get_product_index, ProductIndexService
from .models import ProductMatch, ProductCacheEntry
from .normalization import normalize_product_name, generate_search_tokens
from .similarity import SimilarityCalculator

logger = get_logger(__name__)

# Scalability threshold: Use indexed search above this number of products
SCALABLE_MODE_THRESHOLD = 10000

class IntelligentProductMatcher:
    """
    Intelligent Product Matcher
    Uses fuzzy matching and caching to find product duplicates and similarities.
    """
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(IntelligentProductMatcher, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, cache_file: str = "cache/product_cache.pkl", similarity_threshold: float = 0.75, exact_match_threshold: float = 0.95, cache_ttl_hours: int = None):
        if self._initialized:
            return
        
        # Default cache TTL: 7 days (configurable via PRODUCT_CACHE_TTL_HOURS env var)
        if cache_ttl_hours is None:
            cache_ttl_hours = int(os.environ.get('PRODUCT_CACHE_TTL_HOURS', '168'))
            
        self.cache_file = cache_file
        
        # Redis Cache Service
        self.redis_cache = CacheService()
        self.use_redis = self.redis_cache.is_available()
        
        # Scalable Product Index Service (for 1M+ products)
        self.product_index: ProductIndexService = get_product_index()
        self.scalable_mode = False  # Will be set based on product count
        
        logger.info(f"IntelligentProductMatcher initialized. Redis available: {self.use_redis}, Index available: {self.product_index.is_available()}")

        # Ensure cache directory exists
        cache_dir = os.path.dirname(cache_file)
        if cache_dir and not os.path.exists(cache_dir):
            try:
                os.makedirs(cache_dir)
            except OSError:
                pass # might fail if caching to current dir with no dirname
            
        self.similarity_calculator = SimilarityCalculator()
        self.similarity_threshold = similarity_threshold
        self.exact_match_threshold = exact_match_threshold
        self.cache_ttl = timedelta(hours=cache_ttl_hours)
        
        # Cache stores (In-Memory Fallback Local State)
        self.product_cache: Dict[str, ProductCacheEntry] = {}
        self.normalized_names: Dict[str, Set[str]] = {}
        self.brand_groups: Dict[str, Set[str]] = {}
        
        # Optimized Indexes
        self.exact_name_brand_index: Dict[str, Set[str]] = {}
        self.exact_name_brand_size_index: Dict[str, str] = {}
        self.brand_name_index: Dict[str, Dict[str, Set[str]]] = {}
        
        # Load capability from either storage
        self.load_cache()
            
        self._initialized = True

    def calculate_similarity(self, product1: Dict, product2: Dict) -> Tuple[float, List[str]]:
        """Delegate similarity calculation to the helper class."""
        return self.similarity_calculator.calculate_similarity(product1, product2)

    @staticmethod
    def normalize_product_name(name: str, brand: str = None, remove_packaging: bool = False) -> str:
        """Expose normalization logic."""
        return normalize_product_name(name, brand, remove_packaging)

    @staticmethod
    def generate_search_tokens(name: str, brand: str = None, variety: str = None) -> Set[str]:
        """Expose token generation logic."""
        return generate_search_tokens(name, brand, variety)

    def load_cache(self) -> None:
        """Load the product cache from disk or Redis."""
        cached_data = None
        
        if self.use_redis:
            try:
                # Try to load the pickle blob from Redis
                redis_data = self.redis_cache._client.get(self.cache_file) # type: ignore
                if redis_data:
                    # Redis responses may be bytes or strings depending on client configuration.
                    try:
                        decoded_data = base64.b64decode(redis_data)
                        cached_data = pickle.loads(decoded_data)
                    except Exception:
                         # Fallback for legacy raw-bytes storage.
                         cached_data = pickle.loads(redis_data) # type: ignore

                    logger.info("Loaded product cache from Redis")
            except Exception as e:
                log_error(logger, e, {"context": "Error loading cache from Redis"})

        if not cached_data and os.path.exists(self.cache_file) and not self.use_redis:
            # Use the local cache file when Redis is disabled.
            try:
                with open(self.cache_file, 'rb') as f:
                    cached_data = pickle.load(f)
            except Exception as e:
                 logger.error(f"Failed to load local cache file: {e}")

        if cached_data:
            try:
                self.product_cache = cached_data.get('products', {})
                # Backward compatible load: upgrade str->set
                raw_normalized_names = cached_data.get('normalized_names', {})
                upgraded_normalized: Dict[str, Set[str]] = {}
                for key, val in raw_normalized_names.items() if isinstance(raw_normalized_names, dict) else []:
                    if isinstance(val, set):
                        upgraded_normalized[key] = val
                    elif isinstance(val, list):
                        upgraded_normalized[key] = set(val)
                    elif isinstance(val, str):
                        upgraded_normalized[key] = {val}
                self.normalized_names = upgraded_normalized

                self.brand_groups = cached_data.get('brand_groups', {})
                
                # Initialize new indexes if not present in cache (and upgrade types)
                raw_exact_name_brand_index = cached_data.get('exact_name_brand_index', {})
                upgraded_exact_index: Dict[str, Set[str]] = {}
                if isinstance(raw_exact_name_brand_index, dict):
                    for k, v in raw_exact_name_brand_index.items():
                        if isinstance(v, set):
                            upgraded_exact_index[k] = v
                        elif isinstance(v, list):
                            upgraded_exact_index[k] = set(v)
                        else:
                            upgraded_exact_index[k] = {v} # type: ignore
                self.exact_name_brand_index = upgraded_exact_index
                

                self.exact_name_brand_size_index = cached_data.get('exact_name_brand_size_index', {})
                self.brand_name_index = cached_data.get('brand_name_index', {})

                # Clean expired entries
                current_time = datetime.now()
                expired_keys = []
                
                for product_id, entry in self.product_cache.items():
                    if current_time - entry.last_updated > self.cache_ttl:
                        expired_keys.append(product_id)
                
                for key in expired_keys:
                    del self.product_cache[key]
                
                logger.info("Loaded products from cache", extra={"count": len(self.product_cache)})

            except Exception as e:
                logger.error(f"Error parsing cached data: {e}") 
                # Start fresh if corrupt
                self.product_cache = {}

    def save_cache(self) -> None:
        """Save the product cache to disk (local mode) or Redis."""
        if self.use_redis:
            try:
                cache_data = {
                    'products': self.product_cache,
                    'normalized_names': self.normalized_names,
                    'brand_groups': self.brand_groups,
                    'exact_name_brand_index': self.exact_name_brand_index,
                    'exact_name_brand_size_index': self.exact_name_brand_size_index,
                    'brand_name_index': self.brand_name_index,
                    'last_updated': datetime.now()
                }
                # Serialize
                serialized = pickle.dumps(cache_data)
                # Redis clients commonly expect string values; base64 ensures safe transport.
                encoded_str = base64.b64encode(serialized).decode('utf-8')
                
                # Store in Redis with the same key
                self.redis_cache._client.set(self.cache_file, encoded_str) # type: ignore
                logger.info("Saved products to Redis cache", extra={"count": len(self.product_cache)})
            except Exception as e:
                log_error(logger, e, {"context": "Error saving cache to Redis"})
            return

        try:
            cache_data = {
                'products': self.product_cache,
                'normalized_names': self.normalized_names,
                'brand_groups': self.brand_groups,
                'exact_name_brand_index': self.exact_name_brand_index,
                'exact_name_brand_size_index': self.exact_name_brand_size_index,
                'brand_name_index': self.brand_name_index,
                'last_updated': datetime.now()
            }
            
            with open(self.cache_file, 'wb') as f:
                pickle.dump(cache_data, f)
            
            logger.info("Saved products to cache", extra={"count": len(self.product_cache)})
            
        except Exception as e:
            log_error(logger, e, {"context": "Error saving cache"})
    
    def refresh_cache_from_db(self, db, use_pagination: bool = True, batch_size: int = 500) -> None:
        """
        Refresh the local cache from the database.
        
        Uses a subprocess to query Firestore, bypassing the gRPC + Gunicorn
        fork deadlock that causes .stream()/.get() to hang in worker processes.
        The subprocess runs a fresh Python process with a clean gRPC state.
        """
        logger.info("Refreshing product cache from database")
        
        try:
            import subprocess
            import json
            import sys
            
            new_cache = {}
            new_normalized_names = {}
            new_brand_groups = {}
            
            # NEW: Initialize optimized indexes
            new_exact_name_brand_index: Dict[str, Set[str]] = {}
            new_exact_name_brand_size_index = {}
            new_brand_name_index: Dict[str, Dict[str, Set[str]]] = {}
            
            # Also populate the scalable index
            index_available = self.product_index.is_available()
            products_indexed = 0
            
            # Use a subprocess to fetch products from Firestore.
            # This avoids gRPC channel deadlocks in Gunicorn's forked workers.
            script_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                '..', '..', '..', '..', 'utils', 'firestore_fetch_products.py'
            )
            script_path = os.path.normpath(script_path)
            
            logger.info("Cache refresh: fetching products via subprocess", 
                        extra={"script": script_path})
            
            result = subprocess.run(
                [sys.executable, script_path],
                capture_output=True,
                text=True,
                timeout=120,
                env=os.environ.copy(),
            )
            
            if result.returncode != 0:
                logger.error("Firestore fetch subprocess failed",
                             extra={"returncode": result.returncode, 
                                    "stderr": result.stderr[:500]})
                return
            
            # Log subprocess metadata from stderr
            if result.stderr:
                logger.info("Subprocess fetch metadata", extra={"info": result.stderr.strip()})
            
            # Parse products from stdout
            products_data = json.loads(result.stdout)
            logger.info(f"Subprocess returned {len(products_data)} products")
            
            # NOTE: We skip product_index.index_product() during bulk refresh
            # because it makes 8+ individual Redis calls per product to Upstash,
            # which is too slow for hundreds of products.
            # The in-memory cache structures are sufficient for duplicate detection.
            
            product_count = 0
            for item in products_data:
                product_id = item.pop('_id', None)
                if not product_id:
                    continue
                
                try:
                    self._process_product_for_cache(
                        product_id, item,
                        new_cache, new_normalized_names, new_brand_groups,
                        new_exact_name_brand_index, new_exact_name_brand_size_index,
                        new_brand_name_index
                    )
                except Exception as proc_err:
                    if product_count < 3:
                        logger.warning(f"Error processing product {product_id}: {proc_err}")
                    continue
                
                product_count += 1
                if product_count % 200 == 0:
                    logger.info(f"Cache refresh progress: {product_count} products processed")
            
            logger.info(f"All {product_count} products processed, updating cache structures")
            
            # Update cache with optimized indexes
            self.product_cache = new_cache
            self.normalized_names = new_normalized_names
            self.brand_groups = new_brand_groups
            self.exact_name_brand_index = new_exact_name_brand_index
            self.exact_name_brand_size_index = new_exact_name_brand_size_index
            self.brand_name_index = new_brand_name_index
            
            # Determine whether to use scalable mode.
            self.scalable_mode = len(new_cache) >= SCALABLE_MODE_THRESHOLD and index_available
            
            # Save to disk/Redis
            logger.info("Saving cache to Redis/disk")
            self.save_cache()
            
            logger.info("Cache refreshed", extra={
                "product_count": len(new_cache),
                "indexed_count": products_indexed,
                "scalable_mode": self.scalable_mode
            })
            
        except Exception as e:
            log_error(logger, e, {"context": "Error refreshing cache"})
    
    def _process_product_for_cache(
        self,
        product_id: str,
        product_data: Dict,
        new_cache: Dict,
        new_normalized_names: Dict,
        new_brand_groups: Dict,
        new_exact_name_brand_index: Dict,
        new_exact_name_brand_size_index: Dict,
        new_brand_name_index: Dict
    ) -> None:
        """Process a single product and add to all cache structures."""
        # Create cache entry and handle legacy size formats.
        size_for_comparison = product_data.get('sizeRaw', '') or str(product_data.get('size', ''))
        
        cache_entry = ProductCacheEntry(
            product_id=product_id,
            name=product_data.get('name', ''),
            brand_name=product_data.get('brand_name', ''),
            category=product_data.get('category', ''),
            variety=product_data.get('variety', ''),
            size=size_for_comparison,
            image_url=product_data.get('image_url', ''),
            normalized_name=normalize_product_name(
                product_data.get('name', ''),
                product_data.get('brand_name', ''),
                remove_packaging=True
            ),
            search_tokens=generate_search_tokens(
                product_data.get('name', ''),
                product_data.get('brand_name', ''),
                product_data.get('variety', '')
            ),
            last_updated=datetime.now()
        )
        
        new_cache[product_id] = cache_entry
        
        # Update normalized names index
        if cache_entry.normalized_name:
            if cache_entry.normalized_name not in new_normalized_names:
                new_normalized_names[cache_entry.normalized_name] = set()
            new_normalized_names[cache_entry.normalized_name].add(product_id)
        
        # Update brand groups
        brand = product_data.get('brand_name', '')
        if brand:
            brand_normalized = normalize_product_name(brand)
            if brand_normalized not in new_brand_groups:
                new_brand_groups[brand_normalized] = set()
            new_brand_groups[brand_normalized].add(product_id)
        
        # Build optimized exact match indexes
        name_clean = cache_entry.name.lower().strip()
        brand_clean = cache_entry.brand_name.lower().strip() if cache_entry.brand_name else ""
        size_clean = cache_entry.size.lower().strip() if cache_entry.size else ""
        
        # Index: name|brand -> product_id
        if name_clean and brand_clean:
            name_brand_key = f"{name_clean}|{brand_clean}"
            if name_brand_key not in new_exact_name_brand_index:
                new_exact_name_brand_index[name_brand_key] = set()
            new_exact_name_brand_index[name_brand_key].add(product_id)

            # Brand -> name index for efficient brand-based lookups
            if brand_clean not in new_brand_name_index:
                new_brand_name_index[brand_clean] = {}
            if name_clean not in new_brand_name_index[brand_clean]:
                new_brand_name_index[brand_clean][name_clean] = set()
            new_brand_name_index[brand_clean][name_clean].add(product_id)
        
        # Index: name|brand|size -> product_id
        if name_clean and brand_clean and size_clean:
            name_brand_size_key = f"{name_clean}|{brand_clean}|{size_clean}"
            new_exact_name_brand_size_index[name_brand_size_key] = product_id
        
        # Index for products WITHOUT brands: name||size -> product_id
        elif name_clean and not brand_clean and size_clean:
            name_no_brand_size_key = f"{name_clean}||{size_clean}"
            new_exact_name_brand_size_index[name_no_brand_size_key] = product_id

    def find_similar_products(self, product_data: Dict, limit: int = 10) -> List[ProductMatch]:
        """
        Find similar products using the BEST algorithm for the dataset size.
        
        For small datasets (<10K): Uses exhaustive search (checks ALL products)
        For large datasets (>10K): Uses indexed candidate retrieval (O(k) where k << n)
        
        This hybrid approach ensures:
        - Accuracy for small datasets (exhaustive search never misses)
        - Scalability for large datasets (1M+ products in milliseconds)
        """
        # Determine whether to use scalable mode.
        product_count = self.product_index.get_product_count() if self.product_index.is_available() else len(self.product_cache)
        use_scalable = product_count >= SCALABLE_MODE_THRESHOLD and self.product_index.is_available()
        
        if use_scalable:
            return self._find_similar_products_indexed(product_data, limit)
        else:
            return self._find_similar_products_exhaustive(product_data, limit)
    
    def _find_similar_products_indexed(self, product_data: Dict, limit: int = 10) -> List[ProductMatch]:
        """
        SCALABLE MODE: Find similar products using indexed candidate retrieval.
        
        This is O(k) where k = number of candidates (typically 100-500).
        Perfect for 1M+ products - takes milliseconds instead of minutes.
        
        Algorithm:
        1. Use inverted indexes to find candidate products (O(k))
        2. Calculate similarity only for candidates
        3. Rank by similarity score
        4. Return top matches
        """
        all_matches: List[ProductMatch] = []
        
        name = product_data.get('name', '').strip()
        brand = product_data.get('brand_name', '').strip()
        size = product_data.get('sizeRaw', '') or str(product_data.get('size', '')).strip()
        
        logger.debug(f"[INDEXED SEARCH] Searching for: '{name}' | Brand: '{brand}' | Size: '{size}'")
        
        # Step 1: Get candidate product IDs using inverted indexes
        candidate_ids = self.product_index.find_candidates(name, brand, size, max_candidates=500)
        
        if not candidate_ids:
            logger.debug("[INDEXED SEARCH] No candidates found in index")
            return []
        
        logger.debug(f"[INDEXED SEARCH] Found {len(candidate_ids)} candidates")
        
        # Step 2: Batch fetch candidate products
        candidates = self.product_index.get_products_batch(candidate_ids)
        
        # Step 3: Calculate similarity for each candidate
        for product_id, cached_product in candidates.items():
            # Build product dict for comparison
            cached_for_comparison = {
                'name': cached_product.get('name', ''),
                'brand_name': cached_product.get('brand_name', ''),
                'variety': cached_product.get('variety', ''),
                'size': cached_product.get('size', ''),
                'sizeRaw': cached_product.get('size', '')
            }
            
            # Calculate comprehensive similarity
            similarity_score, match_reasons = self.similarity_calculator.calculate_similarity(
                product_data, cached_for_comparison
            )
            
            # Only include matches above minimum threshold
            if similarity_score >= 0.5:
                match = ProductMatch(
                    product_id=product_id,
                    similarity_score=similarity_score,
                    matched_product={
                        'id': product_id,
                        'name': cached_product.get('name', ''),
                        'brand_name': cached_product.get('brand_name', ''),
                        'category': cached_product.get('category', ''),
                        'variety': cached_product.get('variety', ''),
                        'size': cached_product.get('size', ''),
                        'image_url': cached_product.get('image_url', '')
                    },
                    match_reasons=match_reasons,
                    is_duplicate=similarity_score >= self.similarity_threshold
                )
                all_matches.append(match)
        
        # Step 4: Sort by similarity score (descending)
        all_matches.sort(key=lambda x: x.similarity_score, reverse=True)
        
        # Log results
        if all_matches:
            logger.debug(f"[INDEXED SEARCH] Found {len(all_matches)} matches above 0.5 threshold")
            for i, m in enumerate(all_matches[:5]):
                logger.debug(f"  #{i+1}: '{m.matched_product.get('name')}' ({m.matched_product.get('brand_name')}) "
                           f"[{m.matched_product.get('size')}] - Score: {m.similarity_score:.3f}")
        
        return all_matches[:limit]
    
    def _find_similar_products_exhaustive(self, product_data: Dict, limit: int = 10) -> List[ProductMatch]:
        """
        EXHAUSTIVE MODE: Check ALL products - guaranteed to find the best match.
        
        This is O(n) and suitable for small datasets (<10K products).
        The proven working algorithm that never misses a match.
        """
        all_matches: List[ProductMatch] = []
        seen_product_ids: set = set()
        
        # Get product information and normalize for comparison
        name = product_data.get('name', '').strip()
        brand = product_data.get('brand_name', '').strip()
        variety = product_data.get('variety', '').strip()
        size = product_data.get('sizeRaw', '') or str(product_data.get('size', '')).strip()
        
        logger.debug(f"[EXHAUSTIVE SEARCH] Searching for: '{name}' | Brand: '{brand}' | Size: '{size}'")
        logger.debug(f"[EXHAUSTIVE SEARCH] Checking against {len(self.product_cache)} cached products")
        
        # EXHAUSTIVE APPROACH: Check similarity against ALL cached products
        for product_id, cache_entry in self.product_cache.items():
            if product_id in seen_product_ids:
                continue
            seen_product_ids.add(product_id)
            
            # Build cached product dict for comparison
            cached_product = {
                'name': cache_entry.name,
                'brand_name': cache_entry.brand_name,
                'variety': cache_entry.variety,
                'size': cache_entry.size,
                'sizeRaw': cache_entry.size  # Use size as sizeRaw for comparison
            }
            
            # Calculate comprehensive similarity using the similarity calculator
            similarity_score, match_reasons = self.similarity_calculator.calculate_similarity(
                product_data, cached_product
            )
            
            # Only include matches above a minimum threshold (0.5) to reduce noise
            if similarity_score >= 0.5:
                match = ProductMatch(
                    product_id=product_id,
                    similarity_score=similarity_score,
                    matched_product={
                        'id': cache_entry.product_id,
                        'name': cache_entry.name,
                        'brand_name': cache_entry.brand_name,
                        'category': cache_entry.category,
                        'variety': cache_entry.variety,
                        'size': cache_entry.size,
                        'image_url': getattr(cache_entry, 'image_url', '')
                    },
                    match_reasons=match_reasons,
                    is_duplicate=similarity_score >= self.similarity_threshold
                )
                all_matches.append(match)
        
        # Sort ALL matches by similarity score (descending)
        all_matches.sort(key=lambda x: x.similarity_score, reverse=True)
        
        # Log top matches for debugging
        if all_matches:
            logger.debug(f"[EXHAUSTIVE SEARCH] Found {len(all_matches)} potential matches above 0.5 threshold")
            for i, m in enumerate(all_matches[:5]):
                logger.debug(f"  #{i+1}: '{m.matched_product.get('name')}' ({m.matched_product.get('brand_name')}) "
                           f"[{m.matched_product.get('size')}] - Score: {m.similarity_score:.3f}")
        else:
            logger.debug("[EXHAUSTIVE SEARCH] No matches found above 0.5 threshold")
        
        return all_matches[:limit]

    def _find_tier1_exact_matches(self, name: str, brand: str, size: str) -> List[ProductMatch]:
        """Find perfect exact matches using optimized indexes for O(1) lookup."""
        matches = []
        
        # Normalize for comparison (case-insensitive, strip whitespace)
        target_name = name.lower().strip()
        target_brand = brand.lower().strip() if brand else ""
        target_size = size.lower().strip() if size else ""
        
        # Ultra-fast exact match using indexes
        
        # 1. Try exact name + brand + size match (O(1) lookup)
        if target_name and target_brand and target_size:
            name_brand_size_key = f"{target_name}|{target_brand}|{target_size}"
            if name_brand_size_key in self.exact_name_brand_size_index:
                product_id = self.exact_name_brand_size_index[name_brand_size_key]
                cache_entry = self.product_cache[product_id]
                
                match = ProductMatch(
                    product_id=product_id,
                    similarity_score=1.0,
                    matched_product={
                        'id': cache_entry.product_id,
                        'name': cache_entry.name,
                        'brand_name': cache_entry.brand_name,
                        'category': cache_entry.category,
                        'variety': cache_entry.variety,
                        'size': cache_entry.size,
                        'image_url': getattr(cache_entry, 'image_url', '')
                    },
                    match_reasons=["PERFECT EXACT MATCH: name + brand + size"],
                    is_duplicate=True
                )
                matches.append(match)
                return matches  # Return immediately for perfect matches
        
        # 1B. Try exact name + NO BRAND + size match (O(1) lookup for products without brands)
        elif target_name and not target_brand and target_size:
            name_no_brand_size_key = f"{target_name}||{target_size}"  # Double pipe for no brand
            if name_no_brand_size_key in self.exact_name_brand_size_index:
                product_id = self.exact_name_brand_size_index[name_no_brand_size_key]
                cache_entry = self.product_cache[product_id]
                
                match = ProductMatch(
                    product_id=product_id,
                    similarity_score=1.0,
                    matched_product={
                        'id': cache_entry.product_id,
                        'name': cache_entry.name,
                        'brand_name': cache_entry.brand_name,
                        'category': cache_entry.category,
                        'variety': cache_entry.variety,
                        'size': cache_entry.size,
                        'image_url': getattr(cache_entry, 'image_url', '')
                    },
                    match_reasons=["PERFECT EXACT MATCH: name + size (no brand)"],
                    is_duplicate=True
                )
                matches.append(match)
                return matches  # Return immediately for perfect matches
        
        # 2. Try exact name + brand match (O(1) lookup)
        if target_name and target_brand:
            name_brand_key = f"{target_name}|{target_brand}"
            if name_brand_key in self.exact_name_brand_index:
                candidate_ids = list(self.exact_name_brand_index[name_brand_key])
                local_matches: List[ProductMatch] = []

                for pid in candidate_ids:
                    cache_entry = self.product_cache[pid]
                    # Very high base score for exact name+brand; adjust for size
                    score = 0.98
                    if target_size and cache_entry.size:
                        if target_size == str(cache_entry.size).lower().strip():
                            score = 1.0
                    match = ProductMatch(
                        product_id=pid,
                        similarity_score=score,
                        matched_product={
                            'id': cache_entry.product_id,
                            'name': cache_entry.name,
                            'brand_name': cache_entry.brand_name,
                            'category': cache_entry.category,
                            'variety': cache_entry.variety,
                            'size': cache_entry.size,
                            'image_url': getattr(cache_entry, 'image_url', '')
                        },
                        match_reasons=["EXACT MATCH: name + brand (O(1) lookup)"],
                        is_duplicate=True
                    )
                    local_matches.append(match)

                # Prefer exact size; else highest score
                local_matches.sort(key=lambda m: (m.similarity_score, str(m.matched_product.get('size','')).lower().strip() == target_size), reverse=True)
                if local_matches:
                    matches.append(local_matches[0])
        
        return matches

    def _find_tier2_name_brand_matches(self, name: str, brand: str, size: str) -> List[ProductMatch]:
        """Find exact name + brand matches using optimized brand index with ranking."""
        matches: List[ProductMatch] = []
        
        target_name = name.lower().strip()
        target_brand = brand.lower().strip() if brand else ""
        
        # Skip if no brand provided (too ambiguous)
        if not target_brand or not target_name:
            return matches
        
        # Use optimized brand index for O(1) lookup
        if target_brand in self.brand_name_index:
            brand_products = self.brand_name_index[target_brand]

            # Check if exact name exists for this brand
            if target_name in brand_products:
                candidate_ids = list(brand_products[target_name])

                for product_id in candidate_ids:
                    cache_entry = self.product_cache[product_id]

                    # Build cached product dict for similarity calc
                    cached_product = {
                        'name': cache_entry.name,
                        'brand_name': cache_entry.brand_name,
                        'variety': cache_entry.variety,
                        'size': cache_entry.size
                    }
                    product_input = {
                        'name': name,
                        'brand_name': brand,
                        'variety': '',
                        'size': size
                    }
                    sim, reasons = self.similarity_calculator.calculate_similarity(product_input, cached_product)

                    # Strengthen exact-size ties
                    cache_size = cache_entry.size.lower().strip() if cache_entry.size else ""
                    target_size = size.lower().strip() if size else ""
                    if target_size and cache_size and target_size == cache_size:
                        sim = min(sim + 0.05, 1.0)
                        reasons.append("Size exact match bonus")

                    match = ProductMatch(
                        product_id=product_id,
                        similarity_score=sim,
                        matched_product={
                            'id': cache_entry.product_id,
                            'name': cache_entry.name,
                            'brand_name': cache_entry.brand_name,
                            'category': cache_entry.category,
                            'variety': cache_entry.variety,
                            'size': cache_entry.size,
                            'image_url': getattr(cache_entry, 'image_url', '')
                        },
                        match_reasons=["EXACT name and brand candidate"] + reasons,
                        is_duplicate=True
                    )
                    matches.append(match)

                # Rank by similarity desc with size tie-breaker
                def _tier2_key(m: ProductMatch):
                    size_eq = 1 if (size and str(m.matched_product.get('size', '')).lower().strip() == str(size).lower().strip()) else 0
                    return (m.similarity_score, size_eq)

                matches.sort(key=_tier2_key, reverse=True)
        
        return matches

    def _find_tier3_normalized_matches(self, name: str, brand: str, product_data: Dict) -> List[ProductMatch]:
        """Find normalized exact matches with multi-candidate ranking."""
        matches: List[ProductMatch] = []
        seen_product_ids = set()  # Track matched IDs to avoid duplicates.
        
        # Generate search tokens and normalized name
        # search_tokens = generate_search_tokens(name, brand, product_data.get('variety', ''))
        normalized_name = normalize_product_name(name, brand, remove_packaging=True)
        
        # Check normalized name index (may map to multiple product IDs)
        if normalized_name in self.normalized_names:
            candidate_ids = list(self.normalized_names[normalized_name])

            for product_id in candidate_ids:
                if product_id in seen_product_ids:
                    continue
                seen_product_ids.add(product_id)
                
                cache_entry = self.product_cache[product_id]
                cached_product = {
                    'name': cache_entry.name,
                    'brand_name': cache_entry.brand_name,
                    'variety': cache_entry.variety,
                    'size': cache_entry.size
                }
                sim, reasons = self.similarity_calculator.calculate_similarity(product_data, cached_product)

                match = ProductMatch(
                    product_id=product_id,
                    similarity_score=sim if sim >= 0.90 else 0.90,  # normalized hits get a strong baseline
                    matched_product={
                        'id': cache_entry.product_id,
                        'name': cache_entry.name,
                        'brand_name': cache_entry.brand_name,
                        'category': cache_entry.category,
                        'variety': cache_entry.variety,
                        'size': cache_entry.size,
                        'image_url': getattr(cache_entry, 'image_url', '')
                    },
                    match_reasons=["Exact normalized name candidate"] + reasons,
                    is_duplicate=True
                )
                matches.append(match)
        
        # Also check packaging variations.
        if brand:
            # Attempt brand-only matching when name equals brand.
            brand_normalized = normalize_product_name(brand, remove_packaging=True)
            name_normalized = normalize_product_name(name, remove_packaging=True)
            
            # If name contains brand or matches brand, search for brand variants.
            if brand_normalized in name_normalized or name_normalized in brand_normalized:
                if brand_normalized in self.normalized_names:
                    candidate_ids = list(self.normalized_names[brand_normalized])
                    
                    for product_id in candidate_ids:
                        if product_id in seen_product_ids:
                            continue
                        seen_product_ids.add(product_id)
                        
                        cache_entry = self.product_cache[product_id]
                        
                        # Only include if brand matches
                        if cache_entry.brand_name.lower().strip() == brand.lower().strip():
                            cached_product = {
                                'name': cache_entry.name,
                                'brand_name': cache_entry.brand_name,
                                'variety': cache_entry.variety,
                                'size': cache_entry.size
                            }
                            sim, reasons = self.similarity_calculator.calculate_similarity(product_data, cached_product)
                            
                            match = ProductMatch(
                                product_id=product_id,
                                similarity_score=sim if sim >= 0.85 else 0.85,
                                matched_product={
                                    'id': cache_entry.product_id,
                                    'name': cache_entry.name,
                                    'brand_name': cache_entry.brand_name,
                                    'category': cache_entry.category,
                                    'variety': cache_entry.variety,
                                    'size': cache_entry.size,
                                    'image_url': getattr(cache_entry, 'image_url', '')
                                },
                                match_reasons=["Brand-based normalized match"] + reasons,
                                is_duplicate=True
                            )
                            matches.append(match)

            # Rank by similarity with size tie-breaker
            def _tier3_key(m: ProductMatch):
                # Prefer exact size match
                target_size = (product_data.get('sizeRaw') or str(product_data.get('size', ''))).lower().strip()
                size_eq = 1 if (target_size and str(m.matched_product.get('size', '')).lower().strip() == target_size) else 0
                return (m.similarity_score, size_eq)

            matches.sort(key=_tier3_key, reverse=True)
        
        return matches

    def _find_tier4_fuzzy_matches(self, product_data: Dict, limit: int) -> List[ProductMatch]:
        """Find fuzzy matches using similarity algorithms."""
        matches = []
        
        # Get product information
        name = product_data.get('name', '')
        brand = product_data.get('brand_name', '')
        variety = product_data.get('variety', '')
        
        # Generate search tokens for filtering
        search_tokens = generate_search_tokens(name, brand, variety)
        
        # Filter candidates by token overlap for efficiency
        candidates = []
        for product_id, cache_entry in self.product_cache.items():
            # Quick token overlap filter
            token_overlap = len(search_tokens.intersection(cache_entry.search_tokens))
            if token_overlap > 0:
                candidates.append((product_id, cache_entry, token_overlap))
        
        # Sort candidates by token overlap for better performance
        candidates.sort(key=lambda x: x[2], reverse=True)
        
        # Take top candidates for detailed fuzzy matching
        max_candidates = min(50, len(candidates))  # Limit for performance
        
        for product_id, cache_entry, token_overlap in candidates[:max_candidates]:
            # Create product dict for comparison
            cached_product = {
                'name': cache_entry.name,
                'brand_name': cache_entry.brand_name,
                'variety': cache_entry.variety,
                'size': cache_entry.size
            }
            
            # Calculate detailed similarity
            similarity_score, reasons = self.similarity_calculator.calculate_similarity(product_data, cached_product)
            
            if similarity_score >= self.similarity_threshold:
                match = ProductMatch(
                    product_id=product_id,
                    similarity_score=similarity_score,
                    matched_product={
                        'id': cache_entry.product_id,
                        'name': cache_entry.name,
                        'brand_name': cache_entry.brand_name,
                        'category': cache_entry.category,
                        'variety': cache_entry.variety,
                        'size': cache_entry.size,
                        'image_url': getattr(cache_entry, 'image_url', '')
                    },
                    match_reasons=reasons,
                    is_duplicate=similarity_score >= self.exact_match_threshold
                )
                matches.append(match)
        
        return matches

    def is_duplicate(self, product_data: Dict) -> Tuple[bool, Optional[ProductMatch]]:
        """
        Check if a product is a duplicate of an existing product.
        
        Args:
            product_data: Product data to check
            
        Returns:
            (is_duplicate, best_match)
        """
        matches = self.find_similar_products(product_data, limit=1)
        
        if matches:
            best_match = matches[0]
            return best_match.is_duplicate, best_match
        
        return False, None

    def remove_product_from_cache(self, product_id: str) -> bool:
        """
        Remove a product from all in-memory cache structures.
        Call this after deleting a product so it no longer appears as a
        duplicate candidate.
        
        Returns True if the product was found and removed.
        """
        if product_id not in self.product_cache:
            return False

        entry = self.product_cache.pop(product_id)

        # Remove from normalized_names index
        if entry.normalized_name and entry.normalized_name in self.normalized_names:
            self.normalized_names[entry.normalized_name].discard(product_id)
            if not self.normalized_names[entry.normalized_name]:
                del self.normalized_names[entry.normalized_name]

        # Remove from brand_groups
        if entry.brand_name:
            brand_normalized = normalize_product_name(entry.brand_name)
            if brand_normalized in self.brand_groups:
                self.brand_groups[brand_normalized].discard(product_id)
                if not self.brand_groups[brand_normalized]:
                    del self.brand_groups[brand_normalized]

        # Remove from exact indexes
        name_clean = entry.name.lower().strip()
        brand_clean = entry.brand_name.lower().strip() if entry.brand_name else ""
        size_clean = entry.size.lower().strip() if entry.size else ""

        if name_clean and brand_clean:
            nb_key = f"{name_clean}|{brand_clean}"
            if nb_key in self.exact_name_brand_index:
                self.exact_name_brand_index[nb_key].discard(product_id)
                if not self.exact_name_brand_index[nb_key]:
                    del self.exact_name_brand_index[nb_key]

            if brand_clean in self.brand_name_index:
                if name_clean in self.brand_name_index[brand_clean]:
                    self.brand_name_index[brand_clean][name_clean].discard(product_id)
                    if not self.brand_name_index[brand_clean][name_clean]:
                        del self.brand_name_index[brand_clean][name_clean]
                if not self.brand_name_index[brand_clean]:
                    del self.brand_name_index[brand_clean]

        nbs_key = f"{name_clean}|{brand_clean}|{size_clean}"
        if nbs_key in self.exact_name_brand_size_index:
            if self.exact_name_brand_size_index[nbs_key] == product_id:
                del self.exact_name_brand_size_index[nbs_key]

        logger.debug("Product removed from cache", extra={"product_id": product_id})
        return True

    def update_product_in_cache(self, product_id: str, product_data: Dict) -> None:
        """
        Update an existing product in cache. Removes old entry, adds new one.
        Handles ID changes (migration) by removing old_id and adding new_id.
        """
        self.remove_product_from_cache(product_id)
        new_id = product_data.get('id', product_id)
        self.add_product_to_cache(new_id, product_data)

    def add_product_to_cache(self, product_id: str, product_data: Dict, skip_index: bool = False) -> None:
        """
        Add a new product to the local cache AND the scalable Redis index.
        
        CRITICAL: This must be called after creating a product to ensure
        duplicate detection works for subsequent uploads.
        
        Args:
            product_id: Product ID
            product_data: Product data
            skip_index: If True, skip the slow Redis index_product() call.
                        Use for bulk operations where 8+ HTTP calls per product
                        to Upstash would cause timeouts.
        """
        # Use sizeRaw for string comparison, fallback to stringified size
        size_for_comparison = product_data.get('sizeRaw', '') or str(product_data.get('size', ''))
        
        cache_entry = ProductCacheEntry(
            product_id=product_id,
            name=product_data.get('name', ''),
            brand_name=product_data.get('brand_name', ''),
            category=product_data.get('category', ''),
            variety=product_data.get('variety', ''),
            size=size_for_comparison,  # Use string format for comparison
            image_url=product_data.get('image_url', ''),
            normalized_name=normalize_product_name(
                product_data.get('name', ''),
                product_data.get('brand_name', ''),
                remove_packaging=True
            ),
            search_tokens=generate_search_tokens(
                product_data.get('name', ''),
                product_data.get('brand_name', ''),
                product_data.get('variety', '')
            ),
            last_updated=datetime.now()
        )
        
        self.product_cache[product_id] = cache_entry
        
        # Update normalized names index
        if cache_entry.normalized_name:
            if cache_entry.normalized_name not in self.normalized_names:
                self.normalized_names[cache_entry.normalized_name] = set()
            self.normalized_names[cache_entry.normalized_name].add(product_id)
        
        # Update brand groups
        brand = product_data.get('brand_name', '')
        if brand:
            brand_normalized = normalize_product_name(brand)
            if brand_normalized not in self.brand_groups:
                self.brand_groups[brand_normalized] = set()
            self.brand_groups[brand_normalized].add(product_id)
        
        # Update optimized exact match indexes
        name_clean = cache_entry.name.lower().strip()
        brand_clean = cache_entry.brand_name.lower().strip() if cache_entry.brand_name else ""
        size_clean = cache_entry.size.lower().strip() if cache_entry.size else ""
        
        if name_clean and brand_clean:
            name_brand_key = f"{name_clean}|{brand_clean}"
            if name_brand_key not in self.exact_name_brand_index:
                self.exact_name_brand_index[name_brand_key] = set()
            self.exact_name_brand_index[name_brand_key].add(product_id)
            
            if brand_clean not in self.brand_name_index:
                self.brand_name_index[brand_clean] = {}
            if name_clean not in self.brand_name_index[brand_clean]:
                self.brand_name_index[brand_clean][name_clean] = set()
            self.brand_name_index[brand_clean][name_clean].add(product_id)
        
        if name_clean and brand_clean and size_clean:
            name_brand_size_key = f"{name_clean}|{brand_clean}|{size_clean}"
            self.exact_name_brand_size_index[name_brand_size_key] = product_id
        elif name_clean and not brand_clean and size_clean:
            name_no_brand_size_key = f"{name_clean}||{size_clean}"
            self.exact_name_brand_size_index[name_no_brand_size_key] = product_id
        
        # CRITICAL: Also update the scalable Redis index for 1M+ products
        # Skip during bulk operations to avoid 8+ HTTP calls per product to Upstash
        if not skip_index and self.product_index.is_available():
            self.product_index.index_product(product_id, product_data)
            logger.debug("Product added to scalable index", extra={"product_id": product_id})
        
        logger.debug("Product added to cache", extra={
            "product_id": product_id,
            "name": cache_entry.name,
            "brand": cache_entry.brand_name
        })

    def get_cache_stats(self) -> Dict:
        """
        Get comprehensive cache statistics.
        """
        return {
            'total_products': len(self.product_cache),
            'normalized_names': len(self.normalized_names),
            'brand_groups': len(self.brand_groups),
            'fuzzy_matcher': self.similarity_calculator.fuzzy_matcher,
            'similarity_threshold': self.similarity_threshold,
            'exact_match_threshold': self.exact_match_threshold
        }

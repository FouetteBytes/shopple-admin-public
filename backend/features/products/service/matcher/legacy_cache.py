import json
import os
import sys
import time
import hashlib
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher
import re
from datetime import datetime, timedelta

from backend.services.system.logger_service import get_logger

logger = get_logger(__name__)

class IntelligentProductCache:
    """
    AI-powered intelligent caching system for product classifications
    Features:
    - Fuzzy matching with configurable similarity thresholds
    - Smart normalization for better matching
    - Cache expiration and versioning
    - Detailed match confidence scoring
    - Cache validation and correction capabilities
    """
    
    def __init__(self, cache_dir: str = None):
        # Set the default cache directory.
        if cache_dir is None:
              # Resolve the cache directory relative to the project root when not configured.
            project_root = os.environ.get('PROJECT_ROOT')
            if not project_root:
                # Derive the project root from the module location.
                 current_dir = os.path.abspath(__file__)  # .../backend/features/products/service/matcher/legacy_cache.py
                 backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))))
                 # backend_dir is .../backend.
                 project_root = os.path.dirname(backend_dir)
             
            cache_dir = os.path.join(project_root, "cache")
        
        self.cache_dir = cache_dir
        self.cache_file = os.path.join(cache_dir, "product_cache.json")
        self.metadata_file = os.path.join(cache_dir, "cache_metadata.json")
          # Configuration - more strict matching.
        self.similarity_threshold = 0.95  # Much higher threshold for cache hit (was 0.85).
        self.fuzzy_threshold = 0.6       # Higher threshold for fuzzy suggestions (was 0.3).
        self.max_cache_age_days = 30     # Cache expiration.
        self.cache_version = "1.1"       # Increment for improved logic.
        
        # Ensure cache directory exists.
        if not os.path.exists(cache_dir):
            try:
                os.makedirs(cache_dir, exist_ok=True)
            except Exception as e:
                logger.error(f"Failed to create cache dir {cache_dir}: {e}")
        
        # Lazy loading: do not load cache immediately.
        self.cache = None
        self.metadata = None
        self._cache_loaded = False
        
        # Statistics.
        self.stats = {
            'hits': 0,
            'misses': 0,
            'fuzzy_matches': 0,
            'total_requests': 0
        }
        
        logger.debug("Intelligent Product Cache initialized (lazy loading enabled)", extra={"cache_file": self.cache_file})
    
    def _load_cache(self) -> Dict:
        """Load cache from file."""
        try:
            if os.path.exists(self.cache_file):
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            logger.warning(f"Error loading cache: {e}", extra={"error": str(e)})
            return {}
    
    def _load_metadata(self) -> Dict:
        """Load cache metadata."""
        try:
            if os.path.exists(self.metadata_file):
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {
                'version': self.cache_version,
                'created': datetime.now().isoformat(),
                'last_cleanup': datetime.now().isoformat(),
                'entries_added': 0,
                'entries_removed': 0
            }
        except Exception as e:
            logger.warning("Error loading metadata", extra={"error": str(e), "metadata_file": self.metadata_file})
            return {}
    
    def _save_cache(self):
        """Save cache to file."""
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning("Error saving cache", extra={"error": str(e), "cache_file": self.cache_file})
    
    def _save_metadata(self):
        """Save metadata to file."""
        try:
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(self.metadata, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning("Error saving metadata", extra={"error": str(e)})

    def get_cache_stats(self) -> Dict:
        """Get cache statistics."""
        if not self._cache_loaded and self.cache is None:
             self.cache = self._load_cache()
             self._cache_loaded = True
        
        products = self.cache.get('products', {}) if self.cache else {}
        
        # Calculate valid vs expired
        cutoff = datetime.now() - timedelta(days=self.max_cache_age_days)
        valid_entries = 0
        expired_entries = 0
        
        for entry in products.values():
            ts_str = entry.get('timestamp') or entry.get('last_updated')
            if ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str)
                    if ts >= cutoff:
                        valid_entries += 1
                    else:
                        expired_entries += 1
                except:
                    expired_entries += 1
            else:
                expired_entries += 1

        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0

        return {
            'total_entries': len(products),
            'valid_entries': valid_entries,
            'expired_entries': expired_entries,
            'cache_hits': self.stats['hits'],
            'cache_misses': self.stats['misses'],
            'fuzzy_matches': self.stats['fuzzy_matches'],
            'hit_rate_percentage': round(hit_rate, 1),
            'cache_file_size': f"{os.path.getsize(self.cache_file) / 1024:.2f} KB" if os.path.exists(self.cache_file) else "0 KB"
        }

    def _adapt_entry(self, key: str, entry: Dict) -> Dict:
        """Adapt legacy entry format to new schema expected by frontend"""
        e = entry.copy()
        e['cache_key'] = key
        
        # If 'result' is missing, assume legacy format and adapt
        if 'result' not in e or not isinstance(e['result'], dict):
             adapted_result = {
                'product_type': e.get('category'), # Map category -> product_type
                'brand_name': e.get('brand_name', ''),
                'variety': e.get('variety'),
                'price': str(e.get('price', '0')),
                'size': e.get('size'),
                'product_name': e.get('name', ''),
                'model_used': 'legacy',
                'status': 'cached',
                'image_url': e.get('image_url')
            }
             e['result'] = adapted_result
             e['original_name'] = e.get('name', '')
        
        # Ensure timestamp exists
        if 'timestamp' not in e:
             e['timestamp'] = e.get('last_updated', datetime.now().isoformat())
             
        # Add validity check
        if 'is_valid' not in e:
            try:
                cutoff = datetime.now() - timedelta(days=self.max_cache_age_days)
                ts = datetime.fromisoformat(e['timestamp'])
                e['is_valid'] = (ts >= cutoff)
            except:
                e['is_valid'] = False
                
        if 'access_count' not in e:
            e['access_count'] = 0
            
        return e

    def get_config(self) -> Dict:
        """Get current cache configuration"""
        return {
            'similarity_threshold': self.similarity_threshold,
            'fuzzy_threshold': self.fuzzy_threshold,
            'max_age_days': self.max_cache_age_days,
            'version': self.cache_version
        }

    def configure_thresholds(self, similarity_threshold: float = None, fuzzy_threshold: float = None, max_age_days: int = None):
        """Update cache configuration"""
        if similarity_threshold is not None:
            self.similarity_threshold = float(similarity_threshold)
        if fuzzy_threshold is not None:
            self.fuzzy_threshold = float(fuzzy_threshold) 
        if max_age_days is not None:
            self.max_cache_age_days = int(max_age_days)
        logger.info(f"Updated cache config: sim={self.similarity_threshold}, fuzzy={self.fuzzy_threshold}, age={self.max_cache_age_days}")
        
    def _normalize_name(self, name: str) -> str:
        """Normalize product name for matching"""
        if not name:
            return ""
        # Lowercase, remove special chars, extra spaces
        name = name.lower()
        name = re.sub(r'[^a-z0-9\s]', '', name)
        return ' '.join(name.split())
    
    # ... existing methods ...

    def get_all_cache_entries(self) -> List[Dict]:
        """Get all cache entries"""
        if not self._cache_loaded:
             self.cache = self._load_cache()
             self._cache_loaded = True
             
        products = self.cache.get('products', {}) if self.cache else {}
        entries = []
        for key, val in products.items():
            entries.append(self._adapt_entry(key, val))
        return entries


    def _generate_cache_key(self, product_name: str, price: str, image_url: str) -> str:
        """Generate a consistent cache key"""
        norm_name = self._normalize_name(product_name)
        # Use name hash primarily
        return hashlib.md5(norm_name.encode('utf-8')).hexdigest()

    def _get_result_from_entry(self, entry: Dict) -> Dict:
        """Extract result dict from entry, handling both new and legacy formats"""
        # New format: entry has 'result' key with the classification
        if 'result' in entry and isinstance(entry['result'], dict):
            return entry['result']
        
        # Legacy format: fields are at top level (category, name, brand_name, etc.)
        return {
            'product_type': entry.get('category', entry.get('product_type', 'Unknown')),
            'brand_name': entry.get('brand_name', ''),
            'product_name': entry.get('name', entry.get('product_name', '')),
            'size': entry.get('size', ''),
            'variety': entry.get('variety', ''),
            'model_used': entry.get('model_used', 'CACHE_LEGACY'),
            'image_url': entry.get('image_url', '')
        }

    def find_cached_result(self, product_name: str, price: str, image_url: str) -> Optional[Dict]:
        """Find a result in the cache"""
        if not self._cache_loaded and self.cache is None:
             self.cache = self._load_cache()
             self._cache_loaded = True
        
        if not self.cache:
            return None

        # Try exact key match (if products logic used normalized keys)
        cache_key = self._generate_cache_key(product_name, price, image_url)
        products = self.cache.get('products', {})
        
        if cache_key in products:
            entry = products[cache_key]
            self.stats['hits'] += 1
            return {
                'match_type': 'exact',
                'confidence': 1.0,
                'cached_name': entry.get('original_name', entry.get('name', product_name)),
                'result': self._get_result_from_entry(entry),
                'cache_timestamp': entry.get('timestamp', entry.get('last_updated'))
            }
            
        # Scan original_name for legacy entries when keys differ.
        norm_input = self._normalize_name(product_name)
        
        # Fuzzy match logic - also check 'name' field for legacy entries
        for key, entry in products.items():
            entry_name = entry.get('original_name', entry.get('name', ''))
            if entry_name and self._normalize_name(entry_name) == norm_input:
                self.stats['hits'] += 1
                return {
                    'match_type': 'normalized_exact',
                    'confidence': 0.99,
                    'cached_name': entry_name,
                    'result': self._get_result_from_entry(entry),
                    'cache_timestamp': entry.get('timestamp', entry.get('last_updated'))
                }

        self.stats['misses'] += 1
        return None

    def cache_result(self, product_name: str, result: Dict, price: str, image_url: str):
        """Add a result to the cache"""
        if not self._cache_loaded:
             self.cache = self._load_cache()
             self._cache_loaded = True
        
        if self.cache is None:
            self.cache = {}
            
        if 'products' not in self.cache:
            self.cache['products'] = {}
            
        cache_key = self._generate_cache_key(product_name, price, image_url)
        
        entry = {
            'original_name': product_name,
            'result': result,
            'timestamp': datetime.now().isoformat(),
            'version': self.cache_version
        }
        
        self.cache['products'][cache_key] = entry
        self._save_cache()


    def get_cache_suggestions(self, product_name: str, limit: int = 5) -> List[Dict]:
        """Get suggestions from cache based on fuzzy match"""
        if not self._cache_loaded:
             self.cache = self._load_cache()
             self._cache_loaded = True
             
        products = self.cache.get('products', {}) if self.cache else {}
        if not products:
            return []
            
        suggestions = []
        norm_input = self._normalize_name(product_name)
        
        for key, raw_entry in products.items():
            entry = self._adapt_entry(key, raw_entry)
            name = entry.get('original_name', '')
            if not name: continue
            
            norm_name = self._normalize_name(name)
            similarity = SequenceMatcher(None, norm_input, norm_name).ratio()
            
            if similarity > self.fuzzy_threshold:
                suggestions.append({
                    'original_name': name,
                    'similarity': similarity,
                    'result': entry['result']
                })
        
        # Sort by similarity descending
        suggestions.sort(key=lambda x: x['similarity'], reverse=True)
        return suggestions[:limit]

    def update_cache_entry(self, cache_key: str, updated_result: Dict) -> bool:
        """Update a cache entry"""
        if not self._cache_loaded:
             self.cache = self._load_cache()
             self._cache_loaded = True
             
        products = self.cache.get('products', {}) if self.cache else {}
        if cache_key in products:
            products[cache_key]['result'] = updated_result
            products[cache_key]['timestamp'] = datetime.now().isoformat()
            self._save_cache()
            return True
        return False

    def delete_cache_entry(self, cache_key: str) -> bool:
        """Delete a cache entry"""
        if not self._cache_loaded:
             self.cache = self._load_cache()
             self._cache_loaded = True
             
        products = self.cache.get('products', {}) if self.cache else {}
        if cache_key in products:
            del products[cache_key]
            self._save_cache()
            return True
        return False

    def clear_cache(self):
        """Clear the entire cache"""
        self.cache = {'products': {}}
        self._save_cache()

    def cleanup_expired_entries(self) -> int:
        """Remove entries older than expiration"""
        if not self._cache_loaded:
             self.cache = self._load_cache()
             self._cache_loaded = True
             
        products = self.cache.get('products', {}) if self.cache else {}
        if not products:
            return 0
            
        expired_count = 0
        cutoff = datetime.now() - timedelta(days=self.max_cache_age_days)
        
        keys_to_remove = []
        for key, entry in products.items():
            ts_str = entry.get('timestamp')
            if ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str)
                    if ts < cutoff:
                        keys_to_remove.append(key)
                except:
                    pass
        
        for key in keys_to_remove:
            del products[key]
            expired_count += 1
            
        if expired_count > 0:
            self._save_cache()
            
        return expired_count

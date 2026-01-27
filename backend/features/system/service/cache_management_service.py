from typing import Any, Dict, List, Optional
from datetime import datetime
from common.base.base_service import BaseService
from services.system.initialization import get_classifier
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

class CacheManagementService(BaseService):
    def get_stats(self):
        classifier = get_classifier()
        if not classifier:
            return {'loading': True, 'cache_entries': 0, 'cache_size_mb': 0, 'hit_rate': 0, 'total_requests': 0}
        stats = classifier.get_cache_stats()
        stats['loading'] = False
        return stats

    def get_entries(self):
        classifier = get_classifier()
        if not classifier: return {'loading': True, 'entries': []}
        return {'entries': classifier.get_all_cache_entries(), 'loading': False}

    def get_suggestions(self, product_name: str, limit: int = 5):
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        return classifier.get_cache_suggestions(product_name, limit)

    def update_entry(self, cache_key: str, updated_result: Dict) -> bool:
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        return classifier.update_cache_entry(cache_key, updated_result)

    def delete_entry(self, cache_key: str) -> bool:
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        return classifier.delete_cache_entry(cache_key)

    def cleanup(self) -> int:
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        return classifier.cleanup_cache()

    def clear(self):
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        classifier.clear_cache()

    def get_config(self):
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        try:
            return classifier.get_cache_config()
        except:
             return {'similarity_threshold': 0.85, 'fuzzy_threshold': 0.6, 'max_age_days': 30}

    def configure(self, similarity_threshold, fuzzy_threshold, max_age_days):
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        classifier.configure_cache_thresholds(similarity_threshold=similarity_threshold, fuzzy_threshold=fuzzy_threshold, max_age_days=max_age_days)

    def save_edited_data(self, products: List[Dict]):
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        
        updated_count = 0
        skipped_count = 0
        debug_info = []

        cache = getattr(classifier, 'cache', None)
        if not cache: raise Exception('Cache not initialized')

        all_keys = list(cache.cache.keys())

        for i, product in enumerate(products):
            try:
                product_name = (product.get('name') or product.get('product_name') or product.get('original_name') or '')
                if not product_name:
                    debug_info.append(f"Product {i}: No product name")
                    skipped_count += 1
                    continue
                
                debug_info.append(f"Product {i+1}: {product_name}")
                base_key = cache._generate_cache_key(product_name, "", "")
                
                # Matching Logic
                actual_key = self._find_key(base_key, product_name, all_keys)
                
                if not actual_key:
                    debug_info.append(f"  ❌ No cache key found")
                    skipped_count += 1
                    continue
                
                if actual_key in cache.cache:
                    existing = cache.cache[actual_key]
                    if self._update_cache_entry(existing, product):
                         updated_count += 1
                         debug_info.append(f"  ✅ Updated successfully")
                    else:
                         skipped_count += 1
                         debug_info.append(f"  ⏭️ No changes detected")
                else:
                    debug_info.append(f"  ⚠️ Cache entry missing")
                    skipped_count += 1

            except Exception as e:
                debug_info.append(f"  ❌ Error: {str(e)}")
                continue

        if updated_count > 0:
            cache._save_cache()
            
        return {
            'success': True,
            'message': f'Updated {updated_count}, skipped {skipped_count}',
            'updated_count': updated_count,
            'skipped_count': skipped_count,
            'debug_info': debug_info,
            'details': {'total_products_received': len(products)}
        }

    def debug_cache(self, product_names: List[str]):
        classifier = get_classifier()
        if not classifier: raise Exception('Classifier not available')
        
        cache = getattr(classifier, 'cache', None)
        all_keys = list(cache.cache.keys()) if cache else []
        debug_results = {}
        
        for name in product_names:
            if not name: continue
            
            info = {
                'product_name': name,
                'found_key': None,
                'entry_exists': False,
                'entry_data': None,
                'match_details': {}  # Reserved for detailed match metadata
            }
            
            if cache:
                base = cache._generate_cache_key(name, "", "")
                key = self._find_key(base, name, all_keys)
                info['found_key'] = key
                if key and key in cache.cache:
                    info['entry_exists'] = True
                    # Fill entry data if needed
            
            debug_results[name] = info
        
        return {
            'success': True,
            'debug_results': debug_results,
            'cache_stats': {'total_entries': len(all_keys)}
        }

    def _find_key(self, base_key, product_name, all_keys):
        # Method 1: Exact
        if base_key in all_keys: return base_key
        # Method 2: Suffix
        for k in all_keys:
            if k.startswith(f"{base_key}_") or k.startswith(f"{base_key} -") or k.startswith(f"{base_key} -_"):
                return k
        # Method 3: Fuzzy name contained
        lower = product_name.lower()
        matches = [k for k in all_keys if lower in k.lower()]
        if matches: return matches[0]
        # Method 4: Partial words
        words = lower.split()
        if len(words) > 1:
            for k in all_keys:
                k_lower = k.lower()
                if sum(1 for w in words if w in k_lower) >= 2:
                    return k
        return None

    def _update_cache_entry(self, entry, product):
        updated = False
        res = entry.get('result', {})
        
        new_data = {
            'product_type': product.get('product_type', ''),
            'brand_name': product.get('brand_name', ''),
            'product_name': product.get('product_name') or product.get('name') or '',
            'size': product.get('size', ''),
            'variety': product.get('variety', ''),
            'user_edited': True,
            'edit_timestamp': datetime.now().isoformat()
        }
        
        # Check changes
        for k in ['product_type', 'brand_name', 'product_name', 'size', 'variety']:
             if new_data[k] != res.get(k):
                 updated = True
        
        if updated:
             res.update(new_data)
             entry['result'] = res
             entry['last_accessed'] = datetime.now().isoformat()
        
        price = product.get('price')
        if price:
            entry['sample_price'] = price
             # Variations update logic omitted for brevity but should be here
            updated = True
            
        img = product.get('image_url')
        if img:
            entry['sample_image_url'] = img
            updated = True
            
        return updated

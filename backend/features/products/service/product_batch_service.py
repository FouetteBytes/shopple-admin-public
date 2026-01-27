from typing import Any, Dict, List, Optional, Tuple
import os
from datetime import datetime
from google.cloud import firestore
from firebase_admin import firestore as admin_firestore

from services.system.logger_service import get_logger, log_error
from backend.features.products.service.product_image_service import ProductImageService
from backend.features.products.service.product_service import ProductService
from services.firebase.firebase_client import initialize_firebase
from utils.product_utils import parse_size_string

# Imports from migrated location
from backend.features.products.service.product_creation_service import process_ai_classified_product, validate_category
from backend.features.products.service.matcher import IntelligentProductMatcher

logger = get_logger(__name__)

class ProductBatchService:
    def __init__(self, product_service: ProductService, image_service: ProductImageService):
        self.product_service = product_service
        self.image_service = image_service
        try:
            self.db = initialize_firebase()
        except Exception as e:
            logger.warning(f"Failed to initialize Firestore for ProductBatchService: {e}")
            self.db = None
    
    def _get_matcher(self) -> IntelligentProductMatcher:
        
        project_root = os.getcwd()  # Assumes the current working directory is the project root.
        cache_file = os.path.join(project_root, 'cache', 'product_cache.pkl')
        
        matcher = IntelligentProductMatcher(
            cache_file=cache_file,
            similarity_threshold=0.75, 
            exact_match_threshold=0.95,
            cache_ttl_hours=24
        )
        # Only refresh cache if empty; do not block on DB query if the cache is populated.
        if len(matcher.product_cache) == 0:
            logger.info("Product cache empty, refreshing from database")
            matcher.refresh_cache_from_db(self.db)
        else:
            logger.info("Using existing product cache", extra={"cache_size": len(matcher.product_cache)})
        return matcher

    def preview_products(self, products: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Preview products before upload - validates, detects duplicates, and returns categorized results.
        Uses Redis-cached product data for duplicate detection via IntelligentProductMatcher.
        """
        if not products:
            raise ValueError('No products provided')

        logger.info("Starting product preview", extra={
            "total_products": len(products),
            "operation": "preview_products"
        })

        matcher = self._get_matcher()
        logger.info("Product matcher initialized", extra={
            "cache_size": len(matcher.product_cache) if hasattr(matcher, 'product_cache') else 0,
            "similarity_threshold": matcher.similarity_threshold if hasattr(matcher, 'similarity_threshold') else 'N/A'
        })
        
        # Preview data structure.
        preview_data = {
            'new_products': [],
            'duplicate_matches': [],
            'invalid_entries': [],
            'stats': {
                'total': len(products),
                'valid_count': 0,
                'new_count': 0,
                'duplicate_count': 0,
                'invalid_count': 0,
                'processed': 0
            }
        }
        
        valid_products = []
        
        # Pass 1: validation.
        logger.info("Pass 1: Validating product entries")
        for index, product_data in enumerate(products):
            preview_data['stats']['processed'] += 1
            validation_issues = self._validate_product_entry(product_data)
            
            if validation_issues:
                preview_data['stats']['invalid_count'] += 1
                preview_data['invalid_entries'].append({
                    'index': index,
                    'content': product_data,
                    'issues': validation_issues,
                    'suggested_fixes': self._get_suggested_fixes(validation_issues)
                })
                logger.debug("Invalid product entry", extra={
                    "index": index,
                    "product_name": product_data.get('product_name', 'Unknown'),
                    "issues": validation_issues
                })
            else:
                valid_products.append((index, product_data))
                preview_data['stats']['valid_count'] += 1
        
        logger.info("Validation complete", extra={
            "valid_count": preview_data['stats']['valid_count'],
            "invalid_count": preview_data['stats']['invalid_count']
        })
        
        # Pass 2: duplicate detection using Redis-cached products.
        logger.info("Pass 2: Detecting duplicates against cached products")
        for index, product_data in valid_products:
            try:
                preview_data['stats']['processed'] += 1
                result = process_ai_classified_product(product_data, self.db, dry_run=True)
                
                if result['success']:
                    product_id = result['product_id']
                    product_doc = result['product_doc']
                    
                    # Log duplicate-search inputs.
                    logger.info("Searching for duplicates", extra={
                        "product_name": product_doc.get('name', ''),
                        "brand": product_doc.get('brand_name', ''),
                        "size": product_doc.get('sizeRaw', '') or product_doc.get('size', '')
                    })
                    
                    # Find similar products using the intelligent matcher (Redis-backed)
                    all_matches = matcher.find_similar_products(product_doc, limit=100)
                    
                    # Log ALL matches found for debugging
                    if all_matches:
                        top_matches_info = [{
                            "rank": i + 1,
                            "name": m.matched_product.get('name', ''),
                            "brand": m.matched_product.get('brand_name', ''),
                            "size": m.matched_product.get('size', ''),
                            "score": round(m.similarity_score, 3),
                            "reasons": m.match_reasons[:2]  # First 2 reasons
                        } for i, m in enumerate(all_matches[:5])]  # Top 5 matches
                        logger.info("Top matches found", extra={"matches": top_matches_info})
                    else:
                        logger.info("No matches found for product")
                    
                    best_match = all_matches[0] if all_matches else None
                    is_duplicate = best_match.similarity_score >= 0.70 if best_match else False
                    
                    if is_duplicate:
                        preview_data['stats']['duplicate_count'] += 1
                        duplicate_match = self._build_duplicate_match(product_id, product_doc, product_data, best_match)
                        preview_data['duplicate_matches'].append(duplicate_match)
                        logger.info("Duplicate detected", extra={
                            "new_product": product_doc.get('name', ''),
                            "matched_product": best_match.matched_product.get('name', ''),
                            "similarity_score": best_match.similarity_score,
                            "match_reasons": best_match.match_reasons
                        })
                    else:
                        preview_data['stats']['new_count'] += 1
                        new_product = self._build_new_product(product_id, product_doc, product_data)
                        preview_data['new_products'].append(new_product)
                        logger.debug("New product identified", extra={
                            "product_id": product_id,
                            "product_name": product_doc.get('name', ''),
                            "has_image": bool(new_product.get('image_url'))
                        })
                else:
                    logger.warning("Failed to process product", extra={
                        "product_name": product_data.get('product_name', 'Unknown'),
                        "error": result.get('error', 'Unknown error')
                    })
            except Exception as e:
                logger.warning("Error processing product for preview", extra={
                    "product_name": product_data.get('product_name', 'Unknown'),
                    "error": str(e)
                })

        logger.info("Product preview complete", extra={
            "total": preview_data['stats']['total'],
            "new_count": preview_data['stats']['new_count'],
            "duplicate_count": preview_data['stats']['duplicate_count'],
            "invalid_count": preview_data['stats']['invalid_count']
        })

        return preview_data

    def confirm_products(self, selected_products: List[Dict[str, Any]], duplicate_decisions: Dict[str, str]) -> Dict[str, Any]:
        stats = {
            'total': len(selected_products),
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'errors': 0,
            'error_details': []
        }
        
        logger.info("Starting product confirmation", extra={
            "total_products": len(selected_products),
            "duplicate_decisions_count": len(duplicate_decisions),
            "decisions_breakdown": {k: list(duplicate_decisions.values()).count(v) for k, v in set(duplicate_decisions.items())} if duplicate_decisions else {}
        })
        
        # Get the matcher to update cache after creating products
        matcher = self._get_matcher()
        
        products_ref = self.db.collection('products')
        batch = self.db.batch()
        batch_count = 0
        batch_size = 50
        
        # Track products to add to cache
        products_to_cache = []
        
        for product_data in selected_products:
            try:
                product_id = product_data.get('product_id', '')
                decision = duplicate_decisions.get(product_id, 'create')
                
                if decision == 'skip':
                    stats['skipped'] += 1
                    logger.debug("Skipping product", extra={
                        "product_id": product_id,
                        "product_name": product_data.get('product_name', '')
                    })
                    continue
                
                size_raw = product_data.get('size', '')
                size_value, size_unit = parse_size_string(size_raw)
                
                source_image_url = product_data.get('image_url', '')
                firebase_image_url = source_image_url 
                
                if source_image_url:
                    success, new_url, error = self.image_service.process_product_image(product_id, source_image_url)
                    if success and new_url:
                        firebase_image_url = new_url
                
                product_doc = {
                    'id': product_id,
                    'name': product_data.get('product_name', ''),
                    'brand_name': product_data.get('brand_name', ''),
                    'category': product_data.get('category', ''),
                    'variety': product_data.get('variety', ''),
                    'size': size_value,
                    'sizeUnit': size_unit,
                    'sizeRaw': size_raw,
                    'image_url': firebase_image_url,
                    'original_source_url': source_image_url,
                    'original_name': product_data.get('original_name', ''),
                    'created_at': admin_firestore.SERVER_TIMESTAMP,
                    'updated_at': admin_firestore.SERVER_TIMESTAMP,
                    'is_active': True
                }
                
                if decision == 'update_existing':
                    doc_ref = products_ref.document(product_id)
                    existing_doc = doc_ref.get()
                    if existing_doc.exists:
                        existing_data = existing_doc.to_dict()
                        old_image_url = existing_data.get('image_url', '')
                        if old_image_url != firebase_image_url and firebase_image_url:
                            success, updated_url, error = self.image_service.update_product_image(product_id, old_image_url, source_image_url)
                            if success:
                                product_doc['image_url'] = updated_url
                        
                        updated_doc = {**existing_data, **product_doc}
                        updated_doc['last_updated'] = datetime.now().isoformat()
                        batch.update(doc_ref, updated_doc)
                        stats['updated'] += 1
                        logger.info("Updating existing product", extra={
                            "product_id": product_id,
                            "product_name": product_data.get('product_name', ''),
                            "decision": decision
                        })
                    else:
                        batch.set(doc_ref, product_doc)
                        stats['created'] += 1
                        logger.info("Creating product (existing not found)", extra={
                            "product_id": product_id,
                            "product_name": product_data.get('product_name', ''),
                            "decision": decision
                        })
                    batch_count += 1
                
                elif decision in ('create_anyway', 'create'):
                    doc_ref = products_ref.document(product_id)
                    batch.set(doc_ref, product_doc)
                    stats['created'] += 1
                    
                    # CRITICAL: Add to cache for duplicate detection
                    products_to_cache.append((product_id, product_doc))
                    
                    logger.info("Creating new product", extra={
                        "product_id": product_id,
                        "product_name": product_data.get('product_name', ''),
                        "decision": decision,
                        "has_image": bool(firebase_image_url)
                    })
                    batch_count += 1
                
                if batch_count >= batch_size:
                    batch.commit()
                    logger.info("Committed batch", extra={"batch_size": batch_count})
                    batch = self.db.batch()
                    batch_count = 0

            except Exception as e:
                stats['errors'] += 1
                stats['error_details'].append({'product': product_data.get('product_name', 'Unknown'), 'error': str(e)})
                logger.error("Error confirming product", extra={
                    "product_name": product_data.get('product_name', 'Unknown'),
                    "error": str(e)
                })

        if batch_count > 0:
            batch.commit()
            logger.info("Committed final batch", extra={"batch_size": batch_count})
        
        # CRITICAL: Update cache with all newly created products
        # This ensures duplicate detection works for subsequent uploads
        if products_to_cache:
            logger.info("Updating cache with new products", extra={"count": len(products_to_cache)})
            for product_id, product_doc in products_to_cache:
                matcher.add_product_to_cache(product_id, product_doc)
            
            # Save the updated cache to Redis/disk
            matcher.save_cache()
            logger.info("Cache updated and saved", extra={"new_products": len(products_to_cache)})
        
        self.product_service.repository.invalidate_product_stats() # Invalidate cache
        self.product_service.repository.invalidate_product_lists()
        
        logger.info("Product confirmation complete", extra={
            "total": stats['total'],
            "created": stats['created'],
            "updated": stats['updated'],
            "skipped": stats['skipped'],
            "errors": stats['errors']
        })

        return stats

    # --- Helpers ---
    def _validate_product_entry(self, data: Dict) -> List[str]:
        issues = []
        if not isinstance(data, dict):
            return ["Entry is not a dictionary/object"]
        if not data:
            return ["Entry is empty"]
        if len(data) <= 2 and 'status' in data:
            return ["Entry contains only status field (likely processing artifact)"]
        
        required = {'product_type': 'Category/product type', 'product_name': 'Product name'}
        for field, desc in required.items():
            if field not in data:
                issues.append(f"Missing required field: {desc} ({field})")
            elif not data.get(field):
                issues.append(f"Empty required field: {desc} ({field})")
        
        if data.get('product_type'):
            is_valid, _ = validate_category(data.get('product_type'), self.db)
            if not is_valid:
                issues.append(f"Invalid category: '{data.get('product_type')}'")
        return issues

    def _get_suggested_fixes(self, issues: List[str]) -> List[str]:
        fixes = []
        for issue in issues:
            if "Entry is empty" in issue: fixes.append("Remove this empty entry")
            elif "processing artifact" in issue: fixes.append("Remove this entry")
            elif "Missing required field" in issue: fixes.append("Add missing field")
            elif "Invalid category" in issue: fixes.append("Use a valid category")
            else: fixes.append("Check entry structure")
        return fixes

    def _determine_duplicate_type(self, similarity_score: float, match_reasons: List[str]) -> str:
        """
        Determine the duplicate type based on similarity score and match reasons.
        
        Types:
        - 'exact': similarity_score >= 0.99 OR exact normalized name match
        - 'brand_variety': Brand-named product matching OR (brand match + variety match)
        - 'fuzzy': Everything else (partial matches)
        """
        # Check for exact match first
        if similarity_score >= 0.99:
            return 'exact'
        
        # Check match reasons for specific patterns
        reasons_str = ' '.join(match_reasons).lower()
        
        # Exact normalized name match indicates EXACT type
        if 'exact normalized name match' in reasons_str:
            return 'exact'
        
        # Brand-named product matching indicates BRAND_VARIETY
        if 'brand-named product matching' in reasons_str:
            return 'brand_variety'
        
        # Brand match + Variety match also indicates BRAND_VARIETY
        has_brand_match = 'brand match' in reasons_str or 'similar brand' in reasons_str
        has_variety_match = 'variety match' in reasons_str
        if has_brand_match and has_variety_match:
            return 'brand_variety'
        
        # Default to fuzzy
        return 'fuzzy'

    def _build_duplicate_match(self, product_id, product_doc, product_data, best_match):
        from difflib import SequenceMatcher
        
        existing = best_match.matched_product
        
        # Calculate detailed similarity scores
        new_name = product_doc.get('name', '').lower().strip()
        existing_name = existing.get('name', '').lower().strip()
        new_brand = product_doc.get('brand_name', '').lower().strip()
        existing_brand = existing.get('brand_name', '').lower().strip()
        new_size = str(product_doc.get('size', '')).lower().strip()
        existing_size = str(existing.get('size', '')).lower().strip()
        
        # Calculate individual similarity scores
        name_similarity = SequenceMatcher(None, new_name, existing_name).ratio() if new_name and existing_name else 0.0
        brand_similarity = SequenceMatcher(None, new_brand, existing_brand).ratio() if new_brand and existing_brand else 0.0
        size_similarity = 1.0 if new_size == existing_size else (SequenceMatcher(None, new_size, existing_size).ratio() if new_size and existing_size else 0.0)
        
        # Calculate token overlap
        new_tokens = set(new_name.split())
        existing_tokens = set(existing_name.split())
        token_overlap = (len(new_tokens & existing_tokens) / len(new_tokens | existing_tokens) * 100) if (new_tokens | existing_tokens) else 0.0
        
        return {
            'new_product': {
                'product_id': product_id,
                'product_name': product_doc.get('name', ''),
                'brand_name': product_doc.get('brand_name', ''),
                'category': product_doc.get('category', ''),
                'variety': product_doc.get('variety', ''),
                'size': product_doc.get('size', ''),
                'sizeUnit': product_doc.get('sizeUnit', ''),
                'sizeRaw': product_doc.get('sizeRaw', ''),
                'image_url': product_doc.get('image_url', '') or product_data.get('image_url', '') or product_data.get('image', ''),
                'original_name': product_data.get('original_name', product_data.get('product_name', ''))
            },
            'existing_product': {
                'product_id': best_match.product_id,
                'product_name': existing.get('name', ''),
                'brand_name': existing.get('brand_name', ''),
                'category': existing.get('category', ''),
                'variety': existing.get('variety', ''),
                'size': existing.get('size', ''),
                'sizeUnit': existing.get('sizeUnit', ''),
                'sizeRaw': existing.get('sizeRaw', ''),
                'image_url': existing.get('image_url', ''),
            },
            'similarity_score': best_match.similarity_score,
            'match_reasons': best_match.match_reasons,
            'duplicate_type': self._determine_duplicate_type(best_match.similarity_score, best_match.match_reasons),
            'match_details': {
                'name_similarity': name_similarity,
                'brand_similarity': brand_similarity,
                'size_similarity': size_similarity,
                'normalized_name_match': new_name == existing_name,
                'token_overlap': token_overlap
            }
        }

    def _build_new_product(self, product_id, product_doc, product_data):
        """Build a new product entry for preview display."""
        return {
            'product_id': product_id,
            'product_name': product_doc.get('name', ''),
            'brand_name': product_doc.get('brand_name', ''),
            'category': product_doc.get('category', ''),
            'variety': product_doc.get('variety', ''),
            'size': product_doc.get('size', ''),
            'sizeUnit': product_doc.get('sizeUnit', ''),
            'sizeRaw': product_doc.get('sizeRaw', '') or str(product_doc.get('size', '')),
            'image_url': product_doc.get('image_url', '') or product_data.get('image_url', '') or product_data.get('image', ''),
            'original_name': product_data.get('original_name', product_data.get('product_name', '')),
            'confidence_score': product_data.get('confidence', 0.0),
            'selected': True
        }

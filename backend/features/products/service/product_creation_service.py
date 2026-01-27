#!/usr/bin/env python3
"""
Create Products Collection in Firestore
=======================================

This script creates the 'products' collection in Firestore with smart product ID generation
and processes AI-classified product data.

This must be run AFTER the categories collection is created since products reference categories.
"""

import os
import sys
import json
import re
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import unicodedata

from backend.services.system.logger_service import get_logger, log_error
from backend.utils.product_utils import generate_product_id, normalize_text

logger = get_logger(__name__)

# Import the intelligent product matcher
from backend.features.products.service.matcher import IntelligentProductMatcher

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    logger.debug("Firebase Admin SDK imported successfully")
except ImportError as e:
    logger.error("Error importing Firebase Admin SDK", extra={"error": str(e), "install_command": "pip install firebase-admin"})
    sys.exit(1)

# Category mapping from AI classifier to normalized category IDs
CATEGORY_MAPPING = {
    "Rice & Grains": "rice_grains",
    "Lentils & Pulses": "lentils_pulses", 
    "Spices & Seasonings": "spices_seasonings",
    "Coconut Products": "coconut_products",
    "Canned Food": "canned_food",
    "Snacks": "snacks",
    "Beverages": "beverages",
    "Dairy": "dairy",
    "Meat": "meat",
    "Seafood": "seafood",
    "Dried Seafood": "dried_seafood",
    "Frozen Food": "frozen_food",
    "Salt": "salt",
    "Sugar": "sugar",
    "Vegetables": "vegetables",
    "Fruits": "fruits",
    "Dried Fruits": "dried_fruits",
    "Bread & Bakery": "bread_bakery",
    "Noodles & Pasta": "noodles_pasta",
    "Instant Foods": "instant_foods",
    "Oil & Vinegar": "oil_vinegar",
    "Condiments & Sauces": "condiments_sauces",
    "Pickles & Preserves": "pickles_preserves",
    "Sweets & Desserts": "sweets_desserts",
    "Tea & Coffee": "tea_coffee",
    "Flour & Baking": "flour_baking",
    "Nuts & Seeds": "nuts_seeds",
    "Eggs": "eggs",
    "Baby Food": "baby_food",
    "Cereal": "cereal",
    "Health & Supplements": "health_supplements",
    "Household Items": "household_items",
    "Paper Products": "paper_products",
    "Cleaning Supplies": "cleaning_supplies",
    "Personal Care": "personal_care",
    "Pet Food & Supplies": "pet_food_supplies"
}

# normalize_text and generate_product_id moved to backend/utils/product_utils.py

def validate_category(category_name: str, db: firestore.Client) -> Tuple[bool, str]:
    """
    Validate that a category exists in the categories collection.
    
    Returns:
        (is_valid, normalized_category_id)
    """
    if not category_name:
        return False, ""
    
    # Get normalized category ID
    normalized_id = CATEGORY_MAPPING.get(category_name)
    if not normalized_id:
        return False, ""
    
    try:
        # Check if category document exists
        category_ref = db.collection('categories').document(normalized_id)
        category_doc = category_ref.get()
        
        if category_doc.exists:
            return True, normalized_id
        else:
            return False, normalized_id
            
    except Exception as e:
        log_error(logger, e, {"context": "Error validating category", "category_name": category_name})
        return False, ""

def fuzzy_match_products(new_product: Dict, existing_products: List[Dict], threshold: float = 0.8) -> Optional[Dict]:
    """
    Check if a new product is similar to existing products to prevent duplicates.
    
    Simple implementation - in production, you might want to use more sophisticated
    fuzzy matching libraries like fuzzywuzzy or similar.
    """
    from difflib import SequenceMatcher
    
    new_name = new_product.get('name', '').lower()
    new_brand = new_product.get('brand_name', '').lower()
    new_variety = new_product.get('variety', '').lower()
    new_size = new_product.get('size', '').lower()
    
    for existing in existing_products:
        existing_name = existing.get('name', '').lower()
        existing_brand = existing.get('brand_name', '').lower()
        existing_variety = existing.get('variety', '').lower()
        existing_size = existing.get('size', '').lower()
        
        # Calculate similarity scores
        name_similarity = SequenceMatcher(None, new_name, existing_name).ratio()
        brand_similarity = SequenceMatcher(None, new_brand, existing_brand).ratio()
        variety_similarity = SequenceMatcher(None, new_variety, existing_variety).ratio()
        size_similarity = SequenceMatcher(None, new_size, existing_size).ratio()
        
        # Weighted average (name and brand are more important)
        overall_similarity = (
            name_similarity * 0.4 + 
            brand_similarity * 0.3 + 
            variety_similarity * 0.2 + 
            size_similarity * 0.1
        )
        
        if overall_similarity >= threshold:
            return existing
    
    return None

def process_ai_classified_product(product_data: Dict, db: firestore.Client, dry_run: bool = False) -> Dict:
    """
    Process a single AI-classified product and convert it to Firestore format.
    
    Args:
        product_data: AI classification result
        db: Firestore client
        
    Returns:
        Dict with product document data or error info
    """
    try:
        # Extract required fields
        product_type = product_data.get('product_type', '')
        brand_name = product_data.get('brand_name')
        product_name = product_data.get('product_name', '')
        size = product_data.get('size', '')
        variety = product_data.get('variety', '')
        price = product_data.get('price', '')
        image_url = product_data.get('image_url', '') or product_data.get('image', '')
        original_name = product_data.get('original_name', product_name)
        
        # Validate category
        is_valid_category, normalized_category = validate_category(product_type, db)
        if not is_valid_category:
            return {
                'success': False,
                'error': f"Invalid category: {product_type}",
                'product_name': product_name
            }
        
        # Generate product ID
        product_id = generate_product_id(brand_name, product_name, size)
        
        # Validate required fields
        if not product_name:
            return {
                'success': False,
                'error': "Product name is required",
                'product_data': product_data
            }
        
        if not product_id or product_id == "none__":
            return {
                'success': False,
                'error': "Could not generate valid product ID",
                'product_data': product_data
            }
        
        # Create product document
        product_doc = {
            'id': product_id,
            'name': product_name,
            'brand_name': brand_name if brand_name else '',
            'category': normalized_category,
            'variety': variety if variety else '',
            'size': size if size else '',
            'image_url': image_url,
            'original_name': original_name,
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP,
            'is_active': True
        }
        
        return {
            'success': True,
            'product_id': product_id,
            'product_doc': product_doc,
            'category': normalized_category,
            'brand_name': brand_name,
            'product_name': product_name
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'product_data': product_data
        }

def initialize_firebase() -> firestore.Client:
    """Initialize Firebase Admin SDK and return Firestore client."""
    
    try:
        # Check if Firebase app is already initialized
        if firebase_admin._apps:
            return firestore.client()

        # Try environment variables
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
        private_key = os.getenv("FIREBASE_PRIVATE_KEY")

        if project_id and client_email and private_key:
            cred = credentials.Certificate({
                "type": "service_account",
                "project_id": project_id,
                "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
                "private_key": private_key.replace("\\n", "\n"),
                "client_email": client_email,
                "client_id": os.getenv("FIREBASE_CLIENT_ID", ""),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email}"
            })
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized from environment variables")
            return firestore.client()
        else:
            logger.error("Firebase credentials not found in environment variables")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Error initializing Firebase: {e}")
        sys.exit(1)
        
    except Exception as e:
        log_error(logger, e, {"context": "Error initializing Firebase"})
        sys.exit(1)

def clear_products_collection(db: firestore.Client) -> None:
    """Clear all existing products from the collection."""
    
    logger.info("Clearing existing products collection")
    
    try:
        products_ref = db.collection('products')
        
        # Get all documents
        docs = products_ref.stream()
        
        # Delete in batches
        batch = db.batch()
        batch_count = 0
        deleted_count = 0
        
        for doc in docs:
            batch.delete(doc.reference)
            batch_count += 1
            deleted_count += 1
            
            # Commit batch when it reaches 500 (Firestore limit)
            if batch_count >= 500:
                batch.commit()
                batch = db.batch()
                batch_count = 0
                logger.debug("Batch deletion progress", extra={"deleted_count": deleted_count})
        
        # Commit any remaining deletions
        if batch_count > 0:
            batch.commit()
        
        logger.info("Cleared products from collection", extra={"deleted_count": deleted_count})
        
    except Exception as e:
        log_error(logger, e, {"context": "Error clearing products collection"})

def create_products_from_json(db: firestore.Client, json_file_path: str) -> None:
    """
    Create products collection from AI-classified JSON file with intelligent duplicate detection.
    
    Args:
        db: Firestore client
        json_file_path: Path to AI-classified products JSON file
    """
    
    if not os.path.exists(json_file_path):
        logger.error("JSON file not found", extra={"file_path": json_file_path})
        return
    
    try:
        # Load AI-classified products data
        with open(json_file_path, 'r', encoding='utf-8') as f:
            products_data = json.load(f)
        
        logger.info("Loaded products from JSON file", extra={"product_count": len(products_data), "file_path": json_file_path})
        
        # Initialize intelligent product matcher
        cache_file = os.path.join(os.path.dirname(__file__), "product_cache.pkl")
        matcher = IntelligentProductMatcher(
            cache_file=cache_file,
            similarity_threshold=0.85,
            exact_match_threshold=0.95,
            cache_ttl_hours=24
        )
        
        # Refresh cache from database
        logger.info("Refreshing product cache from database")
        matcher.refresh_cache_from_db(db)
        
        # Process products
        products_ref = db.collection('products')
        
        # Track statistics
        stats = {
            'total': len(products_data),
            'processed': 0,
            'created': 0,
            'duplicates': 0,
            'fuzzy_duplicates': 0,
            'errors': 0,
            'categories': set(),
            'duplicate_details': []
        }
        
        # Process in batches for better performance
        batch_size = 50
        batch = db.batch()
        batch_count = 0
        
        for i, product_data in enumerate(products_data):
            stats['processed'] += 1
            
            # Process the product
            result = process_ai_classified_product(product_data, db)
            
            if result['success']:
                product_id = result['product_id']
                product_doc = result['product_doc']
                
                # Use intelligent matcher to check for duplicates
                is_duplicate, best_match = matcher.is_duplicate(product_doc)
                
                if is_duplicate:
                    stats['duplicates'] += 1
                    
                    # Determine duplicate type
                    if best_match.similarity_score >= 0.99:
                        duplicate_type = "exact"
                    elif best_match.similarity_score >= matcher.exact_match_threshold:
                        duplicate_type = "near_exact"
                    else:
                        duplicate_type = "fuzzy"
                        stats['fuzzy_duplicates'] += 1
                    
                    # Store duplicate details
                    duplicate_info = {
                        'new_product': result['product_name'],
                        'new_id': product_id,
                        'existing_product': best_match.matched_product['name'],
                        'existing_id': best_match.product_id,
                        'similarity_score': best_match.similarity_score,
                        'match_reasons': best_match.match_reasons,
                        'duplicate_type': duplicate_type
                    }
                    stats['duplicate_details'].append(duplicate_info)
                    
                    logger.debug("Duplicate product detected", extra={
                        "index": stats['processed'],
                        "product_name": result['product_name'],
                        "matches": best_match.matched_product['name'],
                        "score": f"{best_match.similarity_score:.2f}",
                        "reasons": ', '.join(best_match.match_reasons)
                    })
                    continue
                
                # Check if product ID already exists in database (fallback)
                existing_doc = products_ref.document(product_id).get()
                if existing_doc.exists:
                    stats['duplicates'] += 1
                    logger.warning("Product ID collision", extra={"index": stats['processed'], "product_id": product_id, "product_name": result['product_name']})
                    continue
                
                # Add to batch
                doc_ref = products_ref.document(product_id)
                batch.set(doc_ref, product_doc)
                batch_count += 1
                stats['created'] += 1
                stats['categories'].add(result['category'])
                
                # Add to intelligent matcher cache
                matcher.add_product_to_cache(product_id, product_doc)
                
                logger.debug("Product created", extra={"index": stats['processed'], "product_name": result['product_name'], "product_id": product_id})
                
                # Commit batch when it reaches batch_size
                if batch_count >= batch_size:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0
                    logger.info("Committed product batch", extra={"batch_size": batch_size})
            else:
                stats['errors'] += 1
                logger.error("Product creation error", extra={"error": result['error'], "product_name": result.get('product_name', 'unknown')})
        
        # Commit any remaining products in the batch
        if batch_count > 0:
            batch.commit()
            logger.info("Committed final product batch", extra={"batch_count": batch_count})
        
        # Save updated cache
        matcher.save_cache()
        
        # Log summary
        logger.info("Products creation summary", extra={
            "total": stats['total'],
            "processed": stats['processed'],
            "created": stats['created'],
            "duplicates": stats['duplicates'],
            "fuzzy_duplicates": stats['fuzzy_duplicates'],
            "errors": stats['errors'],
            "categories_count": len(stats['categories']),
            "categories": ', '.join(sorted(stats['categories']))
        })
        
        # Log duplicate details if any
        if stats['duplicate_details']:
            dup_details = stats['duplicate_details'][:10]
            logger.debug("Duplicate detection details", extra={
                "total_duplicates": len(stats['duplicate_details']),
                "shown_count": len(dup_details),
                "duplicates": [{"product": d['new_product'], "matches": d['existing_product'], "score": f"{d['similarity_score']:.2f}", "type": d['duplicate_type']} for d in dup_details]
            })
        
        # Log matcher statistics
        matcher_stats = matcher.get_cache_stats()
        logger.info("Intelligent matcher statistics", extra=matcher_stats)
        
    except Exception as e:
        log_error(logger, e, {"context": "Error processing JSON file"})
        import traceback
        traceback.print_exc()

def verify_products_collection(db: firestore.Client) -> None:
    """Verify that products were created successfully."""
    
    logger.info("Verifying products collection")
    
    try:
        # Get total count
        products_ref = db.collection('products')
        products_count = len(list(products_ref.stream()))
        
        logger.info("Found products in collection", extra={"products_count": products_count})
        
        # Get sample products
        sample_products = list(products_ref.limit(5).stream())
        
        if sample_products:
            samples = [{"name": doc.to_dict().get('name', 'Unknown'), "brand": doc.to_dict().get('brand_name', 'No brand'), "category": doc.to_dict().get('category', 'Unknown')} for doc in sample_products]
            logger.info("Sample products", extra={"samples": samples})
        
        # Check category distribution
        categories = {}
        for doc in products_ref.stream():
            data = doc.to_dict()
            category = data.get('category', 'unknown')
            categories[category] = categories.get(category, 0) + 1
        
        category_distribution = {category: count for category, count in sorted(categories.items(), key=lambda x: x[1], reverse=True)}
        logger.info("Category distribution", extra={"categories": category_distribution})
        
    except Exception as e:
        log_error(logger, e, {"context": "Error verifying products collection"})

def main():
    """Main function to create products collection."""
    
    logger.info("Starting products collection creation", extra={"script": "create_products_collection", "description": "Creates products collection from AI-classified data"})
    logger.info("Separator", extra={"line": "="*65})
    
    # Initialize Firebase
    db = initialize_firebase()
    
    # Clear existing products collection
    clear_products_collection(db)
    
    # Get JSON file path from command line argument or use default
    if len(sys.argv) > 1:
        json_file_path = sys.argv[1]
    else:
        # Default path - look for products_classified files in the parent directory
        parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_file_path = os.path.join(parent_dir, "products_classified (4).json")
    
    logger.info("Using JSON file", extra={"json_file_path": json_file_path})
    
    # Create products from JSON file
    create_products_from_json(db, json_file_path)
    
    # Verify the collection was created correctly
    verify_products_collection(db)
    
    logger.info("Products collection creation complete", extra={
        "next_steps": [
            "Products collection is now ready",
            "You can now create the 'current_prices' collection",
            "Then create 'price_history' collection",
            "Start tracking prices across supermarkets"
        ]
    })

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Create Categories Collection in Firestore
=========================================

This script creates the foundational 'categories' collection in Firestore
with all 35 product categories from the AI classifier.

This must be run FIRST before creating any other collections as all 
products will reference these categories.
"""

import os
import sys
import json
from typing import Dict, List
import re

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    logger.debug("Firebase Admin SDK imported successfully")
except ImportError as e:
    logger.error("Error importing Firebase Admin SDK", extra={"error": str(e), "install_command": "pip install firebase-admin"})
    sys.exit(1)

# Category mapping from classifier.py - exact 35 categories
PRODUCT_TYPE_OPTIONS = [
    "Rice & Grains",
    "Lentils & Pulses", 
    "Spices & Seasonings",
    "Coconut Products",
    "Canned Food",
    "Snacks",
    "Beverages",
    "Dairy",
    "Meat",
    "Seafood",
    "Dried Seafood",
    "Frozen Food",
    "Salt",
    "Sugar",
    "Vegetables",
    "Fruits",
    "Dried Fruits",
    "Bread & Bakery",
    "Noodles & Pasta",
    "Instant Foods",
    "Oil & Vinegar",
    "Condiments & Sauces",
    "Pickles & Preserves",
    "Sweets & Desserts",
    "Tea & Coffee",
    "Flour & Baking",
    "Nuts & Seeds",
    "Eggs",
    "Baby Food",
    "Cereal",
    "Health & Supplements",
    "Household Items",
    "Paper Products",
    "Cleaning Supplies",
    "Personal Care",
    "Pet Food & Supplies"
]

def normalize_category_id(category_name: str) -> str:
    """
    Convert category name to normalized document ID.
    
    Rules:
    - Convert to lowercase
    - Replace spaces and special characters with underscores
    - Remove consecutive underscores
    
    Examples:
    - "Rice & Grains" -> "rice_grains"
    - "Personal Care" -> "personal_care"
    - "Pet Food & Supplies" -> "pet_food_supplies"
    """
    # Convert to lowercase
    normalized = category_name.lower()
    
    # Replace spaces and special characters with underscores
    normalized = re.sub(r'[^a-z0-9]', '_', normalized)
    
    # Remove consecutive underscores and leading/trailing underscores
    normalized = re.sub(r'_+', '_', normalized).strip('_')
    
    return normalized

def is_food_category(category_name: str) -> bool:
    """
    Determine if a category is food or non-food based on the category name.
    
    Food categories: All food and beverage items
    Non-food categories: Household, personal care, paper products, etc.
    """
    non_food_categories = {
        "Household Items",
        "Paper Products", 
        "Cleaning Supplies",
        "Personal Care",
        "Pet Food & Supplies",
        "Health & Supplements"
    }
    
    return category_name not in non_food_categories

def get_category_description(category_name: str) -> str:
    """Generate a descriptive text for each category."""
    descriptions = {
        "Rice & Grains": "Rice varieties, wheat, barley, oats, quinoa, and other cereal grains",
        "Lentils & Pulses": "Dhal varieties, chickpeas, black-eyed peas, kidney beans, and other legumes",
        "Spices & Seasonings": "Curry powder, turmeric, cinnamon, pepper, and other spice blends",
        "Coconut Products": "Coconut milk, coconut oil, desiccated coconut, and coconut-based products",
        "Canned Food": "Canned vegetables, fruits, fish, meat, and other preserved foods",
        "Snacks": "Biscuits, crackers, chips, nuts, and other snack foods",
        "Beverages": "Soft drinks, juices, energy drinks, plant-based milk, and other beverages",
        "Dairy": "Milk, cheese, yogurt, butter, and other dairy products from animals",
        "Meat": "Chicken, beef, pork, mutton, and other meat products",
        "Seafood": "Fresh fish, prawns, crabs, shellfish, and other seafood",
        "Dried Seafood": "Dried fish, salted fish, dried prawns, and other preserved seafood",
        "Frozen Food": "Frozen vegetables, frozen meat, ice cream, and other frozen products",
        "Salt": "Table salt, sea salt, rock salt, and other salt varieties",
        "Sugar": "White sugar, brown sugar, coconut sugar, and other sweeteners",
        "Vegetables": "Fresh vegetables, leafy greens, root vegetables, and other produce",
        "Fruits": "Fresh fruits, tropical fruits, seasonal fruits, and other fresh produce",
        "Dried Fruits": "Raisins, dates, dried mango, and other dehydrated fruits",
        "Bread & Bakery": "Bread, rolls, pastries, cakes, and other baked goods",
        "Noodles & Pasta": "Instant noodles, pasta, vermicelli, and other wheat-based products",
        "Instant Foods": "Ready-to-eat meals, instant mixes, and quick-preparation foods",
        "Oil & Vinegar": "Cooking oils, coconut oil, olive oil, vinegar, and other cooking liquids",
        "Condiments & Sauces": "Soy sauce, chili sauce, tomato sauce, and other flavor enhancers",
        "Pickles & Preserves": "Pickled vegetables, jams, preserves, and other preserved foods",
        "Sweets & Desserts": "Chocolates, candies, traditional sweets, and other dessert items",
        "Tea & Coffee": "Tea leaves, coffee beans, instant coffee, and other hot beverages",
        "Flour & Baking": "All-purpose flour, baking powder, cake mixes, and baking ingredients",
        "Nuts & Seeds": "Almonds, cashews, peanuts, sesame seeds, and other nuts and seeds",
        "Eggs": "Chicken eggs, duck eggs, and other egg products",
        "Baby Food": "Infant formula, baby cereals, baby food, and child nutrition products",
        "Cereal": "Breakfast cereals, granola, muesli, and other cereal products",
        "Health & Supplements": "Vitamins, protein powders, health drinks, dietary supplements, and herbal remedies",
        "Household Items": "Cleaning products, detergents, and general household supplies",
        "Paper Products": "Tissues, toilet paper, paper towels, and other paper goods",
        "Cleaning Supplies": "Soaps, detergents, disinfectants, and cleaning products",
        "Personal Care": "Shampoo, toothpaste, soap, cosmetics, and personal hygiene items",
        "Pet Food & Supplies": "Dog food, cat food, bird food, and other pet care products"
    }
    
    return descriptions.get(category_name, f"Products related to {category_name}")

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

def create_categories_collection(db: firestore.Client) -> None:
    """
    Create the categories collection in Firestore with all 33 categories.
    
    This collection serves as the foundation for all other collections.
    """
    
    logger.info("Creating categories collection", extra={"category_count": len(PRODUCT_TYPE_OPTIONS)})
    
    # Reference to the categories collection
    categories_ref = db.collection('categories')
    
    # Create batch for efficient bulk operations
    batch = db.batch()
    
    created_categories = []
    
    for sort_order, category_name in enumerate(PRODUCT_TYPE_OPTIONS, 1):
        # Generate normalized document ID
        doc_id = normalize_category_id(category_name)
        
        # Create category document
        category_doc = {
            'id': doc_id,
            'display_name': category_name,
            'sort_order': sort_order,
            'is_food': is_food_category(category_name),
            'description': get_category_description(category_name),
            'created_at': firestore.SERVER_TIMESTAMP,
            'updated_at': firestore.SERVER_TIMESTAMP
        }
        
        # Add to batch
        doc_ref = categories_ref.document(doc_id)
        batch.set(doc_ref, category_doc)
        
        created_categories.append({
            'id': doc_id,
            'display_name': category_name,
            'sort_order': sort_order,
            'is_food': is_food_category(category_name)
        })
        
        logger.debug("Category prepared", extra={"sort_order": sort_order, "category_name": category_name, "doc_id": doc_id, "is_food": is_food_category(category_name)})
    
    try:
        # Commit batch operation
        logger.info("Committing batch operation to Firestore")
        batch.commit()
        
        # Summary
        food_count = len([cat for cat in created_categories if cat['is_food']])
        non_food_count = len(created_categories) - food_count
        
        logger.info("Categories collection created successfully", extra={
            "total_categories": len(created_categories),
            "food_categories": food_count,
            "non_food_categories": non_food_count,
            "collection_name": "categories"
        })
        
    except Exception as e:
        log_error(logger, e, {"context": "Error creating categories collection"})
        sys.exit(1)

def verify_categories_collection(db: firestore.Client) -> None:
    """Verify that all categories were created successfully."""
    
    logger.info("Verifying categories collection")
    
    try:
        # Get all documents from categories collection
        categories_ref = db.collection('categories')
        docs = categories_ref.order_by('sort_order').stream()
        
        retrieved_categories = []
        for doc in docs:
            retrieved_categories.append(doc.to_dict())
        
        logger.info("Retrieved categories from Firestore", extra={"count": len(retrieved_categories)})
        
        # Verify count matches
        if len(retrieved_categories) != len(PRODUCT_TYPE_OPTIONS):
            logger.error("Category count mismatch", extra={"expected": len(PRODUCT_TYPE_OPTIONS), "actual": len(retrieved_categories)})
            return
        
        logger.info("Category count matches expected")
        
        # Verify all categories exist
        expected_ids = [normalize_category_id(cat) for cat in PRODUCT_TYPE_OPTIONS]
        actual_ids = [cat['id'] for cat in retrieved_categories]
        
        missing_ids = set(expected_ids) - set(actual_ids)
        extra_ids = set(actual_ids) - set(expected_ids)
        
        if not missing_ids and not extra_ids:
            logger.info("All categories verified successfully - Categories collection ready for use")
        else:
            logger.error("Category verification failed", extra={"missing": list(missing_ids), "extra": list(extra_ids)})
        
    except Exception as e:
        log_error(logger, e, {"context": "Error verifying categories collection"})

def main():
    """Main function to create the categories collection."""
    
    logger.info("Creating Categories Collection for Price Comparison Database", extra={
        "description": "This script creates the foundational categories collection that all other collections will reference"
    })
    
    # Initialize Firebase
    db = initialize_firebase()
    
    # Create categories collection
    create_categories_collection(db)
    
    # Verify the collection was created correctly
    verify_categories_collection(db)
    
    logger.info("Foundation complete - Ready for products collection", extra={
        "next_steps": [
            "Categories collection is now ready",
            "You can now create the 'products' collection",
            "Then create 'current_prices' collection",
            "Finally create 'price_history' collection"
        ]
    })

if __name__ == "__main__":
    main()

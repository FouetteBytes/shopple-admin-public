#!/usr/bin/env python3
"""
Cleanup Old Categories in Firestore
===================================

This script removes deprecated categories that are no longer needed.
Currently removes: "Traditional Medicine"
"""

import os
import sys

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    logger.debug("Firebase Admin SDK imported successfully")
except ImportError as e:
    logger.error("Error importing Firebase Admin SDK", extra={"error": str(e)})
    print("Install with: pip install firebase-admin")
    sys.exit(1)

def initialize_firebase() -> firestore.Client:
    """Initialize Firebase Admin SDK and return Firestore client."""
    
    try:
        # Check if Firebase app is already initialized
        if firebase_admin._apps:
            logger.debug("Firebase Admin SDK already initialized")
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
            
            # Get Firestore client
            db = firestore.client()
            print("Firestore client connected")
            return db
        else:
            logger.error("Firebase credentials not found in environment variables")
            print("Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables")
            sys.exit(1)
        
    except Exception as e:
        print(f"Error initializing Firebase: {e}")
        sys.exit(1)

def cleanup_deprecated_categories(db: firestore.Client) -> None:
    """Remove deprecated categories from Firestore."""
    
    deprecated_categories = [
        "traditional_medicine"
    ]
    
    print(f"\nCleaning up {len(deprecated_categories)} deprecated categories...")
    
    categories_ref = db.collection('categories')
    
    for category_id in deprecated_categories:
        try:
            doc_ref = categories_ref.document(category_id)
            doc = doc_ref.get()
            
            if doc.exists:
                doc_ref.delete()
                print(f"   Deleted: {category_id}")
            else:
                print(f"   Not found: {category_id}")
                
        except Exception as e:
            print(f"   Error deleting {category_id}: {e}")
    
    print("Cleanup completed.")

def verify_cleanup(db: firestore.Client) -> None:
    """Verify the cleanup was successful."""
    
    print("\nVerifying cleanup...")
    
    try:
        # Get all documents from categories collection
        categories_ref = db.collection('categories')
        docs = categories_ref.order_by('sort_order').stream()
        
        retrieved_categories = []
        for doc in docs:
            category_data = doc.to_dict()
            category_data['id'] = doc.id
            retrieved_categories.append(category_data)
        
        print(f"Total categories after cleanup: {len(retrieved_categories)}")
        
        # Check if Traditional Medicine is gone
        traditional_medicine_exists = any(cat['id'] == 'traditional_medicine' for cat in retrieved_categories)
        
        if not traditional_medicine_exists:
            print("Traditional Medicine successfully removed")
        else:
            print("Traditional Medicine still exists")
        
        # Check if Cereal exists
        cereal_exists = any(cat['id'] == 'cereal' for cat in retrieved_categories)
        
        if cereal_exists:
            print("Cereal category exists")
        else:
            print("Cereal category missing")
        
        print("\nCurrent categories:")
        for cat in sorted(retrieved_categories, key=lambda x: x['sort_order']):
            food_type = "Food" if cat['is_food'] else "Non-food"
            print(f"   {cat['sort_order']:2d}. {cat['display_name']:<25} -> {cat['id']} ({food_type})")
        
    except Exception as e:
        print(f"Error verifying cleanup: {e}")

def main():
    """Main function to cleanup deprecated categories."""
    
    print("Cleaning Up Deprecated Categories")
    print("=" * 40)
    print("Removing: Traditional Medicine")
    print("=" * 40)
    
    # Initialize Firebase
    db = initialize_firebase()
    
    # Cleanup deprecated categories
    cleanup_deprecated_categories(db)
    
    # Verify the cleanup
    verify_cleanup(db)
    
    print("\nCleanup complete. Categories are now up to date.")

if __name__ == "__main__":
    main()

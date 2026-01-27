"""
Product Image Service - Firebase Storage Integration
=====================================================

Handles intelligent product image management:
1. Downloads images from external URLs (crawler sources)
2. Uploads to Firebase Storage with organized structure
3. Generates consistent storage paths based on product IDs
4. Manages image lifecycle (create, update, delete)
5. Provides fallback handling for failed operations

This ensures product images are stored in our Firebase Storage
instead of relying on external website URLs that may change or break.
"""

import os
import requests
import hashlib
import mimetypes
from typing import Optional, Tuple, Dict
from datetime import datetime, timedelta
from urllib.parse import urlparse, unquote
import tempfile
from pathlib import Path

from backend.services.firebase.firebase_service import FirebaseService
from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

class ProductImageService:
    """
    Intelligent service for managing product images in Firebase Storage
    """
    
    def __init__(self):
        """Initialize the image service with Firebase Storage bucket"""
        logger.info("Initializing Product Image Service")
        self.firebase_service = FirebaseService()
        self.bucket = self.firebase_service.get_bucket()
        
        # Storage configuration
        self.storage_base_path = "products/images"  # Base path in Firebase Storage
        self.temp_dir = tempfile.gettempdir()
        
        # Download configuration
        self.download_timeout = 30  # seconds
        
        logger.info("Product Image Service initialized", extra={"base_path": self.storage_base_path})
        self.max_file_size = 10 * 1024 * 1024  # 10MB
        self.allowed_content_types = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
            'image/webp', 'image/bmp', 'image/svg+xml'
        ]
        
        # Default image for fallback
        self.fallback_image_url = None  # Can be set to a default product image
        
        logger.info("ProductImageService initialized successfully")
    
    def _generate_storage_path(self, product_id: str, image_url: str) -> str:
        """
        Generate a consistent Firebase Storage path for a product image
        
        Args:
            product_id: The unique product ID
            image_url: Original image URL (used to extract extension)
        
        Returns:
            Storage path in format: products/images/{product_id}/{filename}.{ext}
        """
        # Extract file extension from URL
        parsed_url = urlparse(image_url)
        path = unquote(parsed_url.path)
        
        # Try to get extension from URL path
        _, ext = os.path.splitext(path)
        if not ext or len(ext) > 5:  # Invalid or too long extension
            ext = '.jpg'  # Default to jpg
        
        # Clean extension (remove dot and lowercase)
        ext = ext.lstrip('.').lower()
        
        # Generate unique filename using product_id and timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{product_id}_{timestamp}.{ext}"
        
        # Construct full storage path
        storage_path = f"{self.storage_base_path}/{product_id}/{filename}"
        
        return storage_path
    
    def _download_image(self, image_url: str) -> Optional[Tuple[bytes, str]]:
        """
        Download image from external URL
        """
        if not image_url or not image_url.startswith(('http://', 'https://')):
            logger.error("Invalid image URL", extra={"image_url": image_url})
            return None
        
        try:
            logger.info("Downloading image", extra={"source_url": image_url})
            
            # Set headers to mimic a browser request
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
            }
            
            # Download with streaming to handle large files
            response = requests.get(
                image_url, 
                headers=headers, 
                timeout=self.download_timeout,
                stream=True
            )
            response.raise_for_status()
            
            # Check content type
            content_type = response.headers.get('content-type', '').split(';')[0].strip().lower()
            if content_type not in self.allowed_content_types:
                logger.warning("Unsupported content type, attempting anyway", extra={"content_type": content_type})
                # Still try to process if it looks like an image
                if not content_type.startswith('image/'):
                    logger.error("Content is not an image", extra={"content_type": content_type})
                    return None
            
            # Check content length if provided
            content_length = response.headers.get('content-length')
            if content_length and int(content_length) > self.max_file_size:
                logger.error("Image too large", extra={"size_bytes": content_length, "max_size_bytes": self.max_file_size})
                return None
            
            # Download image data
            image_data = bytearray()
            downloaded_size = 0
            
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    downloaded_size += len(chunk)
                    if downloaded_size > self.max_file_size:
                        logger.error("Image size exceeded limit during download", extra={"downloaded_size": downloaded_size, "max_size": self.max_file_size})
                        return None
                    image_data.extend(chunk)
            
            logger.info("Image downloaded successfully", extra={"size_bytes": len(image_data), "content_type": content_type})
            return (bytes(image_data), content_type)
            
        except requests.exceptions.Timeout:
            logger.error("Download timeout", extra={"image_url": image_url})
        except requests.exceptions.RequestException as e:
            log_error(logger, e, context={"image_url": image_url, "operation": "download"})
        except Exception as e:
            log_error(logger, e, context={"image_url": image_url, "operation": "download_unexpected"})
        
        return None
    
    def _upload_to_storage(
        self, 
        image_data: bytes, 
        storage_path: str, 
        content_type: str
    ) -> Optional[str]:
        """
        Upload image data to Firebase Storage
        """
        if not self.bucket:
            logger.error("Firebase Storage bucket not initialized")
            return None
        
        try:
            logger.info("Uploading to Firebase Storage", extra={"storage_path": storage_path})
            
            # Create a blob (file reference) in the bucket
            blob = self.bucket.blob(storage_path)
            
            # Set metadata
            blob.metadata = {
                'uploadedAt': datetime.now().isoformat(),
                'contentType': content_type,
            }
            
            # Upload data
            blob.upload_from_string(
                image_data, 
                content_type=content_type
            )
            
            # Make public
            blob.make_public()
            
            logger.info("Upload successful", extra={"public_url": blob.public_url})
            return blob.public_url
            
        except Exception as e:
            log_error(logger, e, context={"storage_path": storage_path, "operation": "upload"})
            return None

    def process_product_image(self, product_id: str, image_url: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Process a product image: download, upload to storage, and return new URL.
        
        Args:
            product_id: Unique product identifier
            image_url: Original image URL from crawler/classifier
        
        Returns:
            Tuple of (success, firebase_url, error_message)
        """
        if not image_url:
            return False, None, "No image URL provided"
            
        # Check if already a firebase storage URL (avoid re-uploading)
        if 'firebasestorage.googleapis.com' in image_url or 'storage.googleapis.com' in image_url:
            logger.info("Image already in Firebase Storage, skipping re-upload", extra={"url": image_url})
            return True, image_url, None
        
        try:
            # Download
            result = self._download_image(image_url)
            if not result:
                return False, None, "Failed to download image from source URL"
                
            image_data, content_type = result
            
            # Generate storage path
            storage_path = self._generate_storage_path(product_id, image_url)
            
            # Upload
            new_url = self._upload_to_storage(image_data, storage_path, content_type)
            
            if new_url:
                logger.info("Image processing successful", extra={"product_id": product_id, "firebase_url": new_url})
                return True, new_url, None
            else:
                return False, None, "Failed to upload image to Firebase Storage"
                
        except Exception as e:
            error_msg = f"Error processing product image: {str(e)}"
            log_error(logger, e, context={"product_id": product_id, "source_url": image_url})
            return False, None, error_msg

    def update_product_image(self, product_id: str, old_image_url: Optional[str], new_image_url: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Update product image: upload new one and delete old one if successful.
        
        Args:
            product_id: Unique product identifier
            old_image_url: Current Firebase Storage URL (to be deleted)
            new_image_url: New source image URL to upload
        
        Returns:
            Tuple of (success, new_firebase_url, error_message)
        """
        # Upload new
        success, new_url, error = self.process_product_image(product_id, new_image_url)
        if success and new_url:
            # Delete old if exists and different
            if old_image_url and old_image_url != new_url:
                self.delete_product_image(product_id, old_image_url)
            return True, new_url, None
        return False, None, error or "Failed to process new image"

    def delete_product_image(self, product_id: str, image_url: str) -> bool:
        """
        Delete a product image from storage.
        """
        if not self.bucket or not image_url:
            return False
            
        if 'firebasestorage.googleapis.com' not in image_url:
            return False # Not our image
            
        try:
            # Extract path from URL roughly or searching?
            # Standard way to delete from URL?
            # Actually URL contains the path encoded.
            # Example: .../o/products%2Fimages%2F...
            
            parsed = urlparse(image_url)
            path = unquote(parsed.path)
            # Path usually starts with /<bucket>/o/<path>
            # We need the relative path inside bucket.
            
            # Simple heuristic: we know our base path
            if self.storage_base_path not in path:
                # Try to parse it properly
                # /v0/b/bucket-name/o/path%2Fto%2Ffile
                parts = path.split('/o/')
                if len(parts) > 1:
                    blob_path = parts[1]
                    blob = self.bucket.blob(blob_path)
                    blob.delete()
                    return True
            else:
                 # If we can't parse easily, we might skip deleting to be safe, 
                 # or try to list blobs with prefix
                 prefix = f"{self.storage_base_path}/{product_id}/"
                 blobs = list(self.bucket.list_blobs(prefix=prefix))
                 for blob in blobs:
                     blob.delete()
                 return True
                 
            return False
            
        except Exception as e:
            log_error(logger, e, context={"operation": "delete_image", "product_id": product_id})
            return False

"""
Firebase Storage Manager for Crawler Data
Handles cloud storage operations for crawler JSON files
"""

import json
import os
import sys
import re
import tempfile
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, storage
import logging

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    logger.warning("python-dotenv not available, environment variables must be set manually")

class FirebaseStorageManager:
    """
    Manages Firebase Storage operations for crawler data
    """
    
    def __init__(self, service_account_path: str = None, bucket_name: str = None):
        """
        Initialize Firebase Storage Manager
        
        Args:
            service_account_path: Path to service account JSON file
            bucket_name: Firebase Storage bucket name
        """
        self.bucket_name = bucket_name or os.getenv('FIREBASE_STORAGE_BUCKET')
        
        # If bucket name is not provided, try to derive it from project ID
        if not self.bucket_name:
            project_id = os.getenv('FIREBASE_PROJECT_ID')
            if project_id:
                self.bucket_name = f"{project_id}.firebasestorage.app"
            else:
                # Fallback for backward compatibility or local testing if needed, 
                # but ideally should be set in env
                self.bucket_name = 'shopple-7a67b.firebasestorage.app'
                
        self.logger = logging.getLogger(__name__)
        
        # Initialize Firebase Admin SDK if not already initialized
        if not firebase_admin._apps:
            if os.getenv('FIREBASE_PRIVATE_KEY'):
                # Use environment variables
                project_id = os.getenv('FIREBASE_PROJECT_ID')
                client_email = os.getenv('FIREBASE_CLIENT_EMAIL')
                private_key = os.getenv('FIREBASE_PRIVATE_KEY')

                if not (project_id and client_email and private_key):
                    raise ValueError("Missing required environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY")

                cred = credentials.Certificate({
                    "type": "service_account",
                    "project_id": project_id,
                    "private_key_id": os.getenv('FIREBASE_PRIVATE_KEY_ID'),
                    "private_key": private_key.replace('\\n', '\n'),
                    "client_email": client_email,
                    "client_id": os.getenv('FIREBASE_CLIENT_ID'),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{client_email}"
                })
            else:
                raise ValueError("Firebase credentials not found in environment variables (FIREBASE_PRIVATE_KEY).")
            
            firebase_admin.initialize_app(cred, {
                'storageBucket': self.bucket_name
            })
        
        # Get storage bucket with explicit name
        self.bucket = storage.bucket(self.bucket_name)
        self.logger.info(f"Firebase Storage Manager initialized with bucket: {self.bucket_name}")

    @staticmethod
    def _slugify(value: Optional[str], fallback: str = 'general') -> str:
        if not value:
            return fallback
        sanitized = re.sub(r'[^a-z0-9]+', '-', value.strip().lower())
        sanitized = re.sub(r'-+', '-', sanitized).strip('-')
        return sanitized or fallback

    def _upload_content_at_path(
        self,
        cloud_path: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        try:
            blob = self.bucket.blob(cloud_path)
            if metadata:
                blob.metadata = {k: str(v) for k, v in metadata.items() if v is not None}
            blob.upload_from_string(content, content_type='application/json')
            blob.reload()

            return {
                'success': True,
                'cloud_path': cloud_path,
                'public_url': blob.public_url,
                'file_size': blob.size,
                'updated': blob.updated.isoformat() if blob.updated else None,
            }
        except Exception as exc:  # noqa: BLE001
            self.logger.error(f"Failed to upload content to {cloud_path}: {exc}")
            return {'success': False, 'error': str(exc), 'cloud_path': cloud_path}
    
    def upload_crawler_data(self, 
                          local_file_path: str, 
                          store: str, 
                          category: str, 
                          metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Upload crawler data to Firebase Storage
        
        Args:
            local_file_path: Path to local JSON file
            store: Store name (e.g., 'keells', 'cargills')
            category: Category name (e.g., 'vegetables', 'dairy')
            metadata: Additional metadata to store
            
        Returns:
            Dictionary with upload results
        """
        try:
            # Preserve original filename instead of generating new timestamp
            original_filename = os.path.basename(local_file_path)
            timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
            
            # Create cloud file path using original filename
            cloud_path = f"crawler-data/{store}/{category}/{original_filename}"
            
            # Create blob and upload
            blob = self.bucket.blob(cloud_path)
            
            # Add metadata
            if metadata:
                blob.metadata = {
                    'store': store,
                    'category': category,
                    'original_filename': original_filename,
                    'timestamp': timestamp,
                    'upload_time': datetime.now().isoformat(),
                    **metadata
                }
            
            # Upload file
            blob.upload_from_filename(local_file_path)
            
            # Get file size
            file_size = os.path.getsize(local_file_path)
            
            # Update file index using original filename
            self._update_file_index(store, category, original_filename, cloud_path, file_size, metadata)
            
            result = {
                'success': True,
                'cloud_path': cloud_path,
                'public_url': blob.public_url,
                'file_size': file_size,
                'filename': original_filename,
                'timestamp': timestamp,
                'metadata': metadata
            }
            
            self.logger.info(f"Successfully uploaded {local_file_path} to {cloud_path}")
            return result
            
        except Exception as e:
            self.logger.error(f"Failed to upload {local_file_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'cloud_path': None
            }

    def save_classification_result(
        self,
        supermarket_slug: str,
        filename: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Upload classification result JSON under classifier-results/<store>/ path."""
        slug = self._slugify(supermarket_slug, fallback='classifier')
        cloud_path = f"classifier-results/{slug}/{filename}"
        merged_metadata = metadata.copy() if metadata else {}
        merged_metadata.setdefault('supermarket_slug', slug)
        merged_metadata.setdefault('filename', filename)
        return self._upload_content_at_path(cloud_path, content, merged_metadata)

    def list_classification_results(self) -> Dict[str, Any]:
        """Return metadata for classification result files stored in Firebase."""
        try:
            prefix = "classifier-results/"
            blobs = list(self.bucket.list_blobs(prefix=prefix))
            files: List[Dict[str, Any]] = []

            for blob in blobs:
                if not blob.name.endswith('.json'):
                    continue

                blob.reload()
                metadata = blob.metadata or {}
                files.append({
                    'cloud_path': blob.name,
                    'filename': os.path.basename(blob.name),
                    'supermarket': metadata.get('display_supermarket') or metadata.get('supermarket') or '',
                    'supermarket_slug': metadata.get('supermarket_slug') or '',
                    'custom_name': metadata.get('custom_name') or '',
                    'classification_date': metadata.get('classification_date') or '',
                    'upload_time': metadata.get('upload_time') or (blob.time_created.isoformat() if blob.time_created else None),
                    'size': blob.size,
                    'metadata': metadata,
                    'updated': blob.updated.isoformat() if blob.updated else None,
                })

            files.sort(key=lambda item: item.get('upload_time') or '', reverse=True)

            return {
                'success': True,
                'files': files,
                'total_files': len(files),
            }
        except Exception as exc:  # noqa: BLE001
            self.logger.error(f"Failed to list classification results: {exc}")
            return {'success': False, 'error': str(exc)}

    def delete_classification_result(self, cloud_path: str) -> Dict[str, Any]:
        """Delete a classification result file from Firebase Storage."""
        try:
            if not cloud_path:
                return {'success': False, 'error': 'cloud_path is required'}

            blob = self.bucket.blob(cloud_path)
            if not blob.exists():
                return {'success': False, 'error': 'File not found'}

            blob.delete()
            return {'success': True, 'cloud_path': cloud_path}
        except Exception as exc:  # noqa: BLE001
            self.logger.error(f"Failed to delete classification file {cloud_path}: {exc}")
            return {'success': False, 'error': str(exc)}

    def _resolve_target_path(
        self,
        existing_metadata: Dict[str, Any],
        updates: Dict[str, Any]
    ) -> Tuple[str, str]:
        """Return (target_slug, target_filename) applying update fallbacks."""
        current_slug = existing_metadata.get('supermarket_slug') or existing_metadata.get('supermarket') or 'classifier'
        current_filename = existing_metadata.get('filename') or existing_metadata.get('name') or 'classification.json'

        target_slug = self._slugify(updates.get('supermarket_slug') or updates.get('supermarket') or current_slug)
        target_filename = updates.get('filename') or current_filename
        target_filename = target_filename.strip() or current_filename

        if not target_filename.endswith('.json'):
            target_filename = f"{target_filename}.json"

        return target_slug, target_filename

    def update_classification_metadata(
        self,
        cloud_path: str,
        updates: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Update metadata (and optionally location) for a classification result."""
        try:
            if not cloud_path:
                return {'success': False, 'error': 'cloud_path is required'}

            blob = self.bucket.blob(cloud_path)
            if not blob.exists():
                return {'success': False, 'error': 'File not found'}

            blob.reload()
            content_text = blob.download_as_text()
            try:
                parsed = json.loads(content_text)
            except Exception:
                parsed = {}

            existing_metadata = {**(blob.metadata or {}), **parsed.get('metadata', {})}
            target_slug, target_filename = self._resolve_target_path(existing_metadata, updates)
            target_path = f"classifier-results/{target_slug}/{target_filename}"

            # Merge metadata updates into JSON payload metadata
            if isinstance(parsed, dict):
                parsed_metadata = parsed.setdefault('metadata', {})
                for key, value in updates.items():
                    parsed_metadata[key] = value
                parsed_metadata['filename'] = target_filename
                parsed_metadata['supermarket_slug'] = target_slug
                parsed_metadata.setdefault('updated_at', datetime.utcnow().isoformat())
                content_text = json.dumps(parsed, indent=2, ensure_ascii=False)

            # Merge metadata for blob
            blob_metadata = blob.metadata or {}
            for key, value in updates.items():
                if value is None:
                    blob_metadata.pop(key, None)
                else:
                    blob_metadata[key] = str(value)
            blob_metadata['filename'] = target_filename
            blob_metadata['supermarket_slug'] = target_slug

            # If target path differs, upload to new path then delete old blob
            if target_path != cloud_path:
                upload_result = self._upload_content_at_path(target_path, content_text, blob_metadata)
                if not upload_result.get('success'):
                    return upload_result
                blob.delete()
                return {
                    'success': True,
                    'cloud_path': upload_result.get('cloud_path', target_path),
                    'metadata': blob_metadata,
                    'moved': True,
                }

            # Otherwise just update metadata/content in place
            blob.upload_from_string(content_text, content_type='application/json')
            blob.metadata = {k: str(v) for k, v in blob_metadata.items() if v is not None}
            blob.patch()
            return {
                'success': True,
                'cloud_path': cloud_path,
                'metadata': blob_metadata,
                'moved': False,
            }

        except Exception as exc:  # noqa: BLE001
            self.logger.error(f"Failed to update classification metadata for {cloud_path}: {exc}")
            return {'success': False, 'error': str(exc)}

    def download_classification_result(self, cloud_path: str) -> Dict[str, Any]:
        """Download a single classification result file from Firebase."""
        try:
            blob = self.bucket.blob(cloud_path)
            if not blob.exists():
                return {'success': False, 'error': 'File not found'}

            blob.reload()
            content = blob.download_as_text()

            return {
                'success': True,
                'content': content,
                'metadata': blob.metadata or {},
                'filename': os.path.basename(cloud_path),
                'size': blob.size,
                'updated': blob.updated.isoformat() if blob.updated else None,
            }
        except Exception as exc:  # noqa: BLE001
            self.logger.error(f"Failed to download classification file {cloud_path}: {exc}")
            return {'success': False, 'error': str(exc)}
    
    def download_crawler_data(self, 
                            cloud_path: str, 
                            local_path: str = None) -> Dict[str, Any]:
        """
        Download crawler data from Firebase Storage
        
        Args:
            cloud_path: Path in Firebase Storage
            local_path: Local path to save file (optional)
            
        Returns:
            Dictionary with download results
        """
        try:
            blob = self.bucket.blob(cloud_path)
            
            if not blob.exists():
                return {
                    'success': False,
                    'error': 'File not found in Firebase Storage',
                    'data': None
                }
            
            if local_path:
                # Download to local file
                blob.download_to_filename(local_path)
                self.logger.info(f"Downloaded {cloud_path} to {local_path}")
                
                with open(local_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                return {
                    'success': True,
                    'local_path': local_path,
                    'data': data,
                    'metadata': blob.metadata
                }
            else:
                # Download to memory
                content = blob.download_as_text()
                data = json.loads(content)
                
                return {
                    'success': True,
                    'data': data,
                    'metadata': blob.metadata
                }
                
        except Exception as e:
            self.logger.error(f"Failed to download {cloud_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'data': None
            }
    
    def list_crawler_files(self, 
                         store: str = None, 
                         category: str = None) -> List[Dict[str, Any]]:
        """
        List crawler files in Firebase Storage
        
        Args:
            store: Filter by store name (optional)
            category: Filter by category name (optional)
            
        Returns:
            List of file information dictionaries
        """
        try:
            prefix = "crawler-data/"
            if store:
                prefix += f"{store}/"
                if category:
                    prefix += f"{category}/"
            
            blobs = self.bucket.list_blobs(prefix=prefix)
            
            files = []
            for blob in blobs:
                if blob.name.endswith('.json'):
                    files.append({
                        'name': blob.name,
                        'size': blob.size,
                        'created': blob.time_created.isoformat() if blob.time_created else None,
                        'updated': blob.updated.isoformat() if blob.updated else None,
                        'metadata': blob.metadata,
                        'public_url': blob.public_url
                    })
            
            return files
            
        except Exception as e:
            self.logger.error(f"Failed to list files: {str(e)}")
            return []
    
    def delete_crawler_file(self, cloud_path: str) -> Dict[str, Any]:
        """
        Delete a crawler file from Firebase Storage
        
        Args:
            cloud_path: Path in Firebase Storage
            
        Returns:
            Dictionary with deletion results
        """
        try:
            blob = self.bucket.blob(cloud_path)
            
            if not blob.exists():
                return {
                    'success': False,
                    'error': 'File not found'
                }
            
            blob.delete()
            
            # Update file index
            self._remove_from_file_index(cloud_path)
            
            self.logger.info(f"Successfully deleted {cloud_path}")
            return {
                'success': True,
                'message': 'File deleted successfully'
            }
            
        except Exception as e:
            self.logger.error(f"Failed to delete {cloud_path}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage usage statistics
        
        Returns:
            Dictionary with storage statistics
        """
        try:
            blobs = self.bucket.list_blobs(prefix="crawler-data/")
            
            total_size = 0
            file_count = 0
            stores = {}
            
            for blob in blobs:
                if blob.name.endswith('.json'):
                    file_count += 1
                    total_size += blob.size or 0
                    
                    # Parse path to get store and category
                    path_parts = blob.name.split('/')
                    if len(path_parts) >= 3:
                        store = path_parts[1]
                        category = path_parts[2]
                        
                        if store not in stores:
                            stores[store] = {'categories': {}, 'total_files': 0, 'total_size': 0}
                        
                        if category not in stores[store]['categories']:
                            stores[store]['categories'][category] = {'files': 0, 'size': 0}
                        
                        stores[store]['categories'][category]['files'] += 1
                        stores[store]['categories'][category]['size'] += blob.size or 0
                        stores[store]['total_files'] += 1
                        stores[store]['total_size'] += blob.size or 0
            
            return {
                'total_files': file_count,
                'total_size': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2),
                'stores': stores,
                'last_updated': datetime.now().isoformat()
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get storage stats: {str(e)}")
            return {
                'total_files': 0,
                'total_size': 0,
                'error': str(e)
            }
    
    def _update_file_index(self, store: str, category: str, timestamp: str, 
                          cloud_path: str, file_size: int, metadata: Dict[str, Any]):
        """
        Update the file index with new file information
        """
        try:
            index_path = "system/file_index.json"
            
            # Try to get existing index
            try:
                blob = self.bucket.blob(index_path)
                if blob.exists():
                    content = blob.download_as_text()
                    index = json.loads(content)
                else:
                    index = {}
            except:
                index = {}
            
            # Update index
            if store not in index:
                index[store] = {}
            if category not in index[store]:
                index[store][category] = []
            
            index[store][category].append({
                'timestamp': timestamp,
                'cloud_path': cloud_path,
                'file_size': file_size,
                'upload_time': datetime.now().isoformat(),
                'metadata': metadata
            })
            
            # Keep only last 50 entries per category
            index[store][category] = index[store][category][-50:]
            
            # Upload updated index
            blob = self.bucket.blob(index_path)
            blob.upload_from_string(json.dumps(index, indent=2))
            
        except Exception as e:
            self.logger.error(f"Failed to update file index: {str(e)}")
    
    def _remove_from_file_index(self, cloud_path: str):
        """
        Remove file from index when deleted
        """
        try:
            index_path = "system/file_index.json"
            blob = self.bucket.blob(index_path)
            
            if blob.exists():
                content = blob.download_as_text()
                index = json.loads(content)
                
                # Remove from index
                for store in index:
                    for category in index[store]:
                        index[store][category] = [
                            item for item in index[store][category] 
                            if item['cloud_path'] != cloud_path
                        ]
                
                # Upload updated index
                blob.upload_from_string(json.dumps(index, indent=2))
                
        except Exception as e:
            self.logger.error(f"Failed to remove from file index: {str(e)}")
    
    def upload_content(self, 
                       content: str, 
                       store: str, 
                       category: str, 
                       filename: str,
                       metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Upload content directly to Firebase Storage
        
        Args:
            content: Content to upload
            store: Store name (e.g., 'keells', 'cargills')
            category: Category name (e.g., 'vegetables', 'dairy')
            filename: Filename to use
            metadata: Additional metadata to store
            
        Returns:
            Dictionary with upload results
        """
        try:
            # Create cloud file path
            cloud_path = f"crawler-data/{store}/{category}/{filename}"
            
            # Create blob and upload
            blob = self.bucket.blob(cloud_path)
            
            # Add metadata
            if metadata:
                blob.metadata = {
                    'store': store,
                    'category': category,
                    'upload_time': datetime.now().isoformat(),
                    **metadata
                }
            
            # Upload content directly
            blob.upload_from_string(content, content_type='application/json')
            
            # Get content size
            content_size = len(content.encode('utf-8'))
            
            result = {
                'success': True,
                'cloud_path': cloud_path,
                'public_url': blob.public_url,
                'file_size': content_size,
                'filename': filename,
                'metadata': metadata
            }
            
            self.logger.info(f"Successfully uploaded content to {cloud_path}")
            return result
            
        except Exception as e:
            self.logger.error(f"Failed to upload content: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'cloud_path': None
            }
    
    def download_file_content(self, cloud_path: str) -> Dict[str, Any]:
        """
        Download file content from Firebase Storage
        
        Args:
            cloud_path: Path to file in Firebase Storage
            
        Returns:
            Dict with success status and content or error
        """
        try:
            bucket = storage.bucket(self.bucket_name)
            blob = bucket.blob(cloud_path)
            
            if not blob.exists():
                return {"success": False, "error": "File not found"}
            
            # Download content as text
            content = blob.download_as_text()
            
            return {
                "success": True,
                "content": content,
                "size": blob.size,
                "updated": blob.updated.isoformat() if blob.updated else None
            }
            
        except Exception as e:
            self.logger.error(f"Error downloading file content: {e}")
            return {"success": False, "error": str(e)}
    
    def get_file_info(self, cloud_path: str) -> Optional[Dict[str, Any]]:
        """
        Get file information from Firebase Storage
        
        Args:
            cloud_path: Path to file in Firebase Storage
            
        Returns:
            File information dict or None if not found
        """
        try:
            bucket = storage.bucket(self.bucket_name)
            blob = bucket.blob(cloud_path)
            
            if not blob.exists():
                return None
            
            # Reload to get latest metadata
            blob.reload()
            
            return {
                "name": cloud_path,
                "size": blob.size,
                "timeCreated": blob.time_created.isoformat() if blob.time_created else None,
                "updated": blob.updated.isoformat() if blob.updated else None,
                "mediaLink": blob.media_link,
                "metadata": blob.metadata or {}
            }
            
        except Exception as e:
            self.logger.error(f"Error getting file info: {e}")
            return None
    
    def delete_file(self, cloud_path: str) -> Dict[str, Any]:
        """
        Delete a file from Firebase Storage
        
        Args:
            cloud_path: Path to the file in cloud storage
            
        Returns:
            Dict with success status and message
        """
        try:
            blob = self.bucket.blob(cloud_path)
            
            if blob.exists():
                blob.delete()
                self.logger.info(f"Successfully deleted file: {cloud_path}")
                
                # Remove from file index
                self._remove_from_file_index(cloud_path)
                
                return {"success": True, "message": f"File {cloud_path} deleted"}
            else:
                return {"success": False, "error": "File not found"}
            
        except Exception as e:
            self.logger.error(f"Error deleting file: {e}")
            return {"success": False, "error": str(e)}

    def get_file_content_as_json(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """
        Get file content as JSON for viewing in the frontend
        
        Args:
            store: Store name (e.g., 'keells', 'cargills')
            category: Category name (e.g., 'beverages', 'groceries')
            filename: Name of the file
            
        Returns:
            Dict with success status and formatted data for frontend
        """
        try:
            # Construct cloud path
            cloud_path = f"crawler-data/{store}/{category}/{filename}"
            
            # First try to download from cloud
            result = self.download_file_content(cloud_path)
            
            if result.get('success'):
                content = result['content']
                try:
                    # Parse JSON content
                    json_data = json.loads(content)
                    
                    # Handle different JSON structures
                    if isinstance(json_data, list):
                        # If it's a list of items
                        items = json_data
                    elif isinstance(json_data, dict) and 'items' in json_data:
                        # If it's an object with items property
                        items = json_data['items']
                    elif isinstance(json_data, dict):
                        # If it's a single object, wrap in list
                        items = [json_data]
                    else:
                        items = []
                    
                    return {
                        "success": True,
                        "data": items,
                        "total_items": len(items),
                        "source": "cloud",
                        "filename": filename,
                        "store": store,
                        "category": category
                    }
                    
                except json.JSONDecodeError as e:
                    return {
                        "success": False, 
                        "error": f"Invalid JSON format: {e}"
                    }
            else:
                # Try local file as fallback
                local_path = os.path.join(
                    os.path.dirname(__file__), 
                    "output", 
                    store, 
                    category, 
                    filename
                )
                
                if os.path.exists(local_path):
                    try:
                        with open(local_path, 'r', encoding='utf-8') as f:
                            json_data = json.load(f)
                        
                        # Handle different JSON structures
                        if isinstance(json_data, list):
                            items = json_data
                        elif isinstance(json_data, dict) and 'items' in json_data:
                            items = json_data['items']
                        elif isinstance(json_data, dict):
                            items = [json_data]
                        else:
                            items = []
                        
                        return {
                            "success": True,
                            "data": items,
                            "total_items": len(items),
                            "source": "local",
                            "filename": filename,
                            "store": store,
                            "category": category
                        }
                        
                    except (json.JSONDecodeError, IOError) as e:
                        return {
                            "success": False,
                            "error": f"Could not read local file: {e}"
                        }
                else:
                    return {
                        "success": False,
                        "error": f"File not found in cloud or local storage: {cloud_path}"
                    }
                    
        except Exception as e:
            self.logger.error(f"Error getting file content as JSON: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# Singleton instance
_storage_manager = None

def get_storage_manager() -> FirebaseStorageManager:
    """
    Get singleton instance of FirebaseStorageManager
    """
    global _storage_manager
    if _storage_manager is None:
        # Load environment variables from .env file
        from dotenv import load_dotenv
        load_dotenv()
        _storage_manager = FirebaseStorageManager()
    return _storage_manager

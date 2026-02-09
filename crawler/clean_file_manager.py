#!/usr/bin/env python3
"""
Clean File Storage Manager for Firebase Storage
Handles automatic upload, local/cloud file management, and storage operations
"""
import os
import sys
import json
import shutil
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
import traceback

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error
from cache.sqlite_store import CrawlerCacheStore

logger = get_logger(__name__)

# Add the current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from firebase_storage_manager import FirebaseStorageManager
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.warning("Firebase not available")

class CleanFileStorageManager:
    """
    Clean file storage manager with automatic upload and flexible storage options
    """
    
    def __init__(self):
        self.storage_manager = None
        self.config = self.load_config()
        
        # Define local storage paths FIRST
        self.base_path = os.path.dirname(os.path.abspath(__file__))
        self.output_path = os.path.join(self.base_path, 'output')
        self.cache_path = os.path.join(self.base_path, 'cache')
        self.cache_store = CrawlerCacheStore(self.cache_path)
        
        # Initialize Firebase if available
        if FIREBASE_AVAILABLE:
            try:
                # Check if Firebase credentials are configured in environment
                firebase_project_id = os.getenv('FIREBASE_PROJECT_ID')
                firebase_client_email = os.getenv('FIREBASE_CLIENT_EMAIL')
                firebase_private_key = os.getenv('FIREBASE_PRIVATE_KEY')
                
                if firebase_project_id and firebase_client_email and firebase_private_key:
                    self.storage_manager = FirebaseStorageManager()
                    logger.info("Firebase Storage Manager initialized")
                else:
                    logger.warning("Firebase credentials not configured in .env file (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)")
                    logger.info("Storage Manager will work in local-only mode")
            except Exception as e:
                logger.warning(f"Firebase Storage Manager initialization failed: {e}")
                logger.info("Storage Manager will work in local-only mode")
                # Don't print full traceback to avoid cluttering logs
                # traceback.print_exc()
        
        # Ensure directories exist
        os.makedirs(self.output_path, exist_ok=True)
        os.makedirs(self.cache_path, exist_ok=True)
        self._cache_lock = threading.Lock()
        self._files_cache: Dict[str, Any] = {"payload": None, "timestamp": 0.0}
        ttl_env = os.getenv('FILE_MANAGER_CACHE_TTL_SEC') or str(self.config.get('files_cache_ttl_seconds', '2'))
        try:
            self._files_cache_ttl = max(0.5, float(ttl_env))
        except (TypeError, ValueError):
            self._files_cache_ttl = 2.0

    def _get_cleanup_delay_seconds(self) -> float:
        """Return the configured grace period before deleting local files."""
        try:
            delay = float(self.config.get('post_upload_cleanup_delay_seconds', 0))
        except (TypeError, ValueError):
            delay = 0
        return max(0.0, delay)

    def _schedule_local_cleanup(self, store: str, category: str, filename: str, local_path: str):
        """Remove local file immediately or after a short delay based on config."""
        delay = self._get_cleanup_delay_seconds()

        if delay <= 0:
            self._perform_local_cleanup(store, category, filename, local_path)
            return

        def _delayed_cleanup():
            self._perform_local_cleanup(store, category, filename, local_path)

        timer = threading.Timer(delay, _delayed_cleanup)
        timer.daemon = True
        timer.start()

    def _perform_local_cleanup(self, store: str, category: str, filename: str, local_path: str):
        """Delete local file (if present) and update upload status."""
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
                logger.info(f"[SUCCESS] Removed local file: {filename}")
        except Exception as exc:
            logger.warning(
                "Warning: Failed to remove local file",
                extra={"filename": filename, "error": str(exc)}
            )
        finally:
            self._set_upload_status(store, category, filename, 'cloud_only')
    
    def load_config(self) -> Dict[str, Any]:
        """Load storage configuration"""
        config_path = os.path.join(os.path.dirname(__file__), 'storage_config.json')
        default_config = {
            'storage_mode': 'firebase',  # 'local', 'firebase', 'both' - Default to cloud-only
            'auto_upload': True,
            'keep_local_days': 7,
            'max_local_files': 50,
            'auto_cleanup': True,
            'post_upload_cleanup_delay_seconds': 30
        }
        
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    return {**default_config, **json.load(f)}
        except Exception as e:
            logger.error(f"Error loading config: {e}")
        
        return default_config
    
    def save_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Save storage configuration"""
        try:
            config_path = os.path.join(os.path.dirname(__file__), 'storage_config.json')
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)
            self.config = config
            return {"success": True}
        except Exception as e:
            return {"error": f"Failed to save config: {str(e)}", "success": False}
    
    def auto_upload_new_files(self, store: str, category: str = None) -> Dict[str, Any]:
        """Automatically upload new files to Firebase after crawler generates them"""
        if not self.storage_manager or not self.config.get('auto_upload', True):
            return {"success": False, "message": "Auto upload disabled or Firebase not available"}
        
        try:
            uploaded_files = []
            store_path = os.path.join(self.output_path, store)
            
            if not os.path.exists(store_path):
                return {"success": True, "uploaded_files": [], "message": "No files to upload"}
            
            # If category specified, check specific category folder
            if category:
                category_path = os.path.join(store_path, category)
                if os.path.exists(category_path):
                    files_to_upload = self._get_files_to_upload(category_path, store, category)
                else:
                    files_to_upload = []
            else:
                # Check all categories in the store
                files_to_upload = []
                for item in os.listdir(store_path):
                    item_path = os.path.join(store_path, item)
                    if os.path.isdir(item_path):
                        files_to_upload.extend(self._get_files_to_upload(item_path, store, item))
                    elif item.endswith('.json'):
                        # Direct files in store folder
                        files_to_upload.append({
                            'local_path': item_path,
                            'store': store,
                            'category': 'general',
                            'filename': item
                        })
            
            # Upload each file
            for file_info in files_to_upload:
                try:
                    filename = file_info['filename']
                    file_store = file_info['store']
                    file_category = file_info['category']
                    
                    # Set uploading status
                    self._set_upload_status(file_store, file_category, filename, 'uploading')
                    
                    # Read file content
                    with open(file_info['local_path'], 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Upload to Firebase using content
                    upload_result = self.storage_manager.upload_content(
                        content, 
                        file_store, 
                        file_category, 
                        filename
                    )
                    
                    if upload_result.get('success'):
                        uploaded_files.append({
                            'filename': filename,
                            'store': file_store,
                            'category': file_category,
                            'cloud_path': upload_result.get('cloud_path'),
                            'local_path': file_info['local_path']
                        })
                        
                        logger.info(f"[SUCCESS] Uploaded: {filename} to {upload_result.get('cloud_path')}")
                        
                        # Update status based on storage mode
                        self._set_upload_status(file_store, file_category, filename, 'completed')
                        if self.config.get('storage_mode') == 'firebase':
                            # Remove local file after the configured grace period
                            self._schedule_local_cleanup(file_store, file_category, filename, file_info['local_path'])
                        else:
                            # Keep both local and cloud copies
                            self._set_upload_status(file_store, file_category, filename, 'both')
                    else:
                        logger.error(f"[ERROR] Upload failed: {filename} - {upload_result.get('error')}")
                        self._set_upload_status(file_store, file_category, filename, 'failed')
                    
                except Exception as e:
                    import traceback
                    error_details = traceback.format_exc()
                    logger.error(f"[ERROR] Error uploading {file_info['filename']}: {e}\n{error_details}")
                    self._set_upload_status(file_info['store'], file_info['category'], file_info['filename'], 'failed')
                    continue
            
            self._invalidate_files_cache()

            return {
                "success": True,
                "uploaded_files": uploaded_files,
                "count": len(uploaded_files),
                "message": f"Successfully uploaded {len(uploaded_files)} files to Firebase"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Auto upload failed: {str(e)}"
            }
    
    def _get_files_to_upload(self, directory_path: str, store: str, category: str) -> List[Dict[str, str]]:
        """Get list of files that need to be uploaded"""
        files_to_upload = []
        
        try:
            for filename in os.listdir(directory_path):
                if filename.endswith('.json'):
                    file_path = os.path.join(directory_path, filename)
                    
                    # Check if file was recently created (within last hour)
                    file_stat = os.stat(file_path)
                    file_age = datetime.now().timestamp() - file_stat.st_mtime
                    
                    # Upload if file is new (less than 1 hour old) or if it's not in cloud
                    if file_age < 3600 or not self._is_file_in_cloud(store, category, filename):
                        files_to_upload.append({
                            'local_path': file_path,
                            'store': store,
                            'category': category,
                            'filename': filename
                        })
                        
        except Exception as e:
            logger.error(f"Error scanning directory {directory_path}: {e}")
        
        return files_to_upload
    
    def _is_file_in_cloud(self, store: str, category: str, filename: str) -> bool:
        """Check if file already exists in cloud storage"""
        if not self.storage_manager:
            return False
        
        try:
            files = self.storage_manager.list_crawler_files(store)
            for file_info in files:
                if file_info.get('name', '').endswith(filename):
                    return True
            return False
        except:
            return False
    
    def list_all_files(self) -> Dict[str, Any]:
        """List all files from both local and cloud storage with real-time status"""
        cached_payload = self._get_cached_files_payload()
        if cached_payload:
            return cached_payload

        try:
            all_files = []
            stores = ['keells', 'cargills']
            
            # Get cloud files
            cloud_files = {}
            if self.storage_manager:
                try:
                    for store in stores:
                        files = self.storage_manager.list_crawler_files(store)
                        if files:
                            for file_info in files:
                                cloud_path = file_info.get('name', '')
                                cloud_files[cloud_path] = file_info
                except Exception as e:
                    logger.warning(f"Warning: Could not load cloud files: {e}")
            
            # Get local files
            local_files = {}
            if os.path.exists(self.output_path):
                for store in stores:
                    store_path = os.path.join(self.output_path, store)
                    if os.path.exists(store_path):
                        for category in os.listdir(store_path):
                            category_path = os.path.join(store_path, category)
                            if os.path.isdir(category_path):
                                for filename in os.listdir(category_path):
                                    if filename.endswith('.json'):
                                        file_path = os.path.join(category_path, filename)
                                        local_path_key = f"crawler-data/{store}/{category}/{filename}"
                                        local_files[local_path_key] = {
                                            'name': filename,
                                            'store': store,
                                            'category': category,
                                            'size': os.path.getsize(file_path),
                                            'local_path': file_path,
                                            'created': datetime.fromtimestamp(os.path.getctime(file_path)).isoformat(),
                                            'updated': datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                                        }
            
            # Merge local and cloud files
            all_file_paths = set(cloud_files.keys()) | set(local_files.keys())
            
            for file_path in all_file_paths:
                cloud_info = cloud_files.get(file_path)
                local_info = local_files.get(file_path)
                
                # Extract path components
                path_parts = file_path.split('/')
                if len(path_parts) >= 4:
                    store = path_parts[1]
                    category = path_parts[2]
                    filename = path_parts[3]
                else:
                    continue
                
                # Get upload status
                upload_status = self._get_upload_status(store, category, filename)
                
                # Determine file status
                has_local = local_info is not None
                has_cloud = cloud_info is not None
                
                status_class = upload_status
                location = 'Unknown'

                if upload_status == 'uploading':
                    location = 'Uploading to cloud'
                elif upload_status == 'downloading':
                    location = 'Syncing to local'
                elif upload_status == 'failed':
                    location = 'Sync failed'
                elif has_local and has_cloud:
                    location = 'Cloud + Local'
                    status_class = 'both'
                elif has_local and not has_cloud:
                    location = 'Local Only'
                    status_class = 'local_only'
                elif not has_local and has_cloud:
                    location = 'Cloud Only'
                    status_class = 'cloud_only'
                else:
                    continue  # Skip if file doesn't exist anywhere
                
                # Create unified file info
                file_info = {
                    'name': filename,
                    'store': store,
                    'category': category,
                    'size': cloud_info.get('size', 0) if cloud_info else local_info.get('size', 0),
                    'created': cloud_info.get('timeCreated', '') if cloud_info else local_info.get('created', ''),
                    'updated': cloud_info.get('updated', '') if cloud_info else local_info.get('updated', ''),
                    'public_url': cloud_info.get('mediaLink', '') if cloud_info else '',
                    'location': location,
                    'status': status_class,
                    'status_class': status_class,
                    'upload_status': upload_status,
                    'has_local': has_local,
                    'has_cloud': has_cloud,
                    'metadata': {
                        'store': store,
                        'category': category,
                        'full_path': file_path
                    }
                }
                
                all_files.append(file_info)
            
            # Sort files by creation date (newest first)
            all_files.sort(key=lambda x: x.get('created', ''), reverse=True)
            payload = {
                "success": True,
                "files": all_files,
                "total_files": len(all_files),
                "summary": self._build_summary(all_files)
            }
            self._store_files_payload(payload)
            return payload
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to list files: {str(e)}"
            }
    
    def _extract_category_from_path(self, cloud_path: str) -> str:
        """Extract category from cloud storage path"""
        # Expected format: crawler-data/store/category/filename.json
        try:
            parts = cloud_path.split('/')
            if len(parts) >= 3:
                return parts[2]  # category part
            return 'general'
        except:
            return 'general'
    
    def _get_local_path_from_cloud_path(self, cloud_path: str) -> Optional[str]:
        """Convert cloud path to local path"""
        try:
            # Extract store, category, and filename from cloud path
            parts = cloud_path.split('/')
            if len(parts) >= 3:
                store = parts[1]
                category = parts[2]
                filename = parts[-1]
                
                return os.path.join(self.output_path, store, category, filename)
        except:
            pass
        return None
    
    def download_file_to_local(self, cloud_path: str, local_path: str = None) -> Dict[str, Any]:
        """Download a file from Firebase to local storage"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            # Get file content from Firebase
            content = self.storage_manager.download_file_content(cloud_path)
            if not content:
                return {"error": "Failed to download file content", "success": False}
            
            # Determine local path if not provided
            if not local_path:
                local_path = self._get_local_path_from_cloud_path(cloud_path)
                if not local_path:
                    return {"error": "Could not determine local path", "success": False}
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Write content to local file
            with open(local_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return {
                "success": True,
                "local_path": local_path,
                "message": "File downloaded to local storage"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Download failed: {str(e)}"
            }
    
    def keep_cloud_only(self, cloud_path: str) -> Dict[str, Any]:
        """Keep file only in cloud storage, remove local copy"""
        try:
            local_path = self._get_local_path_from_cloud_path(cloud_path)
            if local_path and os.path.exists(local_path):
                os.remove(local_path)
                return {
                    "success": True,
                    "message": "Local copy removed, file kept in cloud only"
                }
            else:
                return {
                    "success": True,
                    "message": "File already cloud-only"
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to remove local copy: {str(e)}"
            }
    
    def delete_from_cloud(self, cloud_path: str) -> Dict[str, Any]:
        """Delete file from Firebase Storage"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            result = self.storage_manager.delete_file(cloud_path)
            if result:
                # Also remove local copy if exists
                local_path = self._get_local_path_from_cloud_path(cloud_path)
                if local_path and os.path.exists(local_path):
                    os.remove(local_path)
                
                return {
                    "success": True,
                    "message": "File deleted from cloud and local storage"
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to delete file from cloud"
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Delete failed: {str(e)}"
            }
    
    def get_file_content_for_download(self, cloud_path: str) -> Dict[str, Any]:
        """Get file content for browser download"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            content = self.storage_manager.download_file_content(cloud_path)
            if content:
                return {
                    "success": True,
                    "content": content,
                    "filename": cloud_path.split('/')[-1]
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to get file content"
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to get file content: {str(e)}"
            }
    
    def cleanup_old_files(self) -> Dict[str, Any]:
        """Clean up old local files based on configuration"""
        try:
            removed_files = 0
            keep_days = self.config.get('keep_local_days', 7)
            cutoff_date = datetime.now() - timedelta(days=keep_days)
            
            # Scan output directory
            for store in os.listdir(self.output_path):
                store_path = os.path.join(self.output_path, store)
                if not os.path.isdir(store_path):
                    continue
                
                for category in os.listdir(store_path):
                    category_path = os.path.join(store_path, category)
                    if not os.path.isdir(category_path):
                        continue
                    
                    for filename in os.listdir(category_path):
                        file_path = os.path.join(category_path, filename)
                        if os.path.isfile(file_path):
                            file_time = datetime.fromtimestamp(os.path.getmtime(file_path))
                            if file_time < cutoff_date:
                                os.remove(file_path)
                                removed_files += 1
            
            return {
                "success": True,
                "files_removed": removed_files,
                "message": f"Cleaned up {removed_files} old files"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Cleanup failed: {str(e)}"
            }
    
    def watch_and_auto_upload(self, store: str = None, category: str = None, interval: int = 5) -> None:
        """
        Watch for new files and automatically upload them
        This would typically be run as a background service
        """
        import time
        
        logger.info(f"🔍 Starting file watcher for auto-upload (checking every {interval}s)")
        logger.info("File watcher filters", extra={
            "store": store or "all stores",
            "category": category or "all categories",
            "output_path": self.output_path
        })
        
        last_check_time = time.time()
        
        while True:
            try:
                # Check for new files since last check
                current_time = time.time()
                stores_to_check = [store] if store else ['keells', 'cargills']
                
                for check_store in stores_to_check:
                    store_path = os.path.join(self.output_path, check_store)
                    if not os.path.exists(store_path):
                        continue
                    
                    # Check all categories in store
                    for item in os.listdir(store_path):
                        item_path = os.path.join(store_path, item)
                        if os.path.isdir(item_path) and (not category or item == category):
                            # Check for new files in this category
                            for filename in os.listdir(item_path):
                                if filename.endswith('.json'):
                                    file_path = os.path.join(item_path, filename)
                                    file_mtime = os.path.getmtime(file_path)
                                    
                                    # If file was created/modified since last check
                                    if file_mtime > last_check_time:
                                        logger.info(f"[NEW FILE] New file detected: {filename} in {check_store}/{item}")
                                        
                                        # Upload the file
                                        result = self.auto_upload_new_files(check_store, item)
                                        if result.get('success') and result.get('count', 0) > 0:
                                            logger.info(f"✅ Auto-uploaded {result['count']} files")
                                        else:
                                            logger.error(f"[ERROR] Auto-upload failed: {result.get('error', 'Unknown error')}")
                
                last_check_time = current_time
                time.sleep(interval)
                
            except KeyboardInterrupt:
                logger.info("File watcher stopped by user")
                break
            except Exception as e:
                logger.error(f"[ERROR] File watcher error: {e}")
                time.sleep(interval)

    def trigger_auto_upload_for_new_file(self, file_path: str) -> Dict[str, Any]:
        """
        Trigger auto-upload for a specific newly created file
        This should be called by the crawler after creating a file
        """
        try:
            # Extract store and category from file path
            rel_path = os.path.relpath(file_path, self.output_path)
            path_parts = rel_path.split(os.sep)
            
            if len(path_parts) >= 3:
                store = path_parts[0]
                category = path_parts[1]
                filename = path_parts[2]
                
                logger.info(f"🚀 Triggering auto-upload for: {store}/{category}/{filename}")
                
                # Check if file is not already uploading/uploaded
                upload_status = self._get_upload_status(store, category, filename)
                if upload_status in ['uploading', 'completed']:
                    return {
                        "success": True,
                        "filename": filename,
                        "status": upload_status,
                        "message": f"File already {upload_status}"
                    }
                
                # Mark as uploading
                self._set_upload_status(store, category, filename, 'uploading')
                
                # Read and upload the file
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                upload_result = self.storage_manager.upload_content(
                    content, store, category, filename
                )
                
                if upload_result.get('success'):
                    logger.info(f"✅ Successfully uploaded: {filename}")
                    logger.debug("File uploaded to cloud", extra={"cloud_path": upload_result.get('cloud_path')})
                    
                    # Mark as completed
                    self._set_upload_status(store, category, filename, 'completed')
                    
                    # Remove local file if configured to do so
                    storage_mode = self.config.get('storage_mode')
                    if storage_mode == 'firebase':
                        self._schedule_local_cleanup(store, category, filename, file_path)
                    else:
                        self._set_upload_status(store, category, filename, 'both')

                    cleanup_delay = self._get_cleanup_delay_seconds()
                    return {
                        "success": True,
                        "filename": filename,
                        "cloud_path": upload_result.get('cloud_path'),
                        "status": "cloud_only" if storage_mode == 'firebase' else "both",
                        "local_removed": storage_mode == 'firebase' and cleanup_delay == 0,
                        "cleanup_scheduled": storage_mode == 'firebase' and cleanup_delay > 0
                    }
                else:
                    logger.error(f"[ERROR] Upload failed: {upload_result.get('error')}")
                    # Mark as failed
                    self._set_upload_status(store, category, filename, 'failed')
                    return {
                        "success": False,
                        "error": upload_result.get('error'),
                        "status": "failed"
                    }
            else:
                return {
                    "success": False,
                    "error": f"Invalid file path structure: {rel_path}"
                }
                
        except Exception as e:
            logger.error(f"[ERROR] Auto-upload trigger error: {e}")
            if 'filename' in locals():
                self._set_upload_status(store, category, filename, 'failed')
            return {
                "success": False,
                "error": str(e),
                "status": "failed"
            }
    
    def _get_upload_status(self, store: str, category: str, filename: str) -> str:
        """Get upload status for a file"""
        try:
            return self.cache_store.get_upload_status(store, category, filename)
        except Exception:
            return 'local'
    
    def _set_upload_status(self, store: str, category: str, filename: str, status: str):
        """Set upload status for a file"""
        try:
            self.cache_store.set_upload_status(store, category, filename, status)
        except Exception as e:
            logger.warning(f"Warning: Could not update upload status: {e}")
    
    def _clear_upload_status(self, store: str, category: str, filename: str):
        """Clear upload status for a file (remove from persistent cache)"""
        try:
            self.cache_store.clear_upload_status(store, category, filename)
        except Exception as e:
            logger.warning(f"Warning: Could not clear upload status: {e}")
    
    def get_file_upload_status(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Get detailed upload status for a file"""
        local_path = os.path.join(self.output_path, store, category, filename)
        has_local = os.path.exists(local_path)
        
        # Check cloud status
        has_cloud = False
        if self.storage_manager:
            try:
                cloud_files = self.storage_manager.list_files()
                cloud_path = f"{store}/{category}/{filename}"
                has_cloud = any(f.get('path') == cloud_path for f in cloud_files)
            except:
                has_cloud = False
        
        upload_status = self._get_upload_status(store, category, filename)
        
        # Determine final status
        if upload_status == 'uploading':
            status = 'uploading'
        elif has_local and has_cloud:
            status = 'both'
        elif has_local and not has_cloud:
            status = 'local'
        elif not has_local and has_cloud:
            status = 'cloud_only'
        else:
            status = 'missing'
        
        return {
            "status": status,
            "has_local": has_local,
            "has_cloud": has_cloud,
            "upload_status": upload_status,
            "local_path": local_path if has_local else None
        }
    
    def process_new_file(self, file_path: str) -> bool:
        """
        Process a newly created file (alias for trigger_auto_upload_for_new_file)
        Returns True if successful, False otherwise
        """
        result = self.trigger_auto_upload_for_new_file(file_path)
        return result.get('success', False)
    
    def list_local_files(self) -> List[Dict[str, Any]]:
        """List all local files"""
        local_files = []
        
        if not os.path.exists(self.output_path):
            return local_files
        
        for store_name in os.listdir(self.output_path):
            store_path = os.path.join(self.output_path, store_name)
            if os.path.isdir(store_path):
                for category_name in os.listdir(store_path):
                    category_path = os.path.join(store_path, category_name)
                    if os.path.isdir(category_path):
                        for filename in os.listdir(category_path):
                            if filename.endswith('.json'):
                                file_path = os.path.join(category_path, filename)
                                file_size = os.path.getsize(file_path)
                                local_files.append({
                                    'name': filename,
                                    'store': store_name,
                                    'category': category_name,
                                    'size': file_size,
                                    'path': file_path,
                                    'location': 'local'
                                })
        
        return local_files
    
    def list_cloud_files(self) -> List[Dict[str, Any]]:
        """List all cloud files"""
        if not self.storage_manager:
            return []
        
        try:
            cloud_files = self.storage_manager.list_files()
            # Add location info
            for file_info in cloud_files:
                file_info['location'] = 'cloud'
            return cloud_files
        except Exception as e:
            logger.error(f"Error listing cloud files: {e}")
            return []
    
    def switch_to_cloud_only(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Switch a file to cloud-only storage (remove local copy)"""
        try:
            local_path = os.path.join(self.output_path, store, category, filename)
            
            # Check if file exists locally
            if not os.path.exists(local_path):
                return {
                    "success": False,
                    "error": "File not found locally"
                }
            
            # Check if file exists in cloud
            cloud_files = self.storage_manager.list_files() if self.storage_manager else []
            cloud_path = f"{store}/{category}/{filename}"
            has_cloud = any(f.get('path') == cloud_path for f in cloud_files)
            
            if not has_cloud:
                # Upload to cloud first
                with open(local_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                upload_result = self.storage_manager.upload_content(
                    content, store, category, filename
                )
                
                if not upload_result.get('success'):
                    return {
                        "success": False,
                        "error": f"Failed to upload to cloud: {upload_result.get('error')}"
                    }
            
            # Remove local file
            os.remove(local_path)
            self._set_upload_status(store, category, filename, 'cloud_only')
            
            return {
                "success": True,
                "message": "File switched to cloud-only storage",
                "status": "cloud_only"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def switch_to_local_and_cloud(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Switch a file to local+cloud storage (download cloud copy to local)"""
        try:
            local_path = os.path.join(self.output_path, store, category, filename)
            
            # Check if file already exists locally
            if os.path.exists(local_path):
                self._set_upload_status(store, category, filename, 'both')
                return {
                    "success": True,
                    "message": "File already exists locally",
                    "status": "both"
                }
            
            # Download from cloud
            cloud_path = f"{store}/{category}/{filename}"
            download_result = self.download_file_to_local(cloud_path, local_path)
            
            if download_result.get('success'):
                self._set_upload_status(store, category, filename, 'both')
                return {
                    "success": True,
                    "message": "File downloaded to local storage",
                    "status": "both"
                }
            else:
                return {
                    "success": False,
                    "error": download_result.get('error')
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def smart_delete_file(self, store: str, category: str, filename: str, delete_local: bool = True, delete_cloud: bool = False) -> Dict[str, Any]:
        """Smart file deletion with confirmation options"""
        try:
            results = {"local": None, "cloud": None}
            errors = []
            
            # Delete local file
            if delete_local:
                local_path = os.path.join(self.output_path, store, category, filename)
                if os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                        results["local"] = "deleted"
                        logger.info(f"✅ Local file deleted: {local_path}")
                    except Exception as e:
                        results["local"] = "failed"
                        errors.append(f"Local delete failed: {str(e)}")
                        logger.error(f"[ERROR] Local delete failed: {e}")
                else:
                    results["local"] = "not_found"
                    logger.warning(f"[WARNING] Local file not found: {local_path}")
            
            # Delete cloud file
            if delete_cloud:
                if self.storage_manager:
                    try:
                        cloud_path = f"crawler-data/{store}/{category}/{filename}"
                        delete_result = self.storage_manager.delete_file(cloud_path)
                        if delete_result.get('success'):
                            results["cloud"] = "deleted"
                            logger.info(f"✅ Cloud file deleted: {cloud_path}")
                        else:
                            results["cloud"] = "failed"
                            errors.append(f"Cloud delete failed: {delete_result.get('error', 'Unknown error')}")
                            logger.error(f"[ERROR] Cloud delete failed: {delete_result.get('error')}")
                    except Exception as e:
                        results["cloud"] = "failed"
                        errors.append(f"Cloud delete error: {str(e)}")
                        logger.error(f"[ERROR] Cloud delete error: {e}")
                else:
                    results["cloud"] = "not_available"
                    logger.warning("[WARNING] Firebase not available for cloud delete")
            
            # Update status
            try:
                if delete_local and delete_cloud:
                    if results["local"] in ["deleted", "not_found"] and results["cloud"] in ["deleted", "not_found", "not_available"]:
                        self._set_upload_status(store, category, filename, 'deleted')
                elif delete_local and not delete_cloud:
                    if results["local"] in ["deleted", "not_found"]:
                        self._set_upload_status(store, category, filename, 'cloud_only')
                elif delete_cloud and not delete_local:
                    if results["cloud"] in ["deleted", "not_found"]:
                        self._set_upload_status(store, category, filename, 'local')
            except Exception as e:
                errors.append(f"Status update failed: {str(e)}")
                logger.error(f"[ERROR] Status update failed: {e}")
            
            # Determine success
            success = True
            if delete_local and results["local"] == "failed":
                success = False
            if delete_cloud and results["cloud"] == "failed":
                success = False
            
            response = {
                "success": success,
                "results": results,
                "message": "File deletion completed" if success else "File deletion completed with errors"
            }
            
            if errors:
                response["errors"] = errors
            
            return response
            
        except Exception as e:
            logger.error(f"[ERROR] Smart delete error: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "File deletion failed"
            }
    
    def _get_cached_files_payload(self) -> Optional[Dict[str, Any]]:
        with self._cache_lock:
            payload = self._files_cache.get("payload")
            timestamp = self._files_cache.get("timestamp", 0.0)
        if not payload:
            return None
        if time.monotonic() - timestamp > self._files_cache_ttl:
            return None
        return payload

    def _store_files_payload(self, payload: Dict[str, Any]) -> None:
        with self._cache_lock:
            self._files_cache = {
                "payload": payload,
                "timestamp": time.monotonic(),
            }

    def _invalidate_files_cache(self) -> None:
        with self._cache_lock:
            self._files_cache = {"payload": None, "timestamp": 0.0}

    def _format_bytes(self, value: int) -> str:
        if value <= 0:
            return '0 B'
        units = ['B', 'KB', 'MB', 'GB', 'TB']
        index = min(len(units) - 1, int((value.bit_length() - 1) / 10))
        power = 1024 ** index
        amount = value / power
        return f"{amount:.2f} {units[index]}"

    def _build_summary(self, files: List[Dict[str, Any]]) -> Dict[str, Any]:
        status_counts: Dict[str, int] = {
            'local_only': 0,
            'cloud_only': 0,
            'both': 0,
            'uploading': 0,
            'downloading': 0,
            'failed': 0,
        }
        store_summary: Dict[str, Dict[str, int]] = {}
        total_size = 0

        for file_info in files:
            status = file_info.get('status_class') or 'unknown'
            status_counts[status] = status_counts.get(status, 0) + 1

            store_name = file_info.get('store', 'unknown')
            store_summary.setdefault(store_name, {
                'total': 0,
                'local_only': 0,
                'cloud_only': 0,
                'both': 0,
            })
            store_summary[store_name]['total'] += 1
            if status == 'local_only':
                store_summary[store_name]['local_only'] += 1
            elif status == 'cloud_only':
                store_summary[store_name]['cloud_only'] += 1
            elif status == 'both':
                store_summary[store_name]['both'] += 1

            size_value = file_info.get('size') or 0
            try:
                total_size += int(size_value)
            except (TypeError, ValueError):
                continue

        return {
            'totalFiles': len(files),
            'statusCounts': status_counts,
            'stores': store_summary,
            'totalSizeBytes': total_size,
            'totalSizeDisplay': self._format_bytes(total_size),
            'generatedAt': datetime.utcnow().isoformat(),
        }

    def list_all_files_with_status(self) -> Dict[str, Any]:
        """Enhanced method to list all files with detailed status information"""
        return self.list_all_files()
    
    def get_file_status(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Get detailed status information for a specific file"""
        try:
            # Check local file
            local_path = os.path.join(self.output_path, store, category, filename)
            has_local = os.path.exists(local_path)
            
            # Check cloud file
            has_cloud = False
            cloud_info = None
            if self.storage_manager:
                try:
                    cloud_path = f"crawler-data/{store}/{category}/{filename}"
                    cloud_info = self.storage_manager.get_file_info(cloud_path)
                    has_cloud = cloud_info is not None
                except:
                    pass
            
            # Get upload status
            upload_status = self._get_upload_status(store, category, filename)
            
            # Determine overall status
            if upload_status == 'uploading':
                status = 'uploading'
                location = 'Uploading...'
            elif has_local and has_cloud:
                status = 'both'
                location = 'Cloud + Local'
            elif has_local and not has_cloud:
                status = 'local'
                location = 'Local'
            elif not has_local and has_cloud:
                status = 'cloud_only'
                location = 'Cloud Only'
            else:
                status = 'not_found'
                location = 'Not Found'
            
            return {
                "success": True,
                "status": status,
                "location": location,
                "has_local": has_local,
                "has_cloud": has_cloud,
                "upload_status": upload_status,
                "local_path": local_path if has_local else None,
                "cloud_info": cloud_info
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def upload_file_to_cloud(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Upload a specific file to cloud storage"""
        try:
            if not self.storage_manager:
                return {"success": False, "error": "Cloud storage not available"}
            
            local_path = os.path.join(self.output_path, store, category, filename)
            if not os.path.exists(local_path):
                return {"success": False, "error": "Local file not found"}
            
            # Set uploading status
            self._set_upload_status(store, category, filename, 'uploading')
            
            # Read file content
            with open(local_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Upload to cloud
            result = self.storage_manager.upload_content(content, store, category, filename)
            
            if result.get('success'):
                # Clear upload status - file is now in both locations
                self._clear_upload_status(store, category, filename)
                self._invalidate_files_cache()
                return {
                    "success": True,
                    "message": f"File {filename} uploaded to cloud",
                    "cloud_path": result.get('cloud_path')
                }
            else:
                self._set_upload_status(store, category, filename, 'failed')
                return {
                    "success": False,
                    "error": result.get('error', 'Upload failed')
                }
        
        except Exception as e:
            self._set_upload_status(store, category, filename, 'failed')
            return {
                "success": False,
                "error": str(e)
            }
    
    def download_file_to_local(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Download a file from cloud to local storage"""
        try:
            if not self.storage_manager:
                return {"success": False, "error": "Cloud storage not available"}
            
            cloud_path = f"crawler-data/{store}/{category}/{filename}"
            
            # Set downloading status
            self._set_upload_status(store, category, filename, 'downloading')
            
            # Download from cloud
            result = self.storage_manager.download_file_content(cloud_path)
            
            if result.get('success'):
                # Ensure local directory exists
                local_dir = os.path.join(self.output_path, store, category)
                os.makedirs(local_dir, exist_ok=True)
                
                # Save to local file
                local_path = os.path.join(local_dir, filename)
                with open(local_path, 'w', encoding='utf-8') as f:
                    f.write(result['content'])
                
                # Clear downloading status
                self._clear_upload_status(store, category, filename)
                self._invalidate_files_cache()
                
                return {
                    "success": True,
                    "message": f"File {filename} downloaded to local",
                    "local_path": local_path
                }
            else:
                # Set failed status
                self._set_upload_status(store, category, filename, 'failed')
                return {
                    "success": False,
                    "error": result.get('error', 'Download failed')
                }
        
        except Exception as e:
            self._set_upload_status(store, category, filename, 'failed')
            return {
                "success": False,
                "error": str(e)
            }
    
    def download_file_content(self, cloud_path: str) -> Dict[str, Any]:
        """Download file content for browser download"""
        try:
            if not self.storage_manager:
                return {"success": False, "error": "Cloud storage not available"}
            
            return self.storage_manager.download_file_content(cloud_path)
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def save_classification_result(
        self,
        supermarket_slug: str,
        filename: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Upload classification results JSON to cloud storage."""
        if not self.storage_manager:
            return {"success": False, "error": "Cloud storage not available"}

        try:
            return self.storage_manager.save_classification_result(
                supermarket_slug,
                filename,
                content,
                metadata or {},
            )
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": str(exc)}

    def list_classification_results(self) -> Dict[str, Any]:
        """List classification result files stored in cloud."""
        if not self.storage_manager:
            return {"success": False, "error": "Cloud storage not available"}

        try:
            return self.storage_manager.list_classification_results()
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": str(exc)}

    def download_classification_result(self, cloud_path: str) -> Dict[str, Any]:
        """Download a classification result file from cloud storage."""
        if not self.storage_manager:
            return {"success": False, "error": "Cloud storage not available"}

        try:
            return self.storage_manager.download_classification_result(cloud_path)
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "error": str(exc)}
    
    def delete_classification_result(self, cloud_path: str) -> Dict[str, Any]:
        """Delete a classification result from cloud storage"""
        if not self.storage_manager:
            return {"success": False, "error": "Firebase storage not available"}
            
        return self.storage_manager.delete_classification_result(cloud_path)
    
    def make_cloud_only(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Remove local copy, keep cloud version"""
        try:
            local_path = os.path.join(self.output_path, store, category, filename)
            
            if os.path.exists(local_path):
                os.remove(local_path)
                self._set_upload_status(store, category, filename, 'cloud_only')
                self._invalidate_files_cache()
                return {
                    "success": True,
                    "message": f"File {filename} is now cloud-only",
                    "status": "cloud_only"
                }
            else:
                self._set_upload_status(store, category, filename, 'cloud_only')
                self._invalidate_files_cache()
                return {
                    "success": True,
                    "message": f"File {filename} was already cloud-only",
                    "status": "cloud_only"
                }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def smart_delete_file(self, store: str, category: str, filename: str, 
                         delete_local: bool = True, delete_cloud: bool = True) -> Dict[str, Any]:
        """Smart delete file from local and/or cloud storage"""
        try:
            results = []
            
            # Delete from local storage
            if delete_local:
                local_path = os.path.join(self.output_path, store, category, filename)
                if os.path.exists(local_path):
                    os.remove(local_path)
                    results.append("local")
            
            # Delete from cloud storage
            if delete_cloud and self.storage_manager:
                cloud_path = f"crawler-data/{store}/{category}/{filename}"
                result = self.storage_manager.delete_file(cloud_path)
                if result.get('success'):
                    results.append("cloud")
            
            # Clear upload status
            self._clear_upload_status(store, category, filename)
            self._invalidate_files_cache()
            
            if results:
                return {
                    "success": True,
                    "message": f"File {filename} deleted from {' and '.join(results)}",
                    "deleted_from": results
                }
            else:
                return {
                    "success": False,
                    "error": "No files were deleted"
                }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def clear_all_files(self) -> Dict[str, Any]:
        """Clear all files from both local and cloud storage"""
        try:
            # Clear local files
            if os.path.exists(self.output_path):
                shutil.rmtree(self.output_path)
                os.makedirs(self.output_path, exist_ok=True)
                
                # Recreate directory structure
                stores = ['keells', 'cargills']
                categories = ['fruits', 'vegetables']
                for store in stores:
                    for category in categories:
                        os.makedirs(os.path.join(self.output_path, store, category), exist_ok=True)
            
            # Clear cloud files
            if self.storage_manager:
                for store in ['keells', 'cargills']:
                    files = self.storage_manager.list_crawler_files(store)
                    if files:
                        for file_info in files:
                            self.storage_manager.delete_file(file_info['name'])
            
            # Clear upload status cache
            self.cache_store.clear_all_upload_status()

            self._invalidate_files_cache()
            
            return {
                "success": True,
                "message": "All files cleared from local and cloud storage"
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_upload_progress(self) -> Dict[str, Any]:
        """Get current upload/download progress"""
        try:
            status_data = self.cache_store.load_upload_status_map()
            uploading = sum(1 for status in status_data.values() if status == 'uploading')
            downloading = sum(1 for status in status_data.values() if status == 'downloading')
            failed = sum(1 for status in status_data.values() if status == 'failed')

            return {
                "success": True,
                "uploading": uploading,
                "downloading": downloading,
                "failed": failed,
                "total_active": uploading + downloading
            }
        
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def load_file_content(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Load file content from local storage or cloud storage"""
        try:
            # First try to load from local storage
            local_path = os.path.join(self.output_path, store, category, filename)
            if os.path.exists(local_path):
                with open(local_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                return {
                    "success": True,
                    "content": content,
                    "source": "local",
                    "file_path": local_path
                }
            
            # If not found locally, try to load from cloud
            if self.storage_manager:
                try:
                    cloud_path = f"crawler-data/{store}/{category}/{filename}"
                    cloud_content = self.storage_manager.download_file_content(cloud_path)
                    if cloud_content.get('success'):
                        return {
                            "success": True,
                            "content": cloud_content['content'],
                            "source": "cloud",
                            "cloud_path": cloud_path
                        }
                except Exception as e:
                    logger.warning(f"Failed to load from cloud: {e}")
            
            return {
                "success": False,
                "error": f"File not found in local or cloud storage: {store}/{category}/{filename}"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Error loading file: {str(e)}"
            }
    
    def get_file_content_as_json(self, store: str, category: str, filename: str) -> Dict[str, Any]:
        """Load and parse file content as JSON for frontend display"""
        try:
            content_result = self.load_file_content(store, category, filename)
            if not content_result.get('success'):
                return content_result
            
            import json
            try:
                json_content = json.loads(content_result['content'])
                
                # Handle different JSON structures to extract items
                items = []
                if isinstance(json_content, list):
                    # If it's a list of items
                    items = json_content
                elif isinstance(json_content, dict) and 'items' in json_content:
                    # If it's an object with items property
                    items = json_content['items']
                elif isinstance(json_content, dict):
                    # If it's a single object, wrap in list
                    items = [json_content]
                
                return {
                    "success": True,
                    "data": items,
                    "total_items": len(items),
                    "source": content_result.get('source'),
                    "filename": filename,
                    "store": store,
                    "category": category
                }
                
            except json.JSONDecodeError as e:
                return {
                    "success": False,
                    "error": f"Invalid JSON format: {str(e)}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Error parsing file as JSON: {str(e)}"
            }

    # ...existing code...
    
# Create an alias for the class name used in the test
CleanFileManager = CleanFileStorageManager

def main():
    """Main function for command line usage"""
    import sys
    
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No operation specified"}))
        return
    
    operation = sys.argv[1]
    manager = CleanFileStorageManager()
    
    try:
        if operation == "list_all_files":
            result = manager.list_all_files()
            print(json.dumps(result))
            
        elif operation == "auto_upload_new_files":
            store = sys.argv[2] if len(sys.argv) > 2 else None
            category = sys.argv[3] if len(sys.argv) > 3 else None
            result = manager.auto_upload_new_files(store, category)
            print(json.dumps(result))
        
        elif operation == "get_file_upload_status":
            store = sys.argv[2] if len(sys.argv) > 2 else ""
            category = sys.argv[3] if len(sys.argv) > 3 else ""
            filename = sys.argv[4] if len(sys.argv) > 4 else ""
            result = manager.get_file_upload_status(store, category, filename)
            print(json.dumps(result))
        
        elif operation == "switch_to_cloud_only":
            store = sys.argv[2] if len(sys.argv) > 2 else ""
            category = sys.argv[3] if len(sys.argv) > 3 else ""
            filename = sys.argv[4] if len(sys.argv) > 4 else ""
            result = manager.switch_to_cloud_only(store, category, filename)
            print(json.dumps(result))
        
        elif operation == "switch_to_local_and_cloud":
            store = sys.argv[2] if len(sys.argv) > 2 else ""
            category = sys.argv[3] if len(sys.argv) > 3 else ""
            filename = sys.argv[4] if len(sys.argv) > 4 else ""
            result = manager.switch_to_local_and_cloud(store, category, filename)
            print(json.dumps(result))
        
        elif operation == "smart_delete_file":
            store = sys.argv[2] if len(sys.argv) > 2 else ""
            category = sys.argv[3] if len(sys.argv) > 3 else ""
            filename = sys.argv[4] if len(sys.argv) > 4 else ""
            delete_local = sys.argv[5].lower() == 'true' if len(sys.argv) > 5 else True
            delete_cloud = sys.argv[6].lower() == 'true' if len(sys.argv) > 6 else False
            result = manager.smart_delete_file(store, category, filename, delete_local, delete_cloud)
            print(json.dumps(result))
            
        elif operation == "delete_from_cloud":
            cloud_path = sys.argv[2] if len(sys.argv) > 2 else ""
            result = manager.delete_from_cloud(cloud_path)
            print(json.dumps(result))
            
        elif operation == "delete_local_file":
            local_path = sys.argv[2] if len(sys.argv) > 2 else ""
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
                    result = {"success": True, "message": f"Deleted {local_path}"}
                else:
                    result = {"success": False, "error": "File not found"}
            except Exception as e:
                result = {"success": False, "error": str(e)}
            print(json.dumps(result))
            
        elif operation == "clear_all_files":
            # Clear local files
            if os.path.exists(manager.output_path):
                shutil.rmtree(manager.output_path)
                os.makedirs(f'{manager.output_path}/keells/fruits', exist_ok=True)
                os.makedirs(f'{manager.output_path}/keells/vegetables', exist_ok=True)
                os.makedirs(f'{manager.output_path}/cargills/fruits', exist_ok=True)
                os.makedirs(f'{manager.output_path}/cargills/vegetables', exist_ok=True)
            
            # Clear Firebase storage
            if manager.storage_manager:
                cloud_files = manager.storage_manager.list_files()
                for file_info in cloud_files:
                    manager.storage_manager.delete_file(file_info['path'])
            
            # Clear upload status cache
            manager.cache_store.clear_all_upload_status()
            
            result = {"success": True, "message": "All files cleared"}
            print(json.dumps(result))
            
        elif operation == "get_config":
            result = manager.config
            print(json.dumps(result))
            
        elif operation == "save_config":
            if len(sys.argv) > 2:
                config_json = sys.argv[2]
                config = json.loads(config_json)
                result = manager.save_config(config)
                print(json.dumps(result))
            else:
                print(json.dumps({"error": "No config provided"}))
                
        else:
            print(json.dumps({"error": f"Unknown operation: {operation}"}))
            
    except Exception as e:
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))

if __name__ == "__main__":
    main()

# Create alias for backward compatibility
CleanFileManager = CleanFileStorageManager

"""Enhanced crawler manager with Firebase Storage integration.

Combines local storage with cloud storage capabilities.
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import queue
import logging

# Add the backend path for logger_service.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Firebase Storage Manager (imported when available).
try:
    from firebase_storage_manager import get_storage_manager
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.warning("Firebase Storage not available. Install requirements: pip install -r requirements-firebase.txt")

class EnhancedCrawlerManager:
    """Crawler management system with Firebase Storage integration.

    Supports parallel execution, real-time progress monitoring, and cloud storage.
    """
    
    def __init__(self, use_firebase: bool = True):
        # Load environment variables.
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass  # dotenv not available; continue without it.
            
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.crawler_dir = self.base_dir
        self.output_dir = os.path.join(self.base_dir, "output")
        
        # Storage configuration.
        self.use_firebase = use_firebase and FIREBASE_AVAILABLE
        self.storage_manager = None
        
        if self.use_firebase:
            try:
                self.storage_manager = get_storage_manager()
                logger.info("Firebase Storage initialized")
            except Exception as e:
                log_error(logger, e, {"context": "Firebase Storage initialization"})
                self.use_firebase = False
        
        # Ensure output directories exist.
        os.makedirs(os.path.join(self.output_dir, "keells"), exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, "cargills"), exist_ok=True)
        
        # Storage configuration file.
        self.config_file = os.path.join(self.base_dir, "storage_config.json")
        self.storage_config = self._load_storage_config()
        
        # Active crawler tracking.
        self.active_crawlers = {}
        self.crawler_results = {}
        self.crawler_logs = {}
        
        # Threading for concurrent execution.
        self.executor = ThreadPoolExecutor(max_workers=8)
        self.progress_queues = {}
        
        # Available crawlers configuration.
        self.available_crawlers = {
            "keells": {
                "vegetables": {
                    "file": "keells_vegetables_crawler.py",
                    "name": "Keells Vegetables",
                    "category": "Fresh Produce",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "fruits": {
                    "file": "keells_fruits_crawler.py", 
                    "name": "Keells Fruits",
                    "category": "Fresh Produce",
                    "estimated_time": "2-3 minutes",
                    "max_items": 80
                },
                "seafood": {
                    "file": "keells_seafood_crawler.py",
                    "name": "Keells Seafood",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes",
                    "max_items": 60
                },
                "meat": {
                    "file": "keells_meat_crawler.py",
                    "name": "Keells Meat",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes",
                    "max_items": 60
                },
                "chilled_products": {
                    "file": "keells_chilled_products_crawler.py",
                    "name": "Keells Chilled Products",
                    "category": "Dairy & Chilled",
                    "estimated_time": "2-3 minutes",
                    "max_items": 80
                },
                "frozen_food": {
                    "file": "keells_frozen_food_crawler.py",
                    "name": "Keells Frozen Food",
                    "category": "Frozen",
                    "estimated_time": "2-3 minutes",
                    "max_items": 70
                },
                "groceries": {
                    "file": "keells_groceries_crawler.py",
                    "name": "Keells Groceries",
                    "category": "Pantry",
                    "estimated_time": "3-4 minutes",
                    "max_items": 120
                },
                "household_essentials": {
                    "file": "keells_household_essentials_crawler.py",
                    "name": "Keells Household Essentials",
                    "category": "Home Care",
                    "estimated_time": "2-3 minutes",
                    "max_items": 70
                }
            },
            "cargills": {
                "vegetables": {
                    "file": "cargills_vegetables_crawler.py",
                    "name": "Cargills Vegetables", 
                    "category": "Fresh Produce",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "fruits": {
                    "file": "cargills_fruits_crawler.py",
                    "name": "Cargills Fruits",
                    "category": "Fresh Produce", 
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "beverages": {
                    "file": "cargills_beverages_crawler.py",
                    "name": "Cargills Beverages",
                    "category": "Drinks",
                    "estimated_time": "3-4 minutes",
                    "max_items": 150
                },
                "meats": {
                    "file": "cargills_meats_crawler.py",
                    "name": "Cargills Meats",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes",
                    "max_items": 80
                },
                "seafood": {
                    "file": "cargills_seafood_crawler.py", 
                    "name": "Cargills Seafood",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes",
                    "max_items": 60
                },
                "dairy": {
                    "file": "cargills_dairy_crawler.py",
                    "name": "Cargills Dairy",
                    "category": "Dairy & Chilled",
                    "estimated_time": "2-3 minutes",
                    "max_items": 90
                },
                "household": {
                    "file": "cargills_household_crawler.py",
                    "name": "Cargills Household",
                    "category": "Home Care", 
                    "estimated_time": "3-4 minutes",
                    "max_items": 120
                },
                "frozen_foods": {
                    "file": "cargills_frozen_foods_crawler.py",
                    "name": "Cargills Frozen Foods",
                    "category": "Frozen",
                    "estimated_time": "2-3 minutes",
                    "max_items": 70
                }
            }
        }
        
        logger.info("Enhanced Crawler Manager initialized")
        logger.debug("Base directory", extra={"path": self.base_dir})
        logger.debug("Available crawlers", extra={"count": self._count_total_crawlers()})
        logger.info("Firebase Storage", extra={"enabled": self.use_firebase})
    
    def _load_storage_config(self) -> Dict[str, Any]:
        """Load storage configuration."""
        default_config = {
            "storage_mode": "both",  # "local", "firebase", "both".
            "auto_upload": True,
            "keep_local_days": 7,
            "max_local_files": 50,
            "auto_cleanup": True
        }
        
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                return {**default_config, **config}
        except Exception as e:
            logger.warning(f"Could not load storage config: {e}")
        
        return default_config
    
    def save_storage_config(self, config: Dict[str, Any]):
        """Save storage configuration."""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=2)
            self.storage_config = config
            logger.info("Storage configuration saved")
        except Exception as e:
            logger.error(f"Failed to save storage config: {e}")
    
    def run_crawler_with_storage(self, store: str, category: str,
                                max_items: Optional[int] = None) -> Dict[str, Any]:
        """Run a crawler and handle storage based on configuration."""
        try:
            # Generate a unique crawler ID.
            crawler_id = f"{store}_{category}_{int(time.time())}"
            
            # Initialize crawler tracking.
            self.active_crawlers[crawler_id] = {
                "status": "starting",
                "progress": 0,
                "start_time": datetime.now().isoformat(),
                "store": store,
                "category": category,
                "config": {"max_items": max_items}
            }
            
            # Run the crawler.
            result = self._execute_crawler(store, category, max_items)
            
            if result["success"]:
                # Handle storage based on configuration.
                storage_result = self._handle_file_storage(
                    result["output_file"], store, category, result["metadata"]
                )
                result["storage"] = storage_result
                
                # Update crawler status.
                self.active_crawlers[crawler_id]["status"] = "completed"
                self.active_crawlers[crawler_id]["progress"] = 100
                
            else:
                self.active_crawlers[crawler_id]["status"] = "failed"
            
            return result
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "crawler_id": crawler_id
            }
    
    def _execute_crawler(self, store: str, category: str, 
                        max_items: Optional[int] = None) -> Dict[str, Any]:
        """
        Execute the actual crawler script
        """
        try:
            # Get crawler configuration.
            if store not in self.available_crawlers or category not in self.available_crawlers[store]:
                return {
                    "success": False,
                    "error": f"Crawler not found: {store}/{category}"
                }
            
            crawler_config = self.available_crawlers[store][category]
            crawler_file = crawler_config["file"]
            
            # Determine the crawler directory.
            crawler_path = os.path.join(self.crawler_dir, store, crawler_file)
            
            if not os.path.exists(crawler_path):
                return {
                    "success": False,
                    "error": f"Crawler file not found: {crawler_path}"
                }
            
            # Prepare the command.
            cmd = [sys.executable, crawler_path]
            if max_items:
                cmd.extend(["--max-items", str(max_items)])
            
            # Execute crawler.
            logger.info("Running crawler", extra={"name": crawler_config["name"]})
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=os.path.dirname(crawler_path)
            )
            
            if process.returncode == 0:
                # Find the output file.
                expected_output = os.path.join(
                    self.output_dir, store, f"{store}_{category}.json"
                )
                
                if os.path.exists(expected_output):
                    # Get file info.
                    file_size = os.path.getsize(expected_output)
                    
                    # Load and count items.
                    with open(expected_output, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    return {
                        "success": True,
                        "output_file": expected_output,
                        "items_count": len(data) if isinstance(data, list) else 1,
                        "file_size": file_size,
                        "metadata": {
                            "store": store,
                            "category": category,
                            "crawler_name": crawler_config["name"],
                            "execution_time": datetime.now().isoformat(),
                            "items_found": len(data) if isinstance(data, list) else 1
                        }
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Output file not found: {expected_output}"
                    }
            else:
                return {
                    "success": False,
                    "error": f"Crawler execution failed: {process.stderr}"
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Crawler execution error: {str(e)}"
            }
    
    def _handle_file_storage(self, local_file: str, store: str, category: str, 
                           metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle file storage based on configuration
        """
        storage_result = {
            "local": {"success": True, "path": local_file},
            "firebase": {"success": False, "path": None}
        }
        
        try:
            # Always keep a local copy initially.
            if self.storage_config["storage_mode"] in ["firebase", "both"]:
                if self.use_firebase and self.storage_manager:
                    # Upload to Firebase.
                    firebase_result = self.storage_manager.upload_crawler_data(
                        local_file, store, category, metadata
                    )
                    storage_result["firebase"] = firebase_result
                    
                    # If Firebase upload is successful and mode is "firebase" only.
                    if (firebase_result["success"] and 
                        self.storage_config["storage_mode"] == "firebase" and
                        not self.storage_config.get("keep_local_backup", False)):
                        # Remove the local file.
                        try:
                            os.remove(local_file)
                            storage_result["local"]["success"] = False
                            storage_result["local"]["removed"] = True
                        except Exception as e:
                            logger.warning(f"Could not remove local file: {e}")
            
            # Clean up old local files if configured.
            if self.storage_config.get("auto_cleanup", False):
                self._cleanup_old_files(store, category)
            
            return storage_result
            
        except Exception as e:
            storage_result["error"] = str(e)
            return storage_result
    
    def _cleanup_old_files(self, store: str, category: str):
        """
        Clean up old local files based on configuration
        """
        try:
            store_dir = os.path.join(self.output_dir, store)
            if not os.path.exists(store_dir):
                return
            
            # Get all JSON files for this category.
            pattern = f"{store}_{category}"
            files = []
            
            for file in os.listdir(store_dir):
                if file.startswith(pattern) and file.endswith('.json'):
                    file_path = os.path.join(store_dir, file)
                    files.append((file_path, os.path.getmtime(file_path)))
            
            # Sort by modification time (oldest first).
            files.sort(key=lambda x: x[1])
            
            # Remove old files based on configuration.
            max_files = self.storage_config.get("max_local_files", 50)
            keep_days = self.storage_config.get("keep_local_days", 7)
            current_time = time.time()
            
            for file_path, mod_time in files:
                should_remove = False
                
                # Check if too many files.
                if len(files) > max_files:
                    should_remove = True
                
                # Check if too old.
                days_old = (current_time - mod_time) / (24 * 3600)
                if days_old > keep_days:
                    should_remove = True
                
                if should_remove:
                    try:
                        os.remove(file_path)
                        logger.info("Cleaned up old file", extra={"file": os.path.basename(file_path)})
                    except Exception as e:
                        logger.warning(f"Could not remove {file_path}: {e}")
                        
        except Exception as e:
            logger.warning(f"Cleanup error: {e}")
    
    def get_storage_status(self) -> Dict[str, Any]:
        """
        Get comprehensive storage status
        """
        status = {
            "firebase_available": self.use_firebase,
            "config": self.storage_config,
            "local_stats": self._get_local_stats(),
            "firebase_stats": None
        }
        
        if self.use_firebase and self.storage_manager:
            try:
                status["firebase_stats"] = self.storage_manager.get_storage_stats()
            except Exception as e:
                status["firebase_error"] = str(e)
        
        return status
    
    def _get_local_stats(self) -> Dict[str, Any]:
        """
        Get local storage statistics
        """
        stats = {
            "total_files": 0,
            "total_size": 0,
            "stores": {}
        }
        
        try:
            for store in ["keells", "cargills"]:
                store_dir = os.path.join(self.output_dir, store)
                if os.path.exists(store_dir):
                    store_stats = {"files": 0, "size": 0}
                    
                    for file in os.listdir(store_dir):
                        if file.endswith('.json'):
                            file_path = os.path.join(store_dir, file)
                            file_size = os.path.getsize(file_path)
                            store_stats["files"] += 1
                            store_stats["size"] += file_size
                    
                    stats["stores"][store] = store_stats
                    stats["total_files"] += store_stats["files"]
                    stats["total_size"] += store_stats["size"]
            
            stats["total_size_mb"] = round(stats["total_size"] / (1024 * 1024), 2)
            
        except Exception as e:
            stats["error"] = str(e)
        
        return stats
    
    def _count_total_crawlers(self) -> int:
        """Count total available crawlers"""
        total = 0
        for store in self.available_crawlers.values():
            total += len(store)
        return total
    
    # Additional methods for Firebase file management.
    def download_from_firebase(self, cloud_path: str, local_path: str = None) -> Dict[str, Any]:
        """Download file from Firebase Storage"""
        if not self.use_firebase:
            return {"success": False, "error": "Firebase Storage not available"}
        
        return self.storage_manager.download_crawler_data(cloud_path, local_path)
    
    def list_firebase_files(self, store: str = None, category: str = None) -> List[Dict[str, Any]]:
        """List files in Firebase Storage"""
        if not self.use_firebase:
            return []
        
        return self.storage_manager.list_crawler_files(store, category)
    
    def delete_from_firebase(self, cloud_path: str) -> Dict[str, Any]:
        """Delete file from Firebase Storage"""
        if not self.use_firebase:
            return {"success": False, "error": "Firebase Storage not available"}
        
        return self.storage_manager.delete_crawler_file(cloud_path)


# Singleton instance.
_enhanced_crawler_manager = None

def get_enhanced_crawler_manager(use_firebase: bool = True) -> EnhancedCrawlerManager:
    """
    Get singleton instance of EnhancedCrawlerManager
    """
    global _enhanced_crawler_manager
    if _enhanced_crawler_manager is None:
        _enhanced_crawler_manager = EnhancedCrawlerManager(use_firebase=use_firebase)
    return _enhanced_crawler_manager


if __name__ == "__main__":
    # Test the enhanced crawler manager.
    manager = get_enhanced_crawler_manager()
    
    logger.info("Storage Status")
    status = manager.get_storage_status()
    logger.debug("Storage status", extra={"status": status})
    
    logger.info("Available Crawlers")
    for store, categories in manager.available_crawlers.items():
        logger.info(f"Store: {store.upper()}")
        for category, config in categories.items():
            logger.debug("Crawler", extra={"name": config["name"], "estimated_time": config["estimated_time"]})

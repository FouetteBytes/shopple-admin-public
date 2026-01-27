import asyncio
import json
import os
import subprocess
import sys
import time
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import queue

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger
from cache.sqlite_store import CrawlerCacheStore

# Try to import FirebaseStorageManager
try:
    from firebase_storage_manager import FirebaseStorageManager
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

logger = get_logger(__name__)

class CrawlerManager:
    """
    Advanced Crawler Management System for Dynamic Dashboard Integration
    Supports parallel execution, real-time progress monitoring, and intelligent results aggregation
    """
    
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.crawler_dir = self.base_dir
        self.output_dir = os.path.join(self.base_dir, "output")
        self.cache_dir = os.path.join(self.base_dir, "cache")
        self.cache_store = CrawlerCacheStore(self.cache_dir)
        
        # Initialize Firebase Storage Manager if available
        self.firebase_manager = None
        if FIREBASE_AVAILABLE:
            try:
                self.firebase_manager = FirebaseStorageManager()
                logger.info("Firebase Storage Manager initialized in Crawler Manager")
            except Exception as e:
                logger.warning(f"Failed to initialize Firebase Storage Manager: {e}")
        
        # Ensure output directories exist
        os.makedirs(os.path.join(self.output_dir, "keells"), exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, "cargills"), exist_ok=True)
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # Detect Python executable from environment or virtual environment
        self.python_executable = self._get_python_executable()
        self.default_max_items = int(os.getenv("CRAWLER_DEFAULT_MAX_ITEMS", "50"))
        
        # Active crawler tracking
        self.active_crawlers = {}
        self.crawler_results = {}
        self.cleared_results = set()  # Track cleared result IDs
        self.cleared_activities = set()
        self.crawler_logs = {}
        
        # Lazy loading flags
        self._results_synced = False
        
        # Load persistent results (lightweight - just JSON files)
        self._load_persistent_results()
        self._load_cleared_results()
        self._load_cleared_activities()
        
        # Don't sync with files on startup - do it lazily when needed
        # self._sync_results_with_files()
        
        # Threading for concurrent execution
        # Reduced max_workers for Docker stability (Playwright is memory intensive)
        self.executor = ThreadPoolExecutor(max_workers=8)
        self.progress_queues = {}
        
        # Job Queue Directory (for Docker separation)
        self.jobs_dir = os.path.join(self.base_dir, "jobs")
        self.logs_dir = os.path.join(self.base_dir, "logs")
        os.makedirs(self.jobs_dir, exist_ok=True)
        os.makedirs(self.logs_dir, exist_ok=True)
        
        # Available crawlers configuration
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
                    "max_items": 100
                },
                "beverages": {
                    "file": "keells_beverages_crawler.py",
                    "name": "Keells Beverages", 
                    "category": "Drinks",
                    "estimated_time": "3-4 minutes",
                    "max_items": 100
                },
                "meat": {
                    "file": "keells_meat_crawler.py",
                    "name": "Keells Meat",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes", 
                    "max_items": 100
                },
                "seafood": {
                    "file": "keells_seafood_crawler.py",
                    "name": "Keells Seafood",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "groceries": {
                    "file": "keells_groceries_crawler.py",
                    "name": "Keells Groceries",
                    "category": "Pantry",
                    "estimated_time": "4-5 minutes",
                    "max_items": 100
                },
                "household_essentials": {
                    "file": "keells_household_essentials_crawler.py",
                    "name": "Keells Household Essentials",
                    "category": "Home Care",
                    "estimated_time": "3-4 minutes",
                    "max_items": 100
                },
                "chilled_products": {
                    "file": "keells_chilled_products_crawler.py",
                    "name": "Keells Chilled Products",
                    "category": "Dairy & Chilled",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "frozen_food": {
                    "file": "keells_frozen_food_crawler.py",
                    "name": "Keells Frozen Food",
                    "category": "Frozen",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
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
                    "max_items": 100
                },
                "meats": {
                    "file": "cargills_meats_crawler.py",
                    "name": "Cargills Meats",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "seafood": {
                    "file": "cargills_seafood_crawler.py", 
                    "name": "Cargills Seafood",
                    "category": "Protein",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "dairy": {
                    "file": "cargills_dairy_crawler.py",
                    "name": "Cargills Dairy",
                    "category": "Dairy & Chilled",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                },
                "household": {
                    "file": "cargills_household_crawler.py",
                    "name": "Cargills Household",
                    "category": "Home Care", 
                    "estimated_time": "3-4 minutes",
                    "max_items": 100
                },
                "frozen_foods": {
                    "file": "cargills_frozen_foods_crawler.py",
                    "name": "Cargills Frozen Foods",
                    "category": "Frozen",
                    "estimated_time": "2-3 minutes",
                    "max_items": 100
                }
            }
        }
        
        logger.info("Advanced Crawler Manager initialized", extra={"base_dir": self.base_dir, "python_executable": self.python_executable, "available_crawlers": self._count_total_crawlers(), "persistent_results_loaded": len(self.crawler_results)})
    
    def _get_python_executable(self) -> str:
        """
        Detect the correct Python executable to use for running crawlers.
        Priority:
        1. PYTHON_EXECUTABLE environment variable
        2. Virtual environment Python (PROJECT_ROOT/.venv/bin/python)
        3. Current Python interpreter (sys.executable)
        """
        # Check if explicitly set in environment
        env_python = os.getenv('PYTHON_EXECUTABLE')
        if env_python and os.path.exists(env_python):
            logger.debug("Using Python from PYTHON_EXECUTABLE", extra={"python_path": env_python})
            return env_python
        
        # Try to find virtual environment
        project_root = os.getenv('PROJECT_ROOT')
        if not project_root:
            # Auto-detect project root (go up from crawler directory)
            project_root = os.path.dirname(self.base_dir)
        
        # Check for .venv in project root
        venv_paths = [
            os.path.join(project_root, '.venv', 'bin', 'python'),  # Unix/macOS
            os.path.join(project_root, '.venv', 'Scripts', 'python.exe'),  # Windows
        ]
        
        for venv_path in venv_paths:
            if os.path.exists(venv_path):
                logger.debug("Using Python from virtual environment", extra={"venv_path": venv_path})
                return venv_path
        
        # Fallback to current Python
        logger.debug("Using current Python interpreter", extra={"python_path": sys.executable})
        return sys.executable
    
    def _load_persistent_results(self):
        """Load persistent results from SQLite cache"""
        try:
            self.crawler_results = self.cache_store.load_results()
            logger.info(
                f"Loaded {len(self.crawler_results)} persistent results from cache",
                extra={"results_count": len(self.crawler_results)},
            )
        except Exception as e:
            logger.warning(f"Error loading persistent results: {e}", extra={"error": str(e)})
            self.crawler_results = {}
    
    def _save_persistent_results(self):
        """Save results to persistent SQLite cache"""
        try:
            self.cache_store.replace_all_results(self.crawler_results)
            logger.info(
                f"Saved {len(self.crawler_results)} results to persistent cache",
                extra={"results_count": len(self.crawler_results)},
            )
        except Exception as e:
            logger.warning(f"Error saving persistent results: {e}", extra={"error": str(e)})
    
    def _create_result_entry(self, crawler_id: str, store: str, category: str, output_file: Optional[str], items: List[Any], firebase_url: Optional[str] = None, cloud_path: Optional[str] = None, count: Optional[int] = None):
        """Create a persistent result entry for a completed crawler"""
        try:
            # Create result entry
            result_entry = {
                "crawler_id": crawler_id,
                "store": store,
                "category": category,
                "items": items,
                "count": count if count is not None else len(items),
                "output_file": output_file,
                "firebase_url": firebase_url,
                "cloud_path": cloud_path,
                "completed_at": datetime.now().isoformat(),
                "file_size": os.path.getsize(output_file) if output_file and os.path.exists(output_file) else 0,
                "file_modified": datetime.fromtimestamp(os.path.getmtime(output_file)).isoformat() if output_file and os.path.exists(output_file) else None
            }
            
            # Store in memory
            self.crawler_results[crawler_id] = result_entry
            
            # Save to persistent cache
            self.cache_store.upsert_result(result_entry)
            
            logger.info(f"Created persistent result entry for {crawler_id}: {len(items)} items", extra={"crawler_id": crawler_id, "items_count": len(items)})
            return result_entry
            
        except Exception as e:
            logger.warning(f"Error creating result entry for {crawler_id}: {e}", extra={"crawler_id": crawler_id, "error": str(e)})
            return None
    
    def _ensure_results_synced(self):
        """Lazy sync results on first access"""
        if not self._results_synced:
            self._sync_results_with_files()
            if self.firebase_manager:
                self._sync_results_with_cloud()
            self._results_synced = True
    
    def _sync_results_with_files(self):
        """Sync results with existing files - create missing result entries"""
        try:
            logger.debug("Syncing results with existing files")
            
            # Find all output files in the new structure: crawler/output/[store]/[category]/
            for store in ["keells", "cargills"]:
                store_path = os.path.join(self.output_dir, store)
                if os.path.exists(store_path):
                    for category in os.listdir(store_path):
                        category_path = os.path.join(store_path, category)
                        if os.path.isdir(category_path):
                            for file in os.listdir(category_path):
                                if file.endswith('.json'):
                                    file_path = os.path.join(category_path, file)
                                    
                                    # Create a synthetic crawler_id
                                    # Use file modification time for uniqueness
                                    file_mtime = os.path.getmtime(file_path)
                                    synthetic_id = f"{store}_{category}_{int(file_mtime)}"
                                    
                                    # Check if we already have a result for this file
                                    existing_result = None
                                    for result_id, result in self.crawler_results.items():
                                        if (result.get('store') == store and 
                                            result.get('category') == category and
                                            result.get('output_file') == file_path):
                                            existing_result = result
                                            break
                                    
                                    if not existing_result:
                                        # Check if this specific file was cleared (by file path)
                                        file_path_key = f"file:{file_path}"
                                        if file_path_key not in self.cleared_results and synthetic_id not in self.cleared_results:
                                            # Create result entry from file only if not cleared
                                            try:
                                                with open(file_path, 'r', encoding='utf-8') as f:
                                                    items = json.load(f)
                                                
                                                if isinstance(items, list):
                                                    self._create_result_entry(synthetic_id, store, category, file_path, items)
                                                    logger.debug(f"Created result entry for existing file: {file}", extra={"file": file, "store": store, "category": category})
                                            except Exception as e:
                                                logger.warning(f"Error processing file {file}: {e}", extra={"file": file, "error": str(e)})
                                        else:
                                            logger.debug(f"Skipping cleared result: {synthetic_id} (file was cleared)", extra={"synthetic_id": synthetic_id})
                
                # Also check legacy structure: crawler/output/[store]/[store_category].json
                legacy_store_path = os.path.join(self.output_dir, store)
                if os.path.exists(legacy_store_path):
                    for file in os.listdir(legacy_store_path):
                        if file.endswith('.json') and not os.path.isdir(os.path.join(legacy_store_path, file)):
                            file_path = os.path.join(legacy_store_path, file)
                            
                            # Extract category from filename
                            file_base = file.replace('.json', '')
                            if '_' in file_base and file_base.startswith(store + '_'):
                                category = file_base[len(store) + 1:]
                                
                                # Create a synthetic crawler_id
                                file_mtime = os.path.getmtime(file_path)
                                synthetic_id = f"{store}_{category}_{int(file_mtime)}"
                                
                                # Check if we already have a result for this file
                                existing_result = None
                                for result_id, result in self.crawler_results.items():
                                    if (result.get('store') == store and 
                                        result.get('category') == category and
                                        result.get('output_file') == file_path):
                                        existing_result = result
                                        break
                                
                                if not existing_result:
                                    # Check if this specific file was cleared (by file path)
                                    file_path_key = f"file:{file_path}"
                                    if file_path_key not in self.cleared_results and synthetic_id not in self.cleared_results:
                                        # Create result entry from file only if not cleared
                                        try:
                                            with open(file_path, 'r', encoding='utf-8') as f:
                                                items = json.load(f)
                                            
                                            if isinstance(items, list):
                                                self._create_result_entry(synthetic_id, store, category, file_path, items)
                                                logger.debug(f"Created result entry for legacy file: {file}", extra={"file": file, "store": store, "category": category})
                                        except Exception as e:
                                            logger.warning(f"Error processing legacy file {file}: {e}", extra={"file": file, "error": str(e)})
                                    else:
                                        logger.debug(f"Skipping cleared legacy result: {synthetic_id}", extra={"synthetic_id": synthetic_id})
            
            logger.info(f"Sync complete. Total results: {len(self.crawler_results)}", extra={"total_results": len(self.crawler_results)})
            
        except Exception as e:
            logger.warning(f"Error syncing results with files: {e}", extra={"error": str(e)})

    def _sync_results_with_cloud(self):
        """Sync results with cloud storage"""
        try:
            logger.debug("Syncing results with cloud storage")
            for store in ["keells", "cargills"]:
                try:
                    cloud_files = self.firebase_manager.list_crawler_files(store)
                    for file_info in cloud_files:
                        if file_info is None:
                            continue
                        metadata = file_info.get('metadata') or {}
                        cloud_path = file_info.get('name')
                        
                        if not cloud_path:
                            continue
                        
                        # Check cloud_path duplication FIRST (primary deduplication key)
                        is_duplicate = False
                        for r in self.crawler_results.values():
                            if r.get('cloud_path') == cloud_path:
                                is_duplicate = True
                                break
                        if is_duplicate:
                            continue
                        
                        # Store & Category from metadata or path
                        category = metadata.get('category')
                        if not category and cloud_path:
                            # cloud_path expects: crawler-data/store/category/filename
                            parts = cloud_path.split('/')
                            if len(parts) >= 3:
                                category = parts[2]
                        if not category:
                            continue

                        timestamp_str = metadata.get('timestamp') or metadata.get('upload_time')
                        if not timestamp_str and file_info.get('timeCreated'):
                            timestamp_str = file_info.get('timeCreated')
                                
                        items_count = int(metadata.get('items_count', 0))
                        
                        # Generate a consistent crawler_id based on cloud_path hash to avoid duplicates
                        # This ensures the same file always gets the same ID regardless of metadata
                        crawler_id = metadata.get('crawler_id')
                        if not crawler_id:
                            # Use a hash of cloud_path for consistent IDs
                            import hashlib
                            path_hash = hashlib.md5(cloud_path.encode()).hexdigest()[:8]
                            crawler_id = f"{store}_{category}_{path_hash}"
                        
                        # Check crawler_id duplication (secondary check)
                        if crawler_id in self.crawler_results:
                            continue
                        
                        # Create result entry
                        self._create_result_entry(
                            crawler_id, 
                            store, 
                            category, 
                            None, 
                            [], 
                            file_info.get('mediaLink'), 
                            cloud_path,
                            count=items_count
                        )
                except Exception as ex:
                    logger.warning(f"Error syncing {store} with cloud: {ex}")
                    
        except Exception as e:
            logger.warning(f"Error syncing results with cloud: {e}")
    
    def _count_total_crawlers(self) -> int:
        """Count total available crawlers"""
        total = 0
        for store in self.available_crawlers.values():
            total += len(store)
        return total
    
    def get_available_crawlers(self) -> Dict[str, Any]:
        """Get all available crawlers with metadata"""
        return self.available_crawlers
    
    def get_crawler_status(self, crawler_id: str) -> Dict[str, Any]:
        """Get real-time status of a specific crawler"""
        if crawler_id not in self.active_crawlers:
            return {"status": "not_running", "progress": 0}
        
        crawler_data = self.active_crawlers[crawler_id]
        return {
            "status": crawler_data["status"],
            "progress": crawler_data["progress"],
            "start_time": crawler_data["start_time"],
            "current_step": crawler_data.get("current_step", ""),
            "items_found": crawler_data.get("items_found", 0),
            "logs": self.crawler_logs.get(crawler_id, []),
            "store": crawler_data.get("store", ""),
            "category": crawler_data.get("category", ""),
            "config": crawler_data.get("config", {}),
            "max_items": crawler_data.get("max_items")
        }
    
    def get_all_crawler_statuses(self) -> Dict[str, Any]:
        """Get status of all active crawlers"""
        statuses = {}
        for crawler_id in list(self.active_crawlers.keys()):
            statuses[crawler_id] = self.get_crawler_status(crawler_id)
        return statuses
    
    def start_crawler(
        self,
        store: str,
        category: str,
        max_items: Optional[int] = None,
        headless_mode: bool = False,
        limit_mode: Optional[str] = None,
    ) -> str:
        """
        Start a single crawler
        Returns: crawler_id for tracking
        """
        if store not in self.available_crawlers or category not in self.available_crawlers[store]:
            raise ValueError(f"Crawler not found: {store}/{category}")
        
        crawler_config = self.available_crawlers[store][category]
        crawler_id = f"{store}_{category}_{int(time.time())}"
        
        # Initialize crawler tracking
        # Copy config so we don't mutate the global template
        runtime_config = dict(crawler_config)
        normalized_limit_mode = (limit_mode or ("custom" if max_items is not None else "default")).strip().lower()
        override_max: Optional[int] = None
        if max_items is not None:
            try:
                override_max = max(1, int(max_items))
            except Exception:
                override_max = None

        effective_max: Optional[int] = None
        if normalized_limit_mode == "all":
            effective_max = None
        elif normalized_limit_mode == "custom" and override_max is not None:
            effective_max = override_max
        elif override_max is not None:
            effective_max = override_max
            normalized_limit_mode = "custom"
        else:
            effective_max = self.default_max_items
            normalized_limit_mode = "default"

        runtime_config["max_items"] = effective_max

        self.active_crawlers[crawler_id] = {
            "store": store,
            "category": category,
            "status": "starting",
            "progress": 0,
            "start_time": datetime.now().isoformat(),
            "config": runtime_config,
            "max_items": effective_max,
            "headless_mode": headless_mode,
            "limit_mode": normalized_limit_mode,
        }
        
        self.crawler_logs[crawler_id] = []
        self.progress_queues[crawler_id] = queue.Queue()
        
        # Submit to thread pool
        future = self.executor.submit(self._run_crawler, crawler_id, store, category, effective_max, headless_mode)
        self.active_crawlers[crawler_id]["future"] = future
        
        mode_str = " (headless)" if headless_mode else " (visible)"
        self._log(crawler_id, f" Started {crawler_config['name']} crawler{mode_str}")
        return crawler_id
    
    def start_crawlers_batch(
        self,
        crawler_specs: List[Dict[str, Any]],
        *,
        mode: str = "parallel",
        wait_for_completion: bool = False,
    ) -> List[str]:
        """Start a batch of crawlers either sequentially or in parallel.

        Args:
            crawler_specs: [{"store": "keells", "category": "vegetables", "max_items": 50, "headless_mode": True}, ...]
            mode: "parallel" to launch and continue immediately, "sequential" to wait between crawlers.
            wait_for_completion: When True, wait for every crawler in the batch to finish before returning (only applies to parallel mode).

        Returns:
            List of crawler IDs that were started.
        """

        if not crawler_specs:
            return []

        normalized_mode = (mode or "parallel").strip().lower()
        if normalized_mode not in {"parallel", "sequential"}:
            raise ValueError(f"Invalid batch mode: {mode}")

        logger.info(f"Starting {len(crawler_specs)} crawlers in {normalized_mode} mode", extra={"crawlers_count": len(crawler_specs), "mode": normalized_mode})

        crawler_ids: List[str] = []

        if normalized_mode == "sequential":
            for index, spec in enumerate(crawler_specs, 1):
                try:
                    logger.info(f"Starting crawler {index}/{len(crawler_specs)}: {spec['store']} {spec['category']}", extra={"index": index, "total": len(crawler_specs), "store": spec['store'], "category": spec['category']})
                    crawler_id = self.start_crawler(
                        spec["store"],
                        spec["category"],
                        spec.get("max_items") or spec.get("maxItems"),
                        spec.get("headless_mode") or spec.get("headlessMode") or False,
                        spec.get("limit_mode") or spec.get("limitMode"),
                    )
                    crawler_ids.append(crawler_id)

                    if index < len(crawler_specs):
                        logger.debug(f"Waiting for {spec['store']} {spec['category']} to complete", extra={"store": spec['store'], "category": spec['category']})
                        self._wait_for_crawler_completion(crawler_id)
                        logger.info(f"{spec['store']} {spec['category']} completed, starting next crawler", extra={"store": spec['store'], "category": spec['category']})
                except Exception as exc:  # noqa: BLE001
                    logger.error(f"Failed to start crawler {spec}: {exc}", extra={"spec": spec, "error": str(exc)})

            logger.info(f"All {len(crawler_ids)} crawlers have been started sequentially", extra={"crawlers_count": len(crawler_ids)})
            return crawler_ids

        # Parallel mode
        pending_ids: List[str] = []
        for spec in crawler_specs:
            try:
                crawler_id = self.start_crawler(
                    spec["store"],
                    spec["category"],
                    spec.get("max_items") or spec.get("maxItems"),
                    spec.get("headless_mode") or spec.get("headlessMode") or False,
                    spec.get("limit_mode") or spec.get("limitMode"),
                )
                crawler_ids.append(crawler_id)
                pending_ids.append(crawler_id)
            except Exception as exc:  # noqa: BLE001
                logger.error(f"Failed to start crawler {spec}: {exc}", extra={"spec": spec, "error": str(exc)})

        logger.info(f"Launched {len(crawler_ids)} crawlers in parallel mode", extra={"crawlers_count": len(crawler_ids)})

        if wait_for_completion and pending_ids:
            for crawler_id in pending_ids:
                self._wait_for_crawler_completion(crawler_id)

        return crawler_ids

    def start_multiple_crawlers(self, crawler_specs: List[Dict[str, Any]]) -> List[str]:
        """Backward-compatible wrapper that launches crawlers sequentially."""
        return self.start_crawlers_batch(crawler_specs, mode="sequential")

    def _normalize_store_categories(self, store: str, categories: Optional[List[str]] = None) -> List[str]:
        """Validate and normalize category list for a given store."""
        if store not in self.available_crawlers:
            raise ValueError(f"Unknown store: {store}")

        available_categories = list(self.available_crawlers[store].keys())
        if not categories:
            return available_categories

        normalized: List[str] = []
        for category in categories:
            if category == "all":
                return available_categories
            if category not in self.available_crawlers[store]:
                logger.warning(f"Skipping unavailable category {store}/{category}", extra={"store": store, "category": category})
                continue
            normalized.append(category)

        return normalized

    def _build_specs_from_selection(
        self,
        stores: List[str],
        categories_by_store: Dict[str, List[str]],
        *,
        max_items: Optional[int] = None,
        headless_mode: Optional[bool] = None,
        limit_mode: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        specs: List[Dict[str, Any]] = []
        for store in stores:
            store_categories = categories_by_store.get(store, [])
            for category in store_categories:
                spec: Dict[str, Any] = {"store": store, "category": category}
                if max_items is not None:
                    spec["max_items"] = max_items
                if headless_mode is not None:
                    spec["headless_mode"] = headless_mode
                if limit_mode is not None:
                    spec["limit_mode"] = limit_mode
                specs.append(spec)
        return specs

    def start_store_group(
        self,
        store: str,
        *,
        categories: Optional[List[str]] = None,
        mode: str = "parallel",
        max_items: Optional[int] = None,
        headless_mode: Optional[bool] = None,
        limit_mode: Optional[str] = None,
    ) -> List[str]:
        """Start all crawlers for a specific store (optionally filtered by categories)."""

        selected_categories = self._normalize_store_categories(store, categories)
        specs = self._build_specs_from_selection(
            [store],
            {store: selected_categories},
            max_items=max_items,
            headless_mode=headless_mode,
            limit_mode=limit_mode,
        )
        return self.start_crawlers_batch(specs, mode=mode)

    def start_category_group(
        self,
        category: str,
        *,
        stores: Optional[List[str]] = None,
        mode: str = "parallel",
        max_items: Optional[int] = None,
        headless_mode: Optional[bool] = None,
        limit_mode: Optional[str] = None,
    ) -> List[str]:
        """Start the same category crawler across multiple stores."""

        target_stores = stores or list(self.available_crawlers.keys())
        resolved: Dict[str, List[str]] = {}
        for store in target_stores:
            if store not in self.available_crawlers:
                logger.warning(f"Skipping unknown store {store}", extra={"store": store})
                continue
            if category not in self.available_crawlers[store]:
                logger.info(f"Category {category} not available for store {store}, skipping", extra={"category": category, "store": store})
                continue
            resolved.setdefault(store, []).append(category)

        specs = self._build_specs_from_selection(
            list(resolved.keys()),
            resolved,
            max_items=max_items,
            headless_mode=headless_mode,
            limit_mode=limit_mode,
        )
        return self.start_crawlers_batch(specs, mode=mode)

    def start_all_available_crawlers(
        self,
        *,
        mode: str = "parallel",
        max_items: Optional[int] = None,
        headless_mode: Optional[bool] = None,
        limit_mode: Optional[str] = None,
    ) -> List[str]:
        """Convenience helper to start every configured crawler."""

        categories_by_store = {
            store: list(config.keys()) for store, config in self.available_crawlers.items()
        }
        specs = self._build_specs_from_selection(
            list(categories_by_store.keys()),
            categories_by_store,
            max_items=max_items,
            headless_mode=headless_mode,
            limit_mode=limit_mode,
        )
        return self.start_crawlers_batch(specs, mode=mode)
    
    def stop_crawler(self, crawler_id: str) -> bool:
        """Stop a specific crawler"""
        if crawler_id not in self.active_crawlers:
            return False
        
        try:
            # Get the process and terminate it forcefully
            process = self.active_crawlers[crawler_id].get("process")
            if process and process.poll() is None:  # Process is still running
                import signal
                try:
                    # Try graceful termination first
                    process.terminate()
                    time.sleep(1)
                    
                    # If still running, force kill
                    if process.poll() is None:
                        process.kill()
                        time.sleep(0.5)
                    
                    self._log(crawler_id, " Process terminated")
                except Exception as pe:
                    self._log(crawler_id, f"[WARNING] Process termination error: {pe}")
            
            # Cancel the future if possible
            future = self.active_crawlers[crawler_id].get("future")
            if future and not future.done():
                future.cancel()
                self._log(crawler_id, " Future cancelled")
            
            self.active_crawlers[crawler_id]["status"] = "stopped"
            self.active_crawlers[crawler_id]["progress"] = 0
            self.active_crawlers[crawler_id]["current_step"] = "Stopped by user"
            self._log(crawler_id, " Crawler stopped by user")
            return True
        except Exception as e:
            self._log(crawler_id, f"[ERROR] Error stopping crawler: {e}")
            self.active_crawlers[crawler_id]["status"] = "failed"
            return False
    
    def stop_all_crawlers(self) -> int:
        """Stop all active crawlers"""
        stopped_count = 0
        for crawler_id in list(self.active_crawlers.keys()):
            if self.stop_crawler(crawler_id):
                stopped_count += 1
        return stopped_count
    
    def get_active_crawler_count(self) -> int:
        """Get count of truly active (running) crawlers only"""
        active_count = 0
        for crawler_data in self.active_crawlers.values():
            if crawler_data.get("status") in ["starting", "running"]:
                active_count += 1
        return active_count
    
    def cleanup_inactive_crawlers(self) -> int:
        """Remove old stopped/failed crawlers from active tracking. Completed crawlers are kept."""
        cleanup_count = 0
        crawler_ids_to_remove = []
        
        for crawler_id, crawler_data in self.active_crawlers.items():
            status = crawler_data.get("status")
            start_time = datetime.fromisoformat(crawler_data["start_time"])
            time_since_start = (datetime.now() - start_time).total_seconds()
            
            # Remove stopped/failed crawlers after 10 minutes
            # Do NOT remove completed crawlers - they should persist for user visibility
            if status in ["stopped", "failed"] and time_since_start > 600:  # 10 minutes
                crawler_ids_to_remove.append(crawler_id)
                cleanup_count += 1
        
        # Remove the inactive crawlers
        for crawler_id in crawler_ids_to_remove:
            del self.active_crawlers[crawler_id]
            if crawler_id in self.crawler_logs:
                del self.crawler_logs[crawler_id]
            if crawler_id in self.progress_queues:
                del self.progress_queues[crawler_id]
        
        return cleanup_count
    
    def _run_crawler(self, crawler_id: str, store: str, category: str, max_items: Optional[int] = None, headless_mode: bool = False) -> Dict[str, Any]:
        """Execute a single crawler in a separate thread"""
        try:
            self.active_crawlers[crawler_id]["status"] = "running"
            self._log(crawler_id, "[INFO] Initializing crawler...")
            
            # Build file path
            crawler_file = self.available_crawlers[store][category]["file"]
            crawler_path = os.path.join(self.crawler_dir, store, crawler_file)
            
            if not os.path.exists(crawler_path):
                raise FileNotFoundError(f"Crawler file not found: {crawler_path}")
            
            mode_indicator = " headless" if headless_mode else "️ visible"
            self._log(crawler_id, f"[FILE] Running: {crawler_file} ({mode_indicator})")
            self.active_crawlers[crawler_id]["progress"] = 10
            
            # Set up environment with proper encoding
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            env['PYTHONLEGACYWINDOWSFSENCODING'] = '1'
            if max_items:
                env["MAX_ITEMS"] = str(max_items)
            if headless_mode:
                env["HEADLESS_MODE"] = "true"
            
            # Start crawler process with proper encoding handling
            self.active_crawlers[crawler_id]["current_step"] = "Launching crawler"
            self.active_crawlers[crawler_id]["progress"] = 20
            
            # Start crawler process
            # If running in Docker backend, we must offload to the crawler container via Job Queue
            # We detect this by checking if we are in the backend container (no browsers)
            # A simple heuristic: check if we can import playwright (or just always use queue if configured)
            
            use_job_queue = os.getenv('USE_JOB_QUEUE', 'false').lower() == 'true'
            
            # Initialize output lines for both modes
            output_lines = []
            error_lines = []

            if use_job_queue:
                self._log(crawler_id, " Dispatching job to Crawler Service...")
                job_file = os.path.join(self.jobs_dir, f"{crawler_id}.json")
                job_data = {
                    "crawler_id": crawler_id,
                    "script_path": crawler_path,
                    "args": [],
                    "env": env
                }
                with open(job_file, 'w') as f:
                    json.dump(job_data, f)
                
                self.active_crawlers[crawler_id]["current_step"] = "Job dispatched to worker"
                self.active_crawlers[crawler_id]["progress"] = 30
                
                # Monitor the log file created by the worker
                log_file = os.path.join(self.logs_dir, f"{crawler_id}.log")
                self._log(crawler_id, f" Waiting for log file: {log_file}")
                
                # Wait for log file to appear
                retries = 0
                while not os.path.exists(log_file) and retries < 60:  # Increased wait time to 30s
                    time.sleep(0.5)
                    retries += 1
                    if self.active_crawlers[crawler_id]["status"] == "stopped":
                        return
                
                if not os.path.exists(log_file):
                    self._log(crawler_id, "⚠️ Worker did not start logging in time (30s timeout)")
                else:
                    self._log(crawler_id, "✅ Log file found, starting tail...")
                
                # Tail the log file with proper handling for Docker volume delays
                # Use unbuffered reads and track file position manually
                last_position = 0
                job_finished = False
                
                while not job_finished:
                    if self.active_crawlers[crawler_id]["status"] == "stopped":
                        break
                    
                    try:
                        # Open file, seek to last position, read new content
                        with open(log_file, 'r', encoding='utf-8') as f:
                            f.seek(last_position)
                            new_content = f.read()
                            
                            if new_content:
                                # Process each line
                                for line in new_content.split('\n'):
                                    if line.strip():
                                        output_lines.append(line.strip())
                                        self._parse_crawler_output(crawler_id, line.strip())
                                        
                                        # Log important lines (or all lines when enabled) in real-time
                                        # This matches the behavior of local execution
                                        log_all_output = os.getenv('CRAWLER_STREAM_ALL_LOGS', 'false').lower() == 'true'
                                        important_keywords = ["products", "found", "crawl", "complete", "error", "phase", "scroll", "save", "init", "config", "page", "progress"]
                                        
                                        lowercase_line = line.strip().lower()
                                        should_log_line = log_all_output or any(keyword in lowercase_line for keyword in important_keywords)
                                        if should_log_line:
                                            self._log(crawler_id, line.strip())
                                
                                # Update position
                                last_position = f.tell()
                            
                            # Check if job is finished
                            if not os.path.exists(job_file):
                                job_finished = True
                                # Give it one more chance to read any final content
                                time.sleep(0.2)
                                f.seek(last_position)
                                final_content = f.read()
                                if final_content:
                                    for line in final_content.split('\n'):
                                        if line.strip():
                                            output_lines.append(line.strip())
                                            self._parse_crawler_output(crawler_id, line.strip())
                    
                    except Exception as e:
                        self._log(crawler_id, f"[WARNING] Error reading log: {e}")
                    
                    if not job_finished:
                        time.sleep(0.2)  # Poll every 200ms for new content
                
                # Job finished
                process = None # No local process
                
            else:
                # Local execution (legacy or dev mode)
                process = subprocess.Popen(
                    [self.python_executable, crawler_path],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=False,  # Use binary mode to avoid encoding issues
                    env=env,
                    cwd=os.path.dirname(crawler_path)
                )
                
                # Store process reference for termination
                self.active_crawlers[crawler_id]["process"] = process
                
                self._log(crawler_id, " Crawler process started")
                self.active_crawlers[crawler_id]["progress"] = 30
                
                # Monitor progress with robust encoding handling and real-time updates
                
                log_all_output = os.getenv('CRAWLER_STREAM_ALL_LOGS', 'false').lower() == 'true'
                important_keywords = ["products", "found", "crawl", "complete", "error", "phase", "scroll", "save", "init", "config", "page", "progress"]

                # Read output in real-time with UTF-8 decoding
                while True:
                    # Check if crawler should be stopped
                    if self.active_crawlers[crawler_id]["status"] == "stopped":
                        break
                        
                    output_bytes = process.stdout.readline()
                    if output_bytes == b'' and process.poll() is not None:
                        break
                    if output_bytes:
                        try:
                            # Try UTF-8 first, fallback to latin-1 if needed
                            output_text = output_bytes.decode('utf-8', errors='replace').strip()
                        except UnicodeDecodeError:
                            output_text = output_bytes.decode('latin-1', errors='replace').strip()
                        
                        if output_text:
                            output_lines.append(output_text)
                            # Parse for progress and log immediately for real-time sync
                            self._parse_crawler_output(crawler_id, output_text)
                            # Log important lines (or all lines when enabled) in real-time
                            lowercase_line = output_text.lower()
                            should_log_line = log_all_output or any(keyword in lowercase_line for keyword in important_keywords)
                            if should_log_line:
                                self._log(crawler_id, output_text)
                
                # Wait for completion
                process.wait()
                
                # Capture any remaining stderr with proper encoding
                stderr_bytes = process.stderr.read()
                if stderr_bytes:
                    try:
                        stderr_text = stderr_bytes.decode('utf-8', errors='replace').strip()
                    except UnicodeDecodeError:
                        stderr_text = stderr_bytes.decode('latin-1', errors='replace').strip()
                    self._log(crawler_id, f"[STDERR] {stderr_text}")
                
                if stderr_text:
                    error_lines.append(stderr_text)
                    self._log(crawler_id, f"[WARNING] Errors: {stderr_text}")
            
            # Check results - look in the new output directory structure
            # New structure: crawler/output/[store]/[category]/[file].json
            # Support both timestamped (keells_beverages_20251103_001843.json) and non-timestamped files
            output_category_dir = os.path.join(self.output_dir, store, category)
            
            # Look for any file matching the pattern in the output directory
            final_output_file = None
            if os.path.exists(output_category_dir):
                # Get all JSON files in the directory that match the pattern
                import glob
                pattern = os.path.join(output_category_dir, f"{store}_{category}*.json")
                matching_files = glob.glob(pattern)
                if matching_files:
                    # Use the most recent file (highest timestamp)
                    final_output_file = max(matching_files, key=os.path.getmtime)
                    self._log(crawler_id, f"[FILE] Found output: {os.path.basename(final_output_file)}")
            
            # Fallback to legacy structures if not found
            if not final_output_file:
                new_output_file = os.path.join(self.output_dir, store, category, f"{store}_{category}.json")
                crawler_script_dir = os.path.join(self.crawler_dir, store)
                old_output_file = os.path.join(crawler_script_dir, "output", store, f"{store}_{category}.json")
                legacy_output_file = os.path.join(self.output_dir, store, f"{store}_{category}.json")
                
                for potential_file in [new_output_file, old_output_file, legacy_output_file]:
                    if os.path.exists(potential_file):
                        final_output_file = potential_file
                        break
            
            if final_output_file:
                try:
                    # Read the results first
                    with open(final_output_file, 'r', encoding='utf-8') as f:
                        results = json.load(f)
                    items_count = len(results)

                    # Handle Firebase Upload if enabled
                    firebase_url = None
                    cloud_path = None
                    
                    if self.firebase_manager:
                        self.active_crawlers[crawler_id]["status"] = "uploading"
                        self.active_crawlers[crawler_id]["progress"] = 95
                        self.active_crawlers[crawler_id]["current_step"] = "Uploading results to cloud..."
                        self._log(crawler_id, "☁️ Uploading results to Firebase Cloud Storage...")
                        
                        metadata = {
                            "crawler_id": crawler_id,
                            "store": store,
                            "category": category,
                            "items_count": items_count,
                            "completed_at": datetime.now().isoformat()
                        }
                        
                        upload_result = self.firebase_manager.upload_crawler_data(
                            final_output_file, store, category, metadata
                        )
                        
                        if upload_result.get("success"):
                            firebase_url = upload_result.get("public_url")
                            cloud_path = upload_result.get("cloud_path")
                            self._log(crawler_id, f"✅ Upload successful: {cloud_path}")
                            
                            # Delete local file after successful upload
                            try:
                                os.remove(final_output_file)
                                self._log(crawler_id, "️ Deleted local temporary file")
                                final_output_file = None # Indicate file is no longer local
                            except Exception as cleanup_error:
                                self._log(crawler_id, f"⚠️ Failed to remove local file: {cleanup_error}")
                        else:
                            self._log(crawler_id, f"⚠️ Upload failed: {upload_result.get('error')}")

                    self.active_crawlers[crawler_id]["status"] = "completed"
                    self.active_crawlers[crawler_id]["progress"] = 100
                    self.active_crawlers[crawler_id]["items_found"] = items_count
                    self.active_crawlers[crawler_id]["output_file"] = final_output_file # Will be None if deleted
                    self.active_crawlers[crawler_id]["firebase_url"] = firebase_url
                    
                    self._log(crawler_id, f"✅ Completed! Found {items_count} items")
                    
                    # Store results
                    # Create persistent result entry
                    self._create_result_entry(crawler_id, store, category, final_output_file, results, firebase_url, cloud_path)
                    
                    return self.crawler_results[crawler_id]

                except Exception as e:
                    # File exists but couldn't be read
                    self.active_crawlers[crawler_id]["status"] = "failed"
                    self.active_crawlers[crawler_id]["progress"] = 0
                    error_msg = f"Could not read output file: {str(e)}"
                    self._log(crawler_id, f"[ERROR] {error_msg}")
                    return {"error": error_msg}
            
            else:
                # Failed
                self.active_crawlers[crawler_id]["status"] = "failed"
                self.active_crawlers[crawler_id]["progress"] = 0
                
                if process is None:
                     error_msg = "Job finished but no output file found (Docker mode)"
                else:
                     error_msg = f"Process failed with code {process.returncode}"
                     
                self._log(crawler_id, f"[ERROR] {error_msg}")
                
                return {"error": error_msg, "stdout": output_lines, "stderr": error_lines}
        
        except Exception as e:
            self.active_crawlers[crawler_id]["status"] = "failed"
            self.active_crawlers[crawler_id]["progress"] = 0
            error_msg = f"Exception: {str(e)}"
            self._log(crawler_id, f" {error_msg}")
            return {"error": error_msg}
    
    def _parse_crawler_output(self, crawler_id: str, output_line: str):
        """Parse crawler output for progress updates with enhanced pattern matching based on actual crawler logs"""
        try:
            import re
            
            # Initialization patterns
            if "[INIT]" in output_line or "Initializing" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Initializing crawler"
                self.active_crawlers[crawler_id]["progress"] = 5
                
            # Crawl4AI progress indicators (both Keells and Cargills)
            elif "[FETCH]..." in output_line and "https://" in output_line:
                # Extract URL for better status
                url_match = re.search(r'https://[^\s]+', output_line)
                if url_match:
                    domain = url_match.group(0).split('/')[2]
                    self.active_crawlers[crawler_id]["current_step"] = f"Fetching from {domain}"
                else:
                    self.active_crawlers[crawler_id]["current_step"] = "Fetching page content"
                if self.active_crawlers[crawler_id]["progress"] < 10:
                    self.active_crawlers[crawler_id]["progress"] = 10
                    
            elif "[SCRAPE].." in output_line and "https://" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Scraping page data"
                if self.active_crawlers[crawler_id]["progress"] < 15:
                    self.active_crawlers[crawler_id]["progress"] = 15
                    
            elif "[COMPLETE]" in output_line and "[SUCCESS]" in output_line:
                # Extract timing information if available
                time_match = re.search(r'⏱: ([\d.]+)s', output_line)
                if time_match:
                    timing = time_match.group(1)
                    self.active_crawlers[crawler_id]["current_step"] = f"Request completed ({timing}s)"
                else:
                    self.active_crawlers[crawler_id]["current_step"] = "Request completed"
                if self.active_crawlers[crawler_id]["progress"] < 20:
                    self.active_crawlers[crawler_id]["progress"] = 20
            
            # Phase indicators (specific to Cargills crawler output)
            elif "Phase 1: Loading initial page..." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Phase 1: Loading initial page"
                self.active_crawlers[crawler_id]["progress"] = 25
                
            elif "Initial page loaded." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Initial page loaded successfully"
                self.active_crawlers[crawler_id]["progress"] = 30
                
            elif "Phase 2: Detecting and handling dynamic content loading..." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Phase 2: Detecting dynamic content"
                self.active_crawlers[crawler_id]["progress"] = 35
                
            elif "Initial extraction:" in output_line and "products from" in output_line:
                # Parse: "Initial extraction: 20 products from 20 elements"
                match = re.search(r'Initial extraction: (\d+) products from (\d+) elements', output_line)
                if match:
                    products_count = int(match.group(1))
                    elements_count = int(match.group(2))
                    self.active_crawlers[crawler_id]["current_step"] = f"Extracted {products_count} products from {elements_count} elements"
                    self.active_crawlers[crawler_id]["items_found"] = products_count
                    self.active_crawlers[crawler_id]["progress"] = 40
                    
            elif "Source: angular_scope" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Using Angular scope extraction"
                
            elif "Sample:" in output_line:
                # Parse product sample for better status
                match = re.search(r'Sample: (.+?)\.\.\.', output_line)
                if match:
                    sample_product = match.group(1)[:30]  # Truncate for display
                    self.active_crawlers[crawler_id]["current_step"] = f"Sample product: {sample_product}..."
                    
            elif "Clicked Load More button:" in output_line:
                match = re.search(r"Clicked Load More button: '(.+?)'", output_line)
                if match:
                    button_name = match.group(1)
                    self.active_crawlers[crawler_id]["current_step"] = f"Clicked '{button_name}' button"
                else:
                    self.active_crawlers[crawler_id]["current_step"] = "Clicked Load More button"
                    
            elif "waiting for Angular to load new products..." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Waiting for Angular to load new products"
                
            elif "Loading status:" in output_line:
                # Parse: "Loading status: {'isLoading': False, 'angularReady': True, 'loaderVisible': 'none'}"
                if "'isLoading': False" in output_line and "'angularReady': True" in output_line:
                    self.active_crawlers[crawler_id]["current_step"] = "Angular ready - content loaded"
                else:
                    self.active_crawlers[crawler_id]["current_step"] = "Checking Angular loading status"
                    
            elif "Scrolled down, waiting for Angular to load content..." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Scrolled down, waiting for content"
                
            elif "Found" in output_line and "products (previously:" in output_line:
                # Parse: "Found 20 products (previously: 20)"
                match = re.search(r'Found (\d+) products \(previously: (\d+)\)', output_line)
                if match:
                    current_count = int(match.group(1))
                    previous_count = int(match.group(2))
                    total_count = max(current_count, previous_count)
                    self.active_crawlers[crawler_id]["current_step"] = f"Found {current_count} products (total: {total_count})"
                    self.active_crawlers[crawler_id]["items_found"] = total_count
                    # Progressive loading - update progress based on items found
                    if total_count > 0:
                        progress = min(75, 40 + (total_count / 5))  # Up to 75% during collection
                        self.active_crawlers[crawler_id]["progress"] = max(progress, self.active_crawlers[crawler_id]["progress"])
                        
            elif "Angular scope:" in output_line and "Strategy:" in output_line:
                # Parse: "Angular scope: 20, DOM: 0, Strategy: 'angular_scope_direct'"
                match = re.search(r'Angular scope: (\d+), DOM: (\d+), Strategy: \'(.+?)\'', output_line)
                if match:
                    angular_count = int(match.group(1))
                    dom_count = int(match.group(2))
                    strategy = match.group(3)
                    self.active_crawlers[crawler_id]["current_step"] = f"Angular: {angular_count}, DOM: {dom_count} ({strategy})"
                    
            elif "Sample Angular product:" in output_line:
                # Parse: "Sample Angular product: Krest Chicken Mini Kieves - Rs 750.00"
                match = re.search(r'Sample Angular product: (.+)', output_line)
                if match:
                    sample_product = match.group(1)[:40]  # Truncate for display
                    self.active_crawlers[crawler_id]["current_step"] = f"Angular sample: {sample_product}..."
                    
            elif "Current page sample:" in output_line:
                # Parse: "Current page sample: Krest Chicken Mini Kieves - 240 g..."
                match = re.search(r'Current page sample: (.+)', output_line)
                if match:
                    sample_product = match.group(1)[:40]  # Truncate for display
                    self.active_crawlers[crawler_id]["current_step"] = f"Page sample: {sample_product}..."
                    
            elif "NEW PRODUCTS DETECTED!" in output_line:
                match = re.search(r'Found (\d+) new products', output_line)
                if match:
                    new_products = int(match.group(1))
                    self.active_crawlers[crawler_id]["current_step"] = f" {new_products} new products detected!"
                else:
                    self.active_crawlers[crawler_id]["current_step"] = " NEW PRODUCTS DETECTED!"
                    
            elif "New" in output_line and ":" in output_line and " - " in output_line:
                # Parse: "New 1: Krest Chicken Mini Kieves - 240 g... - 750.00"
                match = re.search(r'New (\d+): (.+?) - (.+)', output_line)
                if match:
                    new_index = match.group(1)
                    product_name = match.group(2)[:30]  # Truncate
                    price = match.group(3)
                    self.active_crawlers[crawler_id]["current_step"] = f"New #{new_index}: {product_name}... - {price}"
                    
            elif "Reached target of" in output_line and "items. Stopping collection." in output_line:
                # Parse: "Reached target of 100 items. Stopping collection."
                match = re.search(r'Reached target of (\d+) items', output_line)
                if match:
                    target_items = int(match.group(1))
                    # Prefer the effective max configured for this run, to avoid off-by-one discrepancies
                    effective_max = self.active_crawlers.get(crawler_id, {}).get("max_items")
                    self.active_crawlers[crawler_id]["items_found"] = int(effective_max or target_items)
                    self.active_crawlers[crawler_id]["current_step"] = f"✅ Reached target of {target_items} items"
                    # If we know the effective max, push progress closer to completion
                    self.active_crawlers[crawler_id]["progress"] = 80
                    
            elif "Phase 3: Processing all collected products with Groq..." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Phase 3: Processing with Groq AI"
                self.active_crawlers[crawler_id]["progress"] = 85
                
            elif "Processing" in output_line and "products with Groq..." in output_line:
                match = re.search(r'Processing (\d+) products with Groq', output_line)
                if match:
                    product_count = int(match.group(1))
                    self.active_crawlers[crawler_id]["current_step"] = f"Processing {product_count} products with Groq"
                    self.active_crawlers[crawler_id]["progress"] = 87
                    
            elif "Skipping Groq processing due to configuration issues" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Skipping Groq - using direct processing"
                self.active_crawlers[crawler_id]["progress"] = 89
                
            elif "Using direct processing instead..." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Using direct processing instead"
                self.active_crawlers[crawler_id]["progress"] = 90
                
            elif "Processed" in output_line and "products directly" in output_line:
                match = re.search(r'Processed (\d+) products directly', output_line)
                if match:
                    product_count = int(match.group(1))
                    self.active_crawlers[crawler_id]["current_step"] = f"✅ Processed {product_count} products directly"
                    self.active_crawlers[crawler_id]["progress"] = 92
                    
            elif "Phase 4: Saving final processed results..." in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Phase 4: Saving final results"
                self.active_crawlers[crawler_id]["progress"] = 95
                
            elif "CRAWL COMPLETE:" in output_line and "Found" in output_line:
                # Parse: "CRAWL COMPLETE: Found 100 unique products" or "CRAWL COMPLETE: Found and processed 50 unique products"
                match = re.search(r'CRAWL COMPLETE: Found (?:and processed )?(\d+) unique products', output_line)
                if match:
                    final_count = int(match.group(1))
                    self.active_crawlers[crawler_id]["items_found"] = final_count
                    self.active_crawlers[crawler_id]["current_step"] = f" COMPLETE: {final_count} unique products"
                    self.active_crawlers[crawler_id]["progress"] = 98
                    
            elif "[SAVE]" in output_line and "Product data saved to" in output_line:
                # Parse: "[SAVE]  Product data saved to ..." (Keells new format)
                match = re.search(r'Product data saved to (.+)', output_line)
                if match:
                    output_file = match.group(1).strip()
                    filename = os.path.basename(output_file)
                    self.active_crawlers[crawler_id]["current_step"] = f" Saved: {filename}"
                    self.active_crawlers[crawler_id]["output_file"] = output_file
                    self.active_crawlers[crawler_id]["progress"] = 100
                    
            elif "Product data saved to" in output_line:
                # Parse: "Product data saved to ..." (legacy format)
                match = re.search(r'Product data saved to (.+)', output_line)
                if match:
                    output_file = match.group(1).strip()
                    filename = os.path.basename(output_file)
                    self.active_crawlers[crawler_id]["current_step"] = f" Saved to {filename}"
                    self.active_crawlers[crawler_id]["output_file"] = output_file
                    self.active_crawlers[crawler_id]["progress"] = 100
                    
            elif "Final data saved to:" in output_line:
                # Parse: "Final data saved to: output/cargills\cargills_frozen_foods.json"
                match = re.search(r'Final data saved to: (.+)', output_line)
                if match:
                    output_file = match.group(1)
                    filename = os.path.basename(output_file)
                    self.active_crawlers[crawler_id]["current_step"] = f" Saved to {filename}"
                    self.active_crawlers[crawler_id]["output_file"] = output_file
                    self.active_crawlers[crawler_id]["progress"] = 100
                    
            elif "Preview of extracted products:" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Showing preview of extracted products"
            
            # Keells-specific patterns (new pagination format)
            elif "[PHASE 1]" in output_line:
                if "Initial page content loaded" in output_line:
                    self.active_crawlers[crawler_id]["current_step"] = "Phase 1: Page loaded"
                    self.active_crawlers[crawler_id]["progress"] = 25
                else:
                    self.active_crawlers[crawler_id]["current_step"] = "Phase 1: Preparing pagination"
                    self.active_crawlers[crawler_id]["progress"] = 20
                    
            elif "[ACTION] View All button action" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Clicked 'View All' button"
                self.active_crawlers[crawler_id]["progress"] = 30
                
            elif "[PHASE 2]" in output_line and "pagination" in output_line.lower():
                self.active_crawlers[crawler_id]["current_step"] = "Phase 2: Starting pagination"
                self.active_crawlers[crawler_id]["progress"] = 35
                
            elif "[PAGE" in output_line and "]" in output_line:
                # Parse: "[PAGE 1] Processing page 1..."
                match = re.search(r'\[PAGE (\d+)\]', output_line)
                if match:
                    page_num = int(match.group(1))
                    self.active_crawlers[crawler_id]["current_step"] = f"Extracting page {page_num}"
                    # Progressive pagination - pages typically have 20-50 items
                    progress = min(70, 40 + (page_num * 3))
                    self.active_crawlers[crawler_id]["progress"] = max(progress, self.active_crawlers[crawler_id]["progress"])
                    
            elif "[PRODUCTS]" in output_line and "Extracted" in output_line:
                # Parse: "[PRODUCTS] Extracted 10 products from page 1"
                match = re.search(r'Extracted (\d+) products from page (\d+)', output_line)
                if match:
                    products_on_page = int(match.group(1))
                    page_num = int(match.group(2))
                    self.active_crawlers[crawler_id]["current_step"] = f"Page {page_num}: Extracted {products_on_page} products"
                    
            elif "[PROGRESS] Total items found:" in output_line:
                # Parse: "[PROGRESS] Total items found: 50"
                match = re.search(r'Total items found: (\d+)', output_line)
                if match:
                    total_items = int(match.group(1))
                    self.active_crawlers[crawler_id]["items_found"] = total_items
                    self.active_crawlers[crawler_id]["current_step"] = f"Collected {total_items} products"
                    # Calculate progress based on items collected
                    max_items = self.active_crawlers[crawler_id].get("max_items", 100)
                    if max_items and max_items > 0:
                        progress = min(80, 40 + int((total_items / max_items) * 40))
                        self.active_crawlers[crawler_id]["progress"] = max(progress, self.active_crawlers[crawler_id]["progress"])
                    
            elif "[COMPLETE]" in output_line and "Reached target" in output_line:
                # Parse: "[COMPLETE] ✅ Reached target of 50 items. Stopping extraction."
                match = re.search(r'Reached target of (\d+) items', output_line)
                if match:
                    final_count = int(match.group(1))
                    self.active_crawlers[crawler_id]["items_found"] = final_count
                    self.active_crawlers[crawler_id]["current_step"] = f"✅ Completed: {final_count} items"
                    self.active_crawlers[crawler_id]["progress"] = 90
                    
            # Keells-specific patterns (for backward compatibility with old format)
            elif "Clicked the 'View All' button" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Clicked 'View All' button"
                self.active_crawlers[crawler_id]["progress"] = 30
                
            elif "Waiting for page to load after clicking View All" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Loading all products..."
                self.active_crawlers[crawler_id]["progress"] = 35
                
            elif "Page loaded. Extracting products from page" in output_line:
                # Parse: "Page loaded. Extracting products from page 1..."
                match = re.search(r'page (\d+)', output_line)
                if match:
                    page_num = int(match.group(1))
                    self.active_crawlers[crawler_id]["current_step"] = f"Extracting products from page {page_num}"
                    # Progressive pagination - pages typically have 20-50 items
                    progress = min(85, 40 + (page_num * 10))
                    self.active_crawlers[crawler_id]["progress"] = max(progress, self.active_crawlers[crawler_id]["progress"])
                else:
                    self.active_crawlers[crawler_id]["current_step"] = "Extracting products from page"
                    self.active_crawlers[crawler_id]["progress"] = 40
                    
            elif "Found" in output_line and "products on page" in output_line:
                # Parse: "Found 20 products on page 1."
                match = re.search(r'Found (\d+) products on page (\d+)', output_line)
                if match:
                    products_on_page = int(match.group(1))
                    page_num = int(match.group(2))
                    self.active_crawlers[crawler_id]["current_step"] = f"Page {page_num}: {products_on_page} products"
                    # Update items found (accumulative if tracking total)
                    if "items_found" not in self.active_crawlers[crawler_id] or self.active_crawlers[crawler_id]["items_found"] == 0:
                        self.active_crawlers[crawler_id]["items_found"] = products_on_page
                    else:
                        self.active_crawlers[crawler_id]["items_found"] += products_on_page
                    
            elif "Clicking the 'Next' button to go to the next page" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Navigating to next page..."
                
            elif "products scraped so far" in output_line:
                # Parse: "50 products scraped so far."
                match = re.search(r'(\d+) products scraped so far', output_line)
                if match:
                    total_scraped = int(match.group(1))
                    self.active_crawlers[crawler_id]["items_found"] = total_scraped
                    self.active_crawlers[crawler_id]["current_step"] = f"Scraped {total_scraped} products so far"
                    # Update progress based on items collected
                    progress = min(85, 40 + (total_scraped / 2))
                    self.active_crawlers[crawler_id]["progress"] = max(progress, self.active_crawlers[crawler_id]["progress"])
                    
            elif "Observation: Found" in output_line and "products on page" in output_line:
                # Parse: "Observation: Found 40 products on page. Previously had 20."
                match = re.search(r'Observation: Found (\d+) products on page\. Previously had (\d+)', output_line)
                if match:
                    current_count = int(match.group(1))
                    previous_count = int(match.group(2))
                    self.active_crawlers[crawler_id]["items_found"] = current_count
                    self.active_crawlers[crawler_id]["current_step"] = f"Found {current_count} products (was {previous_count})"
                    # Progressive loading - update progress based on items found
                    if current_count > 0:
                        progress = min(75, 35 + (current_count / 5))  # Up to 75% during scrolling
                        self.active_crawlers[crawler_id]["progress"] = max(progress, self.active_crawlers[crawler_id]["progress"])
                        
            elif "Decision: New products found! Continuing to scroll" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "New products found - continuing scroll"
                
            elif "Decision: Reached target of" in output_line and "items. Ending scroll phase" in output_line:
                # Parse: "Decision: Reached target of 100 items. Ending scroll phase."
                match = re.search(r'Decision: Reached target of (\d+) items', output_line)
                if match:
                    target_items = int(match.group(1))
                    self.active_crawlers[crawler_id]["items_found"] = target_items
                    self.active_crawlers[crawler_id]["current_step"] = f"Reached target of {target_items} items"
                    self.active_crawlers[crawler_id]["progress"] = 78
                    
            elif "No new products found. Stability count:" in output_line:
                # Parse: "No new products found. Stability count: 2/3"
                match = re.search(r'Stability count: (\d+)/(\d+)', output_line)
                if match:
                    current_stability = int(match.group(1))
                    max_stability = int(match.group(2))
                    self.active_crawlers[crawler_id]["current_step"] = f"Checking stability {current_stability}/{max_stability}"
            
            # AI Processing patterns (both crawlers)
            elif "[EXTRACT]" in output_line and "Completed for" in output_line:
                # Parse: "[EXTRACT]. ■ Completed for https://... | Time: 13.881864500002848s"
                match = re.search(r'Time: ([\d.]+)s', output_line)
                if match:
                    extraction_time = float(match.group(1))
                    self.active_crawlers[crawler_id]["current_step"] = f"Extraction completed ({extraction_time:.1f}s)"
                    self.active_crawlers[crawler_id]["progress"] = 93
                else:
                    self.active_crawlers[crawler_id]["current_step"] = "AI extraction completed"
                    self.active_crawlers[crawler_id]["progress"] = 93
                    
            # Error handling patterns
            elif "Error" in output_line and "extraction" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "⚠️ Error during extraction"
                
            elif "Timeout" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "⚠️ Timeout occurred"
                
            elif "Retrying" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = " Retrying operation"
                
            # General completion indicators
            elif "============================================================" in output_line:
                # This often indicates completion section
                pass  # Don't update status for separator lines
                
            elif "Preview of extracted products:" in output_line:
                self.active_crawlers[crawler_id]["current_step"] = "Showing preview of results"
                
            # Price and product name indicators for preview
            elif "Price:" in output_line and "Image:" in output_line:
                # This indicates product preview lines, keep current status
                pass
                
        except Exception as e:
            # If parsing fails, log the error but don't crash
            logger.debug(f"Error parsing crawler output: {e}", extra={"error": str(e), "output_line": output_line})
            pass
                    
        except Exception as e:
            # Don't let parsing errors break the crawler
            pass
    
    def _log(self, crawler_id: str, message: str):
        """Add a log entry for a crawler with encoding safety"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        # Ensure message is safe for logging (remove problematic unicode)
        try:
            safe_message = str(message).encode('ascii', errors='replace').decode('ascii')
        except Exception:
            safe_message = repr(message)  # Fallback to repr if all else fails
        
        # Check if message is already a formatted log line from subprocess
        # Pattern: [YYYY-MM-DD HH:MM:SS] LEVEL [logger_name] message | extra_data
        import re
        log_pattern = r'^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]\s+\w+\s+\[[\w._]+\]\s+'
        
        if re.match(log_pattern, safe_message):
            # This is already a formatted log from the subprocess - don't re-log it
            # Just store it in crawler logs for UI display
            log_entry = f"[{timestamp}] {safe_message}"
            if crawler_id not in self.crawler_logs:
                self.crawler_logs[crawler_id] = []
            self.crawler_logs[crawler_id].append(log_entry)
            
            # Keep only last 50 log entries
            if len(self.crawler_logs[crawler_id]) > 50:
                self.crawler_logs[crawler_id] = self.crawler_logs[crawler_id][-50:]
            # Skip re-logging to avoid duplicate log entries
            return
        
        # Normal logging for non-formatted messages
        log_entry = f"[{timestamp}] {safe_message}"
        
        if crawler_id not in self.crawler_logs:
            self.crawler_logs[crawler_id] = []
        
        self.crawler_logs[crawler_id].append(log_entry)
        
        # Keep only last 50 log entries
        if len(self.crawler_logs[crawler_id]) > 50:
            self.crawler_logs[crawler_id] = self.crawler_logs[crawler_id][-50:]

        try:
            logger.info(
                safe_message,
                extra={"crawler_id": crawler_id, "crawler_log_timestamp": timestamp}
            )
        except Exception:
            # Avoid breaking the crawler flow if logging fails
            pass
    
    def get_crawler_results(self, crawler_id: str) -> Optional[Dict[str, Any]]:
        """Get results for a completed crawler"""
        return self.crawler_results.get(crawler_id)
    
    def get_all_results(self) -> Dict[str, Any]:
        """Get all completed crawler results, including those synced from files, excluding cleared activities"""
        # Ensure results are synced on first access
        self._ensure_results_synced()
        
        # Filter out cleared activities
        if not hasattr(self, 'cleared_activities'):
            self.cleared_activities = set()
        
        filtered_results = {}
        for result_id, result_data in self.crawler_results.items():
            activity_id = self._generate_activity_id(result_data)
            if activity_id not in self.cleared_activities:
                filtered_results[result_id] = result_data
        
        return filtered_results
    
    def list_output_files(self) -> Dict[str, List[str]]:
        """List all available output files by store"""
        output_files = {"keells": [], "cargills": []}
        
        for store in ["keells", "cargills"]:
            # Check both locations: crawler/store/output/store/ and crawler/output/store/
            crawler_output_dir = os.path.join(self.crawler_dir, store, "output", store)
            main_output_dir = os.path.join(self.output_dir, store)
            
            for directory in [crawler_output_dir, main_output_dir]:
                if os.path.exists(directory):
                    # Check direct files in store directory
                    for file in os.listdir(directory):
                        if file.endswith('.json') and file not in output_files[store]:
                            output_files[store].append(file)
                    
                    # Also check subdirectories (categories)
                    for category in os.listdir(directory):
                        category_path = os.path.join(directory, category)
                        if os.path.isdir(category_path):
                            for file in os.listdir(category_path):
                                if file.endswith('.json') and file not in output_files[store]:
                                    output_files[store].append(file)
        
        return output_files
    
    def load_output_file(self, store: str, filename: str) -> Optional[Dict[str, Any]]:
        """Load a specific output file from any of the possible locations"""
        # Try both possible locations
        crawler_output_path = os.path.join(self.crawler_dir, store, "output", store, filename)
        main_output_path = os.path.join(self.output_dir, store, filename)
        
        file_path = None
        if os.path.exists(crawler_output_path):
            file_path = crawler_output_path
        elif os.path.exists(main_output_path):
            file_path = main_output_path
        else:
            # Also check subdirectories (categories)
            main_output_dir = os.path.join(self.output_dir, store)
            if os.path.exists(main_output_dir):
                for category in os.listdir(main_output_dir):
                    category_path = os.path.join(main_output_dir, category)
                    if os.path.isdir(category_path):
                        potential_file = os.path.join(category_path, filename)
                        if os.path.exists(potential_file):
                            file_path = potential_file
                            break
        
        if not file_path:
            return {"error": f"File {filename} not found for store {store}"}
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return {
                "filename": filename,
                "store": store,
                "items": data,
                "count": len(data) if isinstance(data, list) else 0,
                "file_path": file_path,
                "loaded_at": datetime.now().isoformat()
            }
        except Exception as e:
            return {"error": f"Failed to load file: {str(e)}"}
    
    def delete_output_file(self, store: str, filename: str) -> Dict[str, Any]:
        """Delete a specific output file from all possible locations"""
        # Try both possible locations
        crawler_output_path = os.path.join(self.crawler_dir, store, "output", store, filename)
        main_output_path = os.path.join(self.output_dir, store, filename)
        
        deleted_files = []
        errors = []
        
        # Try to delete from both locations
        for file_path in [crawler_output_path, main_output_path]:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    deleted_files.append(file_path)
                except Exception as e:
                    errors.append(f"Failed to delete {file_path}: {str(e)}")
        
        if not deleted_files and not errors:
            return {"error": f"File {filename} not found for store {store}"}
        
        if errors and not deleted_files:
            return {"error": "; ".join(errors)}
        
        return {
            "success": True,
            "deleted_files": deleted_files,
            "filename": filename,
            "store": store,
            "deleted_at": datetime.now().isoformat(),
            "warnings": errors if errors else None
        }
    
    def aggregate_results(self, crawler_ids: List[str]) -> Dict[str, Any]:
        """Aggregate results from multiple crawlers"""
        all_items = []
        summary = {
            "total_items": 0,
            "stores": set(),
            "categories": set(),
            "crawler_count": len(crawler_ids),
            "successful_crawlers": 0,
            "failed_crawlers": 0
        }
        
        for crawler_id in crawler_ids:
            if crawler_id in self.crawler_results:
                result = self.crawler_results[crawler_id]
                if "items" in result:
                    all_items.extend(result["items"])
                    summary["successful_crawlers"] += 1
                    
                    # Add metadata
                    if crawler_id in self.active_crawlers:
                        crawler_info = self.active_crawlers[crawler_id]
                        summary["stores"].add(crawler_info["store"])
                        summary["categories"].add(crawler_info["category"])
                else:
                    summary["failed_crawlers"] += 1
        
        summary["total_items"] = len(all_items)
        summary["stores"] = list(summary["stores"])
        summary["categories"] = list(summary["categories"])
        
        return {
            "summary": summary,
            "items": all_items,
            "aggregated_at": datetime.now().isoformat()
        }
    
    def cleanup_completed_crawlers(self, max_age_hours: int = 24) -> int:
        """Clean up old completed crawler data"""
        cutoff_time = time.time() - (max_age_hours * 3600)
        cleaned_count = 0
        
        for crawler_id in list(self.active_crawlers.keys()):
            start_time = datetime.fromisoformat(self.active_crawlers[crawler_id]["start_time"])
            if start_time.timestamp() < cutoff_time:
                # Remove old data
                del self.active_crawlers[crawler_id]
                if crawler_id in self.crawler_results:
                    del self.crawler_results[crawler_id]
                if crawler_id in self.crawler_logs:
                    del self.crawler_logs[crawler_id]
                if crawler_id in self.progress_queues:
                    del self.progress_queues[crawler_id]
                cleaned_count += 1
        
        return cleaned_count

    def _wait_for_crawler_completion(self, crawler_id: str, timeout: int = 300):
        """
        Wait for a crawler to complete execution
        Args:
            crawler_id: The ID of the crawler to wait for
            timeout: Maximum time to wait in seconds (default 5 minutes)
        """
        start_time = time.time()
        check_interval = 2  # Check every 2 seconds
        
        while time.time() - start_time < timeout:
            if crawler_id not in self.active_crawlers:
                # Crawler is no longer active, it has completed
                break
                
            crawler_info = self.active_crawlers.get(crawler_id)
            if crawler_info:
                status = crawler_info.get('status', 'unknown')
                if status in ['completed', 'failed', 'stopped', 'error']:
                    # Crawler has finished (success or failure)
                    break
            
            time.sleep(check_interval)
        
        # If we've reached here due to timeout, log a warning
        if time.time() - start_time >= timeout:
            logger.warning(f"Timeout waiting for crawler {crawler_id} to complete", extra={"crawler_id": crawler_id, "timeout": timeout})
            
        # Small additional delay to ensure cleanup
        time.sleep(1)

    def wait_for_crawlers(
        self,
        crawler_ids: List[str],
        *,
        timeout_per: int = 300,
        progress_callback: Optional[Callable[[str, str], None]] = None,
    ) -> List[Dict[str, Any]]:
        """Wait for multiple crawlers to finish and optionally emit progress events."""

        results: List[Dict[str, Any]] = []
        for crawler_id in crawler_ids:
            self._wait_for_crawler_completion(crawler_id, timeout=timeout_per)
            status = self.active_crawlers.get(crawler_id, {}).get("status", "unknown")
            result_entry = {"crawler_id": crawler_id, "status": status}
            results.append(result_entry)
            if progress_callback:
                try:
                    progress_callback(crawler_id, status)
                except Exception as exc:  # noqa: BLE001
                    logger.warning(f"Progress callback error: {exc}", extra={"crawler_id": crawler_id, "error": str(exc)})
        return results

    def clear_all_results(self) -> int:
        """Clear all crawler results and return count of cleared items"""
        try:
            cleared_count = len(self.crawler_results)
            # Add all current result IDs to cleared set before removing them
            for result_id in self.crawler_results.keys():
                self.cleared_results.add(result_id)
            
            self.crawler_results = {}
            self._save_persistent_results()
            self._save_cleared_results()
            logger.info(f"Cleared all {cleared_count} crawler results", extra={"cleared_count": cleared_count})
            return cleared_count
        except Exception as e:
            logger.warning(f"Error clearing all results: {e}", extra={"error": str(e)})
            return 0
    
    def clear_results(self, result_ids: List[str]) -> int:
        """Clear specific crawler results by IDs and return count of cleared items"""
        try:
            cleared_count = 0
            for result_id in result_ids:
                if result_id in self.crawler_results:
                    del self.crawler_results[result_id]
                    self.cleared_results.add(result_id)
                    cleared_count += 1
                    logger.debug(f"Cleared result: {result_id}", extra={"result_id": result_id})
                elif result_id not in self.cleared_results:
                    # Even if not in current results, mark as cleared to prevent future regeneration
                    self.cleared_results.add(result_id)
                    cleared_count += 1
                    logger.debug(f"Marked as cleared: {result_id}", extra={"result_id": result_id})
            
            if cleared_count > 0:
                self._save_persistent_results()
                self._save_cleared_results()
                logger.info(f"Cleared {cleared_count} specific results", extra={"cleared_count": cleared_count})
            
            return cleared_count
        except Exception as e:
            logger.warning(f"Error clearing specific results: {e}", extra={"error": str(e)})
            return 0
    
    def delete_result(self, result_id: str) -> bool:
        """Delete a specific crawler result and return success status"""
        try:
            if result_id in self.crawler_results:
                result = self.crawler_results[result_id]
                # Store file path for future reference
                if 'output_file' in result:
                    self.cleared_results.add(f"file:{result['output_file']}")
                del self.crawler_results[result_id]
                self.cleared_results.add(result_id)
                self._save_persistent_results()
                self._save_cleared_results()
                logger.info(f"Deleted result: {result_id}", extra={"result_id": result_id})
                return True
            elif result_id not in self.cleared_results:
                # Mark as cleared even if not currently in results
                self.cleared_results.add(result_id)
                self._save_cleared_results()
                logger.info(f"Marked as cleared: {result_id}", extra={"result_id": result_id})
                return True
            else:
                logger.warning(f"Result already cleared: {result_id}", extra={"result_id": result_id})
                return True
        except Exception as e:
            logger.warning(f"Error deleting result {result_id}: {e}", extra={"result_id": result_id, "error": str(e)})
            return False

    def _load_cleared_results(self):
        """Load cleared results from SQLite cache"""
        try:
            self.cleared_results = self.cache_store.load_cleared_results()
            logger.debug(
                f"Loaded {len(self.cleared_results)} cleared results from cache",
                extra={"cleared_count": len(self.cleared_results)},
            )
        except Exception as e:
            logger.warning(f"Error loading cleared results: {e}", extra={"error": str(e)})
            self.cleared_results = set()
    
    def _save_cleared_results(self):
        """Save cleared results to SQLite cache"""
        try:
            self.cache_store.replace_cleared_results(self.cleared_results)
            logger.debug(
                f"Saved {len(self.cleared_results)} cleared results to persistent cache",
                extra={"cleared_count": len(self.cleared_results)},
            )
        except Exception as e:
            logger.warning(f"Error saving cleared results: {e}", extra={"error": str(e)})
    
    def clear_all_activities(self) -> int:
        """Clear all crawler activities and return count of cleared items"""
        try:
            # For activities, we maintain a cleared activities list similar to results
            if not hasattr(self, 'cleared_activities'):
                self.cleared_activities = set()
            
            # Get all current results (which include activities)
            all_results = self.get_all_results()
            cleared_count = 0
            
            # Mark all current results as cleared activities
            for result_id, result_data in all_results.items():
                activity_id = self._generate_activity_id(result_data)
                self.cleared_activities.add(activity_id)
                cleared_count += 1
            
            # Save cleared activities to file
            self._save_cleared_activities()
            logger.info(f"Cleared all {cleared_count} crawler activities", extra={"cleared_count": cleared_count})
            return cleared_count
        except Exception as e:
            logger.warning(f"Error clearing all activities: {e}", extra={"error": str(e)})
            return 0
    
    def clear_specific_activities(self, activity_ids: List[str]) -> int:
        """Clear specific crawler activities by IDs and return count of cleared items"""
        try:
            if not hasattr(self, 'cleared_activities'):
                self.cleared_activities = set()
            
            cleared_count = 0
            for activity_id in activity_ids:
                self.cleared_activities.add(activity_id)
                cleared_count += 1
                logger.debug(f"Cleared activity: {activity_id}", extra={"activity_id": activity_id})
            
            self._save_cleared_activities()
            logger.info(f"Cleared {cleared_count} specific activities", extra={"cleared_count": cleared_count})
            return cleared_count
        except Exception as e:
            logger.warning(f"Error clearing specific activities: {e}", extra={"error": str(e)})
            return 0
    
    def _generate_activity_id(self, activity: Dict[str, Any]) -> str:
        """Generate a unique ID for an activity"""
        store = activity.get('store', '')
        category = activity.get('category', '')
        crawler_id = activity.get('crawler_id', '')
        timestamp = activity.get('timestamp', activity.get('completed_at', ''))
        return f"{store}_{category}_{crawler_id}_{timestamp}"
    
    def _save_cleared_activities(self):
        """Save cleared activities to SQLite cache"""
        try:
            if not hasattr(self, 'cleared_activities'):
                self.cleared_activities = set()
            self.cache_store.replace_cleared_activities(self.cleared_activities)
        except Exception as e:
            logger.warning(f"Error saving cleared activities: {e}", extra={"error": str(e)})
    
    def _load_cleared_activities(self):
        """Load cleared activities from SQLite cache"""
        try:
            self.cleared_activities = self.cache_store.load_cleared_activities()
            logger.debug(
                f"Loaded {len(self.cleared_activities)} cleared activities from cache",
                extra={"cleared_count": len(self.cleared_activities)},
            )
        except Exception as e:
            logger.warning(f"Error loading cleared activities: {e}", extra={"error": str(e)})
            self.cleared_activities = set()

# Global instance for use across the application
crawler_manager = CrawlerManager()

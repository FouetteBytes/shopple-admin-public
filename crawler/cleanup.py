#!/usr/bin/env python3
"""
Cleanup Script - Remove all test files from local and cloud storage
"""

import os
import sys
import shutil
from pathlib import Path

from backend.services.logger_service import get_logger, log_error

logger = get_logger(__name__)

try:
    from clean_file_manager import CleanFileStorageManager
    from firebase_storage_manager import FirebaseStorageManager
except ImportError as e:
    log_error(logger, e, {"context": "Error importing modules"})
    sys.exit(1)

def cleanup_local_files():
    """Remove all local output files"""
    logger.info("Cleaning up local files")
    
    # Get the crawler directory
    crawler_dir = Path(__file__).parent
    output_dir = crawler_dir / "output"
    cache_dir = crawler_dir / "cache"
    
    removed_count = 0
    
    # Clean output directory
    if output_dir.exists():
        for item in output_dir.iterdir():
            if item.is_file():
                logger.debug("Removing local file", extra={"file_name": item.name})
                item.unlink()
                removed_count += 1
            elif item.is_dir():
                logger.debug("Removing local directory", extra={"dir_name": item.name})
                shutil.rmtree(item)
                removed_count += 1
    
    # Clean cache directory but keep metadata structure
    if cache_dir.exists():
        for item in cache_dir.iterdir():
            if item.is_file() and item.name.endswith('.json'):
                # Reset cache files instead of deleting
                if 'cache' in item.name or 'metadata' in item.name:
                    logger.debug("Resetting cache file", extra={"file_name": item.name})
                    with open(item, 'w') as f:
                        if 'metadata' in item.name:
                            f.write('{}')
                        else:
                            f.write('{"files": []}')
    
    logger.info("Removed local items", extra={"removed_count": removed_count})
    return removed_count

def cleanup_cloud_files():
    """Remove all cloud files from Firebase Storage"""
    logger.info("Cleaning up cloud files")
    
    try:
        storage_manager = FirebaseStorageManager()
        
        # List all files in Firebase Storage
        all_files = storage_manager.list_all_files()
        
        if not all_files:
            logger.info("No cloud files found")
            return 0
        
        removed_count = 0
        for file_info in all_files:
            file_path = file_info.get('name', '')
            if file_path:
                logger.debug("Removing cloud file", extra={"file_path": file_path})
                success = storage_manager.delete_file(file_path)
                if success:
                    removed_count += 1
                else:
                    logger.warning("Failed to remove cloud file", extra={"file_path": file_path})
        
        logger.info("Removed cloud files", extra={"removed_count": removed_count})
        return removed_count
        
    except Exception as e:
        log_error(logger, e, {"context": "Error cleaning cloud files"})
        return 0

def cleanup_file_manager_cache():
    """Clean the file manager's internal cache"""
    logger.info("Cleaning file manager cache")
    
    try:
        manager = CleanFileStorageManager()
        
        # Reset internal tracking
        manager._reset_upload_tracking()
        
        logger.info("File manager cache cleaned")
        
    except Exception as e:
        log_error(logger, e, {"context": "Error cleaning file manager cache"})

def main():
    """Main cleanup function"""
    logger.info("COMPLETE CLEANUP - Removing all test files")
    
    total_removed = 0
    
    # 1. Clean local files
    local_count = cleanup_local_files()
    total_removed += local_count
    
    # 2. Clean cloud files
    cloud_count = cleanup_cloud_files()
    total_removed += cloud_count
    
    # 3. Clean file manager cache
    cleanup_file_manager_cache()
    
    logger.info("CLEANUP COMPLETE", extra={
        "total_removed": total_removed,
        "local_files": local_count,
        "cloud_files": cloud_count,
        "status": "System is now clean and ready for fresh testing"
    })

if __name__ == "__main__":
    main()

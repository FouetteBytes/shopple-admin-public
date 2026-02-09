#!/usr/bin/env python3
"""
File Watcher for Crawler Output
Automatically detects new files and triggers upload to Firebase
"""

import os
import sys
import json
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from typing import Dict, Any
import threading
from pathlib import Path

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Add the current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from clean_file_manager import CleanFileStorageManager

class CrawlerFileHandler(FileSystemEventHandler):
    """Handler for crawler output files"""
    
    def __init__(self, manager: CleanFileStorageManager):
        self.manager = manager
        self.processing_files = set()
        self.lock = threading.Lock()
        self.last_processed: Dict[str, float] = {}
        self.dedup_window_seconds = 1.0  # Ignore duplicate events fired back-to-back
        
    def on_created(self, event):
        """Handle file creation events"""
        if event.is_directory:
            return
            
        file_path = event.src_path
        
        # Only process JSON files
        if not file_path.endswith('.json'):
            return
            
        # Avoid processing the same file multiple times when created/modified fire together
        with self.lock:
            now = time.time()
            last_run = self.last_processed.get(file_path, 0)
            if (
                file_path in self.processing_files
                or (now - last_run) < self.dedup_window_seconds
            ):
                return
            self.processing_files.add(file_path)
            self.last_processed[file_path] = now
        
        # Wait a bit for file to be completely written
        time.sleep(0.5)
        
        try:
            self._process_new_file(file_path)
        finally:
            with self.lock:
                self.processing_files.discard(file_path)
    
    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            return
            
        # For safety, also process modified files
        self.on_created(event)
    
    def _process_new_file(self, file_path: str):
        """Process a newly created file"""
        try:
            # Extract store and category from path
            abs_path = os.path.abspath(file_path)
            if not os.path.exists(abs_path):
                logger.info(f"[INFO] Skipping watcher event for missing file: {file_path}")
                return
            rel_path = os.path.relpath(abs_path, self.manager.output_path)
            path_parts = rel_path.split(os.sep)
            
            if len(path_parts) >= 3:
                store = path_parts[0]
                category = path_parts[1]
                filename = path_parts[2]
                
                logger.info(f"[NEW FILE] New file detected: {filename} in {store}/{category}")
                
                # Set status to uploading
                self.manager._set_upload_status(store, category, filename, 'uploading')
                
                # Trigger auto-upload
                result = self.manager.auto_upload_new_files(store, category)
                
                if result.get('success'):
                    uploaded_count = result.get('count', 0)
                    if uploaded_count > 0:
                        logger.info(f"[SUCCESS] Auto-uploaded {uploaded_count} files")
                        self.manager._set_upload_status(store, category, filename, 'both')
                    else:
                        logger.info(f"[INFO] Auto-upload skipped: {result.get('message', 'No new files detected')}")
                        # If file is gone locally, mark as cloud_only to prevent retries
                        if not os.path.exists(abs_path):
                            self.manager._set_upload_status(store, category, filename, 'cloud_only')
                    return
                else:
                    logger.error(f"[ERROR] Auto-upload failed: {result.get('error', 'Unknown error')}")
                    self.manager._set_upload_status(store, category, filename, 'failed')
                    
            else:
                logger.warning(f"[WARNING] Skipping file with unexpected path structure: {file_path}")
                
        except Exception as e:
            logger.error(f"[ERROR] Error processing file {file_path}: {e}")

class FileWatcher:
    """File watcher service for crawler output"""
    
    def __init__(self, watch_path: str = None):
        self.manager = CleanFileStorageManager()
        self.watch_path = watch_path or self.manager.output_path
        self.observer = None
        self.event_handler = CrawlerFileHandler(self.manager)
        
    def start(self):
        """Start the file watcher"""
        try:
            # Ensure watch directory exists
            os.makedirs(self.watch_path, exist_ok=True)
            
            logger.info("Starting file watcher", extra={"watch_path": self.watch_path, "auto_upload": self.manager.config.get('auto_upload', True)})
            
            # Set up observer
            self.observer = Observer()
            self.observer.schedule(
                self.event_handler,
                self.watch_path,
                recursive=True
            )
            
            self.observer.start()
            logger.info("[SUCCESS] File watcher started successfully")
            
            return True
            
        except Exception as e:
            logger.error(f"[ERROR] Failed to start file watcher: {e}")
            return False
    
    def stop(self):
        """Stop the file watcher"""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            logger.info("🛑 File watcher stopped")
    
    def run(self):
        """Run the file watcher (blocking)"""
        if not self.start():
            return False
            
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("File watcher interrupted by user")
        finally:
            self.stop()
            
        return True

def main():
    """Main function for command line usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Crawler File Watcher')
    parser.add_argument('--path', help='Path to watch for files')
    parser.add_argument('--daemon', action='store_true', help='Run as daemon')
    
    args = parser.parse_args()
    
    # Create and run file watcher
    watcher = FileWatcher(args.path)
    
    if args.daemon:
        logger.info("[INFO] Running file watcher as daemon...")
        # Production deployments should use a dedicated daemon supervisor.
        watcher.run()
    else:
        logger.info("[INFO] Running file watcher...")
        success = watcher.run()
        sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()

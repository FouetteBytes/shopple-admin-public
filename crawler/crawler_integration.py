#!/usr/bin/env python3
"""
Crawler Integration with Auto Upload
This script demonstrates how to integrate the file watcher with crawlers
"""

import os
import sys
import json
import time
import threading
from datetime import datetime
from typing import Dict, Any

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Add the current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from clean_file_manager import CleanFileStorageManager

class CrawlerIntegration:
    """Integration class for crawler with auto-upload"""
    
    def __init__(self):
        self.manager = CleanFileStorageManager()
        self.processing_queue = []
        self.processing_lock = threading.Lock()
        self.auto_upload_enabled = True
        
    def create_test_file(self, store: str, category: str, filename: str = None) -> Dict[str, Any]:
        """Create a test file to simulate crawler output"""
        try:
            if not filename:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"test_{timestamp}.json"
            
            # Create test data
            test_data = {
                "store": store,
                "category": category,
                "timestamp": datetime.now().isoformat(),
                "products": [
                    {
                        "name": f"Test Product {i}",
                        "price": f"${i * 10}.99",
                        "description": f"Test description for product {i}"
                    }
                    for i in range(1, 6)
                ],
                "total_products": 5,
                "crawl_status": "success"
            }
            
            # Ensure directory exists
            output_dir = os.path.join(self.manager.output_path, store, category)
            os.makedirs(output_dir, exist_ok=True)
            
            # Write file
            file_path = os.path.join(output_dir, filename)
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(test_data, f, indent=2)
            
            logger.info(f" Created test file: {file_path}")
            
            # Trigger auto-upload if enabled
            if self.auto_upload_enabled:
                self.trigger_auto_upload(store, category, filename)
            
            return {
                "success": True,
                "file_path": file_path,
                "filename": filename,
                "store": store,
                "category": category
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def trigger_auto_upload(self, store: str, category: str, filename: str):
        """Trigger auto-upload for a specific file"""
        try:
            # Set uploading status immediately
            self.manager._set_upload_status(store, category, filename, 'uploading')
            
            # Use a separate thread to avoid blocking
            upload_thread = threading.Thread(
                target=self._upload_file_async,
                args=(store, category, filename)
            )
            upload_thread.start()
            
        except Exception as e:
            logger.error(f"Error triggering auto-upload: {e}")
    
    def _upload_file_async(self, store: str, category: str, filename: str):
        """Async file upload handler"""
        try:
            # Add some delay to simulate processing
            time.sleep(1)
            
            # Trigger upload
            result = self.manager.auto_upload_new_files(store, category)
            
            if result.get('success') and result.get('count', 0) > 0:
                logger.info(f"✅ Auto-uploaded {result['count']} files from {store}/{category}")
            else:
                logger.error(f"❌ Auto-upload failed: {result.get('error', 'Unknown error')}")
                self.manager._set_upload_status(store, category, filename, 'failed')
                
        except Exception as e:
            logger.error(f"Error in async upload: {e}")
            self.manager._set_upload_status(store, category, filename, 'failed')
    
    def simulate_crawler_workflow(self, store: str, category: str, num_files: int = 3):
        """Simulate a complete crawler workflow"""
        logger.info(f"Starting crawler simulation for {store}/{category}", extra={"store": store, "category": category, "num_files": num_files})
        
        results = []
        
        for i in range(num_files):
            # Create file with delay to simulate crawling
            result = self.create_test_file(store, category)
            results.append(result)
            
            if result.get('success'):
                logger.info(f"File {i+1}/{num_files} created: {result['filename']}", extra={"index": i+1, "total": num_files, "filename": result['filename']})
            else:
                logger.error(f"File {i+1}/{num_files} failed: {result.get('error')}", extra={"index": i+1, "total": num_files, "error": result.get('error')})
            
            # Add delay between files
            time.sleep(2)
        
        logger.info(f"Crawler simulation completed for {store}/{category}", extra={"store": store, "category": category, "results_count": len(results)})
        return results
    
    def monitor_upload_status(self, store: str, category: str, filename: str, timeout: int = 30):
        """Monitor upload status for a file"""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.manager.get_file_upload_status(store, category, filename)
            
            logger.info(f" Status for {filename}: {status.get('status', 'unknown')}")
            
            if status.get('status') in ['both', 'cloud_only', 'failed']:
                return status
            
            time.sleep(2)
        
        logger.warning(f"⏰ Timeout monitoring {filename}")
        return None

def main():
    """Main function to demonstrate the integration"""
    logger.info(" Crawler Integration Demo")
    logger.info("=" * 50)
    
    integration = CrawlerIntegration()
    
    # Test different scenarios
    scenarios = [
        ("keells", "fruits"),
        ("keells", "vegetables"),
        ("cargills", "fruits"),
        ("cargills", "vegetables")
    ]
    
    # Run scenario simulation
    for store, category in scenarios:
        logger.info(f"Testing {store} -> {category}", extra={"store": store, "category": category})
        
        # Create a single test file
        result = integration.create_test_file(store, category)
        
        if result.get('success'):
            filename = result['filename']
            
            # Monitor upload status
            logger.info(f"Monitoring upload status for {filename}", extra={"filename": filename})
            final_status = integration.monitor_upload_status(store, category, filename)
            
            if final_status:
                logger.info(f"Final status: {final_status.get('status')}", extra={"status": final_status.get('status')})
            else:
                logger.error("Upload monitoring failed")
        
        # Add delay between scenarios
        time.sleep(3)
    
    logger.info("Integration test completed - Check the dashboard to see real-time status updates")

if __name__ == "__main__":
    main()

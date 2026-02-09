#!/usr/bin/env python3
"""
Enhanced File Management for Firebase Storage
Supports cloud-only storage and local download options
"""
import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional, Any

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from enhanced_crawler_manager import get_enhanced_crawler_manager
    from firebase_storage_manager import FirebaseStorageManager
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logger.warning("Firebase not available for enhanced file manager")

class FileStorageManager:
    """
    Enhanced file storage manager with flexible storage options
    """
    
    def __init__(self):
        self.manager = None
        self.storage_manager = None
        
        if FIREBASE_AVAILABLE:
            try:
                self.manager = get_enhanced_crawler_manager(use_firebase=True)
                self.storage_manager = self.manager.storage_manager if self.manager else None
            except Exception as e:
                print(f"Warning: Firebase not available: {e}")
    
    def list_all_files(self) -> Dict[str, Any]:
        """List all files across all stores"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available"}
        
        try:
            stores = ['keells', 'cargills', 'test', 'enhanced_test', 'test_store']
            all_files = {}
            total_files = 0
            
            for store in stores:
                files = self.storage_manager.list_crawler_files(store)
                if files:
                    # Enhance file information with location data
                    enhanced_files = []
                    for file_info in files:
                        # Check if file exists locally
                        local_path = os.path.join(self.get_local_storage_path(), file_info.get('name', ''))
                        has_local = os.path.exists(local_path)
                        
                        # Add location information
                        enhanced_file = file_info.copy()
                        enhanced_file['location'] = 'both' if has_local else 'firebase'
                        enhanced_files.append(enhanced_file)
                    
                    all_files[store] = enhanced_files
                    total_files += len(enhanced_files)
            
            return {
                "success": True,
                "total_files": total_files,
                "stores": all_files,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {"error": str(e), "success": False}
    
    def download_file_to_local(self, cloud_path: str, local_path: str = None) -> Dict[str, Any]:
        """Download a file from Firebase to local storage"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            if not local_path:
                # Generate local path based on cloud path
                filename = cloud_path.split('/')[-1]
                local_path = os.path.join("downloads", filename)
            
            # Ensure download directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            result = self.storage_manager.download_crawler_data(cloud_path, local_path)
            
            if result.get('success'):
                return {
                    "success": True,
                    "local_path": local_path,
                    "cloud_path": cloud_path,
                    "message": "File downloaded successfully"
                }
            else:
                return {
                    "success": False,
                    "error": result.get('error', 'Download failed')
                }
        except Exception as e:
            return {"error": str(e), "success": False}
    
    def upload_to_cloud_only(self, data: Dict[str, Any], store: str, category: str = None) -> Dict[str, Any]:
        """Upload data directly to Firebase without saving locally"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            # Create temporary file
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{store}_{category or 'data'}_{timestamp}.json"
            temp_path = os.path.join("temp", filename)
            
            # Ensure temp directory exists
            os.makedirs(os.path.dirname(temp_path), exist_ok=True)
            
            # Save temporarily
            with open(temp_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            # Upload to Firebase
            result = self.storage_manager.upload_crawler_data(temp_path, store, filename)
            
            # Delete temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
            
            if result.get('success'):
                return {
                    "success": True,
                    "cloud_path": result.get('cloud_path'),
                    "filename": filename,
                    "message": "File uploaded to cloud only"
                }
            else:
                return {
                    "success": False,
                    "error": result.get('error', 'Upload failed')
                }
        except Exception as e:
            return {"error": str(e), "success": False}
    
    def delete_from_cloud(self, cloud_path: str) -> Dict[str, Any]:
        """Delete a file from Firebase Storage"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            result = self.storage_manager.delete_crawler_data(cloud_path.split('/')[1], cloud_path.split('/')[-1])
            return result
        except Exception as e:
            return {"error": str(e), "success": False}
    
    def get_file_for_ai_processing(self, cloud_path: str) -> Dict[str, Any]:
        """Download file and prepare it for AI classifier"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            # Download file content directly to memory
            result = self.storage_manager.download_crawler_data(cloud_path)
            
            if result.get('success'):
                data = result.get('data')
                if data:
                    return {
                        "success": True,
                        "data": data,
                        "cloud_path": cloud_path,
                        "ready_for_ai": True,
                        "message": "File ready for AI processing"
                    }
            
            return {
                "success": False,
                "error": "Could not retrieve file data"
            }
        except Exception as e:
            return {"error": str(e), "success": False}
    
    def keep_cloud_only(self, cloud_path: str) -> Dict[str, Any]:
        """Keep file only in cloud storage by removing local copy if it exists"""
        if not self.storage_manager:
            return {"error": "Firebase Storage not available", "success": False}
        
        try:
            # Check if file exists in cloud by trying to list files
            found_in_cloud = False
            stores = ['keells', 'cargills', 'test', 'enhanced_test', 'test_store']
            
            for store in stores:
                files = self.storage_manager.list_crawler_files(store)
                if files:
                    for file_info in files:
                        if file_info.get('name') == cloud_path:
                            found_in_cloud = True
                            break
                if found_in_cloud:
                    break
            
            if not found_in_cloud:
                return {"error": "File not found in cloud storage", "success": False}
            
            # Try to remove local copy if it exists
            local_path = os.path.join(self.get_local_storage_path(), cloud_path)
            if os.path.exists(local_path):
                os.remove(local_path)
                return {
                    "success": True,
                    "cloud_path": cloud_path,
                    "message": "File is now kept only in cloud storage (local copy removed)"
                }
            else:
                return {
                    "success": True,
                    "cloud_path": cloud_path,
                    "message": "File is already kept only in cloud storage"
                }
        except Exception as e:
            return {"error": str(e), "success": False}
    
    def get_local_storage_path(self) -> str:
        """Get the local storage path"""
        return os.path.join(os.path.dirname(__file__), "output")
    
def main():
    """Test the enhanced file management"""
    logger.info("🗂️  Testing Enhanced File Management")
    logger.info("=" * 50)
    
    manager = FileStorageManager()
    
    # Test 1: List all files
    print("\n1. 📋 Listing all files in Firebase Storage...")
    files_result = manager.list_all_files()
    
    if files_result.get('success'):
        logger.info(f"✅ Total files: {files_result['total_files']}")
        for store, files in files_result.get('stores', {}).items():
            print(f"   📁 {store}: {len(files)} files")
            for file_info in files[:2]:  # Show first 2 files per store
                print(f"      - {file_info.get('name', 'N/A')[:50]}... ({file_info.get('size', 0)} bytes)")
    else:
        logger.error(f"❌ Error: {files_result.get('error')}")
        return
    
    # Test 2: Upload sample data to cloud only
    print("\n2. ☁️  Testing cloud-only upload...")
    sample_data = {
        "timestamp": datetime.now().isoformat(),
        "products": [
            {"name": "Cloud-only Product A", "price": 25.99},
            {"name": "Cloud-only Product B", "price": 35.99}
        ],
        "storage_type": "cloud_only",
        "test": True
    }
    
    upload_result = manager.upload_to_cloud_only(sample_data, "test", "cloud_only")
    if upload_result.get('success'):
        logger.info(f"✅ Uploaded to cloud: {upload_result.get('cloud_path')}")
        cloud_test_path = upload_result.get('cloud_path')
    else:
        logger.error(f"❌ Upload failed: {upload_result.get('error')}")
        return
    
    # Test 3: Prepare file for AI processing
    print("\n3. 🤖 Testing AI processing preparation...")
    ai_result = manager.get_file_for_ai_processing(cloud_test_path)
    if ai_result.get('success'):
        print("✅ File ready for AI processing")
        print(f"   Data preview: {str(ai_result.get('data', {}))[:100]}...")
    else:
        logger.error(f"❌ AI prep failed: {ai_result.get('error')}")
    
    # Test 4: Download file to local
    print("\n4. 📥 Testing file download...")
    download_result = manager.download_file_to_local(cloud_test_path, "downloads/test_download.json")
    if download_result.get('success'):
        logger.info(f"✅ Downloaded to: {download_result.get('local_path')}")
        
        # Verify download
        if os.path.exists(download_result.get('local_path')):
            with open(download_result.get('local_path'), 'r') as f:
                downloaded_data = json.load(f)
            print(f"   Verified: {len(downloaded_data.get('products', []))} products in downloaded file")
    else:
        logger.error(f"❌ Download failed: {download_result.get('error')}")
    
    # Test 5: Keep cloud only
    print("\n5. ☁️ Testing keep cloud-only functionality...")
    keep_result = manager.keep_cloud_only(cloud_test_path)
    if keep_result.get('success'):
        print(keep_result.get('message'))
    else:
        logger.error(f"❌ Keep cloud-only failed: {keep_result.get('error')}")
    
    print("\n🎉 Enhanced File Management Test Complete!")
    print("\n📋 Available Operations:")
    print("  ✅ List all files in Firebase")
    print("  ✅ Upload directly to cloud (no local copy)")
    print("  ✅ Download from cloud to local")
    print("  ✅ Prepare files for AI processing")
    print("  ✅ Delete files from cloud")
    print("  ✅ Keep files only in cloud storage")

if __name__ == "__main__":
    main()

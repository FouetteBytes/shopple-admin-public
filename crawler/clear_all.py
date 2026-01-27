#!/usr/bin/env python3
"""Clear all local and Firebase storage files"""

import os
import sys
import shutil

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

from firebase_storage_manager import FirebaseStorageManager

def clear_all():
    # Clear local output files
    output_dir = 'output'
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
        logger.info('Cleared local output directory', extra={"output_dir": output_dir})
    
    # Recreate output structure
    os.makedirs(f'{output_dir}/keells/fruits', exist_ok=True)
    os.makedirs(f'{output_dir}/keells/vegetables', exist_ok=True)
    os.makedirs(f'{output_dir}/cargills/fruits', exist_ok=True)
    os.makedirs(f'{output_dir}/cargills/vegetables', exist_ok=True)
    logger.info('Recreated output directory structure', extra={"output_dir": output_dir})

    # Clear Firebase storage
    try:
        storage_manager = FirebaseStorageManager()
        
        # List and delete all files
        files = storage_manager.list_files()
        logger.info(f'Found {len(files)} files in Firebase Storage', extra={"files_count": len(files)})
        
        for file_info in files:
            file_path = file_info['path']
            success = storage_manager.delete_file(file_path)
            if success:
                logger.info(f'Deleted: {file_path}', extra={"file_path": file_path})
            else:
                logger.error(f'Failed to delete: {file_path}', extra={"file_path": file_path})
                
        logger.info('Firebase Storage cleared')
        
    except Exception as e:
        log_error(logger, e, context={"operation": "clear_firebase_storage"})

if __name__ == "__main__":
    clear_all()

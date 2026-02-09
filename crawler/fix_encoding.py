#!/usr/bin/env python3
"""
Fix Crawler Output JSON Encoding
"""

import os
import sys
import re

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def add_windows_encoding_fix(file_path):
    """Add Windows encoding fix to a Python file if not already present."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check if fix already exists
        if 'PYTHONIOENCODING' in content:
            logger.info(f"✅ {file_path} already has encoding fix")
            return
        
        # Find the first import statement
        lines = content.split('\n')
        insert_index = 0
        
        for i, line in enumerate(lines):
            if line.strip().startswith('import ') or line.strip().startswith('from '):
                insert_index = i
                break
        
        # Add the encoding fix before the first import
        encoding_fix = [
            "",
            "# Fix Windows encoding issues",
            "if sys.platform.startswith('win'):",
            "    os.environ['PYTHONIOENCODING'] = 'utf-8'",
            "    sys.stdout.reconfigure(encoding='utf-8', errors='ignore')",
            "    sys.stderr.reconfigure(encoding='utf-8', errors='ignore')",
            ""
        ]
        
        # Also need to ensure sys is imported
        if 'import sys' not in content:
            lines.insert(insert_index, 'import sys')
            insert_index += 1
        
        # Insert the encoding fix
        for j, fix_line in enumerate(encoding_fix):
            lines.insert(insert_index + j, fix_line)
        
        # Write back to file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        
        logger.info(f"✅ Added encoding fix to {file_path}")
        
    except Exception as e:
        logger.error(f"❌ Error processing {file_path}: {e}")

def main():
    """Process all Python crawler files."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Find all Python files in crawler directories
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('_crawler.py'):
                file_path = os.path.join(root, file)
                add_windows_encoding_fix(file_path)

if __name__ == "__main__":
    main()

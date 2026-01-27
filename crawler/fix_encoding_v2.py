#!/usr/bin/env python3
"""Fix crawler output JSON encoding (version 2)."""

import os
import sys
import re

# Add the backend path for logger_service.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def fix_crawler_encoding(file_path):
    """Fix Windows encoding in a Python crawler file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check whether a fix already exists and is correct.
        if 'sys.platform.startswith' in content and 'import os' in content[:200]:
            logger.info(f"✅ {file_path} already has proper encoding fix")
            return
        
        lines = content.split('\n')
        
        # Remove any incomplete encoding fixes.
        lines = [line for line in lines if 'PYTHONIOENCODING' not in line and 
                 'sys.stdout.reconfigure' not in line and 
                 'Fix Windows encoding issues' not in line]
        
        # Find where to insert the fix (after first imports).
        insert_index = 0
        has_sys_import = False
        has_os_import = False
        
        for i, line in enumerate(lines):
            if line.strip() == 'import sys':
                has_sys_import = True
                insert_index = i + 1
            elif line.strip() == 'import os':
                has_os_import = True
                if not has_sys_import:
                    insert_index = i
                else:
                    insert_index = i + 1
            elif line.strip().startswith('import ') or line.strip().startswith('from '):
                if not has_sys_import and not has_os_import:
                    insert_index = i
                break
        
        # Prepare the encoding fix.
        encoding_fix = []
        
        if not has_sys_import:
            encoding_fix.append('import sys')
        if not has_os_import:
            encoding_fix.append('import os')
        
        encoding_fix.extend([
            "",
            "# Fix Windows encoding issues",
            "if sys.platform.startswith('win'):",
            "    os.environ['PYTHONIOENCODING'] = 'utf-8'",
            "    sys.stdout.reconfigure(encoding='utf-8', errors='ignore')",
            "    sys.stderr.reconfigure(encoding='utf-8', errors='ignore')",
            ""
        ])
        
        # Insert the fix.
        for j, fix_line in enumerate(encoding_fix):
            lines.insert(insert_index + j, fix_line)
        
        # Write back to the file.
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        
        logger.info(f"✅ Fixed encoding in {file_path}")
        
    except Exception as e:
        logger.error(f"❌ Error processing {file_path}: {e}")

def main():
    """Process all Python crawler files."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Find all Python files in crawler directories.
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('_crawler.py'):
                file_path = os.path.join(root, file)
                fix_crawler_encoding(file_path)

if __name__ == "__main__":
    main()

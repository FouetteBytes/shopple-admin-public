#!/usr/bin/env python3
"""
Fix Crawler Output Paths
"""

import os
import sys
import re

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def fix_crawler_output_path(filepath, store, category):
    """Fix the output path in a crawler file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find and replace the output_dir line
        old_pattern = f'output_dir = "output/{store}"'
        new_path = f'output_dir = "output/{store}/{category}"'
        
        updated_content = re.sub(old_pattern, new_path, content)
        
        if old_pattern in content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            logger.info(f"✅ Fixed {filepath} -> {store}/{category}")
        else:
            logger.warning(f"⚠️  Pattern not found in {filepath}")
            
    except Exception as e:
        logger.error(f"❌ Error fixing {filepath}: {e}")

# Fix all crawler files
keells_crawlers = [
    ("keells_vegetables_crawler.py", "vegetables"),
    ("keells_fruits_crawler.py", "fruits"),
    ("keells_seafood_crawler.py", "seafood"),
    ("keells_meat_crawler.py", "meat"),
    ("keells_household_essentials_crawler.py", "household_essentials"),
    ("keells_frozen_food_crawler.py", "frozen_food"),
    ("keells_chilled_products_crawler.py", "chilled_products"),
]

cargills_crawlers = [
    ("cargills_vegetables_crawler.py", "vegetables"),
    ("cargills_fruits_crawler.py", "fruits"),
    ("cargills_seafood_crawler.py", "seafood"),
    ("cargills_meats_crawler.py", "meats"),
    ("cargills_household_crawler.py", "household"),
    ("cargills_frozen_foods_crawler.py", "frozen_foods"),
    ("cargills_dairy_crawler.py", "dairy"),
    ("cargills_beverages_crawler.py", "beverages"),
]

base_dir = os.path.dirname(os.path.abspath(__file__))

# Fix Keells crawlers
for filename, category in keells_crawlers:
    filepath = os.path.join(base_dir, "keells", filename)
    if os.path.exists(filepath):
        fix_crawler_output_path(filepath, "keells", category)
    else:
        logger.warning(f"⚠️  File not found: {filepath}")

# Fix Cargills crawlers
for filename, category in cargills_crawlers:
    filepath = os.path.join(base_dir, "cargills", filename)
    if os.path.exists(filepath):
        fix_crawler_output_path(filepath, "cargills", category)
    else:
        logger.warning(f"⚠️  File not found: {filepath}")

logger.info("Crawler output path fixes completed")

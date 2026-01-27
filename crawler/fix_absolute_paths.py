#!/usr/bin/env python3
"""Fix crawler output paths to use absolute paths.

Ensures all crawlers save to crawler/output/[store]/[category]/.
"""
import os
import re
import sys

# Add the backend path for logger_service.
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def fix_crawler_absolute_path(filepath, store, category):
    """Update the crawler output path to use an absolute path."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Look for output_dir patterns.
        patterns_to_replace = [
            f'output_dir = "output/{store}/{category}"',
            f'output_dir = "output/{store}"',
            f'output_dir = "output/{store}/"',
            f"output_dir = 'output/{store}/{category}'",
            f"output_dir = 'output/{store}'",
        ]
        
        # New absolute path snippet.
        new_code = f'''# Use absolute path relative to the main crawler directory
            base_crawler_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            output_dir = os.path.join(base_crawler_dir, "output", "{store}", "{category}")'''
        
        updated_content = content
        found_pattern = False
        
        for pattern in patterns_to_replace:
            if pattern in content:
                updated_content = updated_content.replace(pattern, new_code)
                found_pattern = True
                logger.debug(f"  Replaced: {pattern}")
                break
        
        if found_pattern:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            logger.info(f"✅ Fixed {filepath} -> absolute path for {store}/{category}")
        else:
            logger.warning(f"⚠️  No output_dir pattern found in {filepath}")
            # Log any output_dir lines for debugging.
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if 'output_dir' in line:
                    logger.debug(f"  Found line {i+1}: {line.strip()}")
            
    except Exception as e:
        logger.error(f"❌ Error fixing {filepath}: {e}")

def move_existing_files():
    """Move existing files from incorrect to correct locations."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check keells/output/ and move files to ../output/keells/.
    keells_wrong_path = os.path.join(base_dir, "keells", "output")
    if os.path.exists(keells_wrong_path):
        print(f" Found files in wrong location: {keells_wrong_path}")
        
        correct_path = os.path.join(base_dir, "output", "keells")
        os.makedirs(correct_path, exist_ok=True)
        
        for root, dirs, files in os.walk(keells_wrong_path):
            for file in files:
                if file.endswith('.json'):
                    wrong_file = os.path.join(root, file)
                    # Determine the category from the path.
                    rel_path = os.path.relpath(wrong_file, keells_wrong_path)
                    correct_file = os.path.join(correct_path, rel_path)
                    
                    # Create the directory if needed.
                    os.makedirs(os.path.dirname(correct_file), exist_ok=True)
                    
                    try:
                        import shutil
                        shutil.move(wrong_file, correct_file)
                        logger.debug(f"  Moved: {wrong_file} → {correct_file}")
                    except Exception as e:
                        logger.debug(f"  ❌ Failed to move {wrong_file}: {e}")
    
    # Repeat for cargills.
    cargills_wrong_path = os.path.join(base_dir, "cargills", "output")
    if os.path.exists(cargills_wrong_path):
        print(f" Found files in wrong location: {cargills_wrong_path}")
        
        correct_path = os.path.join(base_dir, "output", "cargills")
        os.makedirs(correct_path, exist_ok=True)
        
        for root, dirs, files in os.walk(cargills_wrong_path):
            for file in files:
                if file.endswith('.json'):
                    wrong_file = os.path.join(root, file)
                    rel_path = os.path.relpath(wrong_file, cargills_wrong_path)
                    correct_file = os.path.join(correct_path, rel_path)
                    
                    os.makedirs(os.path.dirname(correct_file), exist_ok=True)
                    
                    try:
                        import shutil
                        shutil.move(wrong_file, correct_file)
                        logger.debug(f"  Moved: {wrong_file} → {correct_file}")
                    except Exception as e:
                        logger.debug(f"  ❌ Failed to move {wrong_file}: {e}")

# All crawler files to fix.
crawlers_to_fix = [
    # Keells crawlers.
    ("keells", "keells_beverages_crawler.py", "beverages"),
    ("keells", "keells_vegetables_crawler.py", "vegetables"),
    ("keells", "keells_fruits_crawler.py", "fruits"),
    ("keells", "keells_seafood_crawler.py", "seafood"),
    ("keells", "keells_meat_crawler.py", "meat"),
    ("keells", "keells_household_essentials_crawler.py", "household_essentials"),
    ("keells", "keells_frozen_food_crawler.py", "frozen_food"),
    ("keells", "keells_chilled_products_crawler.py", "chilled_products"),
    ("keells", "keells_groceries_crawler.py", "groceries"),
    
    # Cargills crawlers.
    ("cargills", "cargills_vegetables_crawler.py", "vegetables"),
    ("cargills", "cargills_fruits_crawler.py", "fruits"),
    ("cargills", "cargills_seafood_crawler.py", "seafood"),
    ("cargills", "cargills_meats_crawler.py", "meats"),
    ("cargills", "cargills_household_crawler.py", "household"),
    ("cargills", "cargills_frozen_foods_crawler.py", "frozen_foods"),
    ("cargills", "cargills_dairy_crawler.py", "dairy"),
    ("cargills", "cargills_beverages_crawler.py", "beverages"),
]

if __name__ == "__main__":
    logger.info(" Fixing Crawler Output Paths to Use Absolute Paths")
    print("=" * 60)
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Move existing files to correct locations.
    print("\n1. Moving existing files to correct locations...")
    move_existing_files()
    
    # Update all crawler scripts.
    print("\n2. Fixing crawler scripts to use absolute paths...")
    for store, filename, category in crawlers_to_fix:
        filepath = os.path.join(base_dir, store, filename)
        if os.path.exists(filepath):
            print(f"\nFixing: {store}/{filename}")
            fix_crawler_absolute_path(filepath, store, category)
        else:
            logger.warning(f"⚠️  File not found: {filepath}")
    
    print("\n" + "=" * 60)
    logger.info(" CRAWLER PATH FIXES COMPLETED!")
    print("\n✅ All crawlers now save to: crawler/output/[store]/[category]/")
    logger.info("✅ This matches the file manager's expected directory structure")
    logger.info("✅ Any existing files have been moved to correct locations")
    print("\n Run any crawler now - files will appear in the dashboard!")

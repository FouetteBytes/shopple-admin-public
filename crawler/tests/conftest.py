"""
Pytest configuration for crawler tests
"""
import sys
import os
from pathlib import Path

# Add crawler directory to path
crawler_dir = Path(__file__).parent.parent
sys.path.insert(0, str(crawler_dir))
sys.path.insert(0, str(crawler_dir / "keells"))

# Fix Windows encoding
if sys.platform.startswith('win'):
    os.environ['PYTHONIOENCODING'] = 'utf-8'

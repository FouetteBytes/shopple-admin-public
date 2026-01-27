#!/usr/bin/env python3
"""
Start File Watcher Service
A simple script to start and manage the file watcher service
"""

import os
import sys
import subprocess
import signal
import time
from pathlib import Path

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Add crawler directory to path
SCRIPT_DIR = Path(__file__).parent
CRAWLER_DIR = SCRIPT_DIR.parent / "crawler"
sys.path.append(str(CRAWLER_DIR))

def start_file_watcher():
    """Start the file watcher service"""
    try:
        watcher_script = CRAWLER_DIR / "file_watcher.py"
        
        if not watcher_script.exists():
            logger.error(f"❌ File watcher script not found: {watcher_script}")
            return False
        
        logger.info(" Starting file watcher service...")
        logger.debug(f"   Script: {watcher_script}")
        logger.debug(f"   Working directory: {CRAWLER_DIR}")
        
        # Start the file watcher as a subprocess
        process = subprocess.Popen([
            sys.executable, str(watcher_script), "--daemon"
        ], cwd=str(CRAWLER_DIR))
        
        logger.info(f"✅ File watcher started with PID: {process.pid}")
        
        # Save PID for later reference
        pid_file = SCRIPT_DIR / "file_watcher.pid"
        with open(pid_file, 'w') as f:
            f.write(str(process.pid))
        
        logger.debug(f"   PID saved to: {pid_file}")
        logger.info("Use 'stop_file_watcher.py' to stop the service")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to start file watcher: {e}")
        return False

def check_if_running():
    """Check if file watcher is already running"""
    pid_file = SCRIPT_DIR / "file_watcher.pid"
    
    if not pid_file.exists():
        return False
    
    try:
        with open(pid_file, 'r') as f:
            pid = int(f.read().strip())
        
        # Check if process is still running
        try:
            os.kill(pid, 0)  # Doesn't actually kill, just checks if process exists
            return True
        except OSError:
            # Process doesn't exist, remove stale PID file
            pid_file.unlink()
            return False
            
    except (ValueError, FileNotFoundError):
        return False

def main():
    """Main function"""
    logger.info(" File Watcher Service Manager")
    logger.info("=" * 40)
    
    # Check if already running
    if check_if_running():
        logger.warning("⚠️  File watcher is already running")
        logger.info(f"   PID: {pid}")
        logger.info("Use 'stop_file_watcher.py' to stop it first")
        return 1
    
    # Start the service
    if start_file_watcher():
        logger.info("✅ File watcher service started successfully")
        return 0
    else:
        logger.error("❌ Failed to start file watcher service")
        return 1

if __name__ == "__main__":
    sys.exit(main())

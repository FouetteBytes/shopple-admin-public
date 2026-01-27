#!/usr/bin/env python3
"""Check the file watcher service status.

Provides a simple check to determine whether the file watcher service
is running.
"""

import os
import sys
from pathlib import Path

# Add the backend path for logger_service.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def check_file_watcher_status():
    """Check the status of the file watcher service."""
    script_dir = Path(__file__).parent
    pid_file = script_dir / "file_watcher.pid"
    
    logger.info("Checking File Watcher Service Status")
    
    if not pid_file.exists():
        logger.warning("File watcher is NOT running (no PID file found)")
        return False
    
    try:
        with open(pid_file, 'r') as f:
            pid = int(f.read().strip())
        
        # Check whether the process is still running.
        try:
            os.kill(pid, 0)  # Signal 0 checks for process existence without sending a signal.
            logger.info("File watcher is RUNNING", extra={"pid": pid, "pid_file": str(pid_file)})
            return True
        except OSError:
            # Process does not exist; remove the stale PID file.
            pid_file.unlink()
            logger.warning("File watcher is NOT running (stale PID file removed)")
            return False
            
    except (ValueError, FileNotFoundError) as e:
        logger.error("Error reading PID file", extra={"error": str(e)})
        return False

def main():
    """Main entry point."""
    is_running = check_file_watcher_status()
    
    if is_running:
        logger.info("Use 'stop_file_watcher.py' to stop the service")
    else:
        logger.info("Use 'start_file_watcher.py' to start the service")
    
    return 0 if is_running else 1

if __name__ == "__main__":
    sys.exit(main())

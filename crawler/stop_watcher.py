#!/usr/bin/env python3
"""Stop the file watcher service.

Provides a simple entry point to stop the file watcher service.
"""

import os
import sys
import signal
import time
from pathlib import Path

# Add the backend path for logger_service.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

def stop_file_watcher():
    """Stop the file watcher service."""
    script_dir = Path(__file__).parent
    pid_file = script_dir / "file_watcher.pid"
    
    if not pid_file.exists():
        logger.warning("File watcher is not running (no PID file found)")
        return True
    
    try:
        with open(pid_file, 'r') as f:
            pid = int(f.read().strip())
        
        logger.info(f" Stopping file watcher (PID: {pid})...")
        
        try:
            # Attempt graceful shutdown first.
            os.kill(pid, signal.SIGTERM)
            
            # Wait briefly for graceful shutdown.
            time.sleep(2)
            
            # Check whether the process is still running.
            try:
                os.kill(pid, 0)
                logger.info("Process still running, forcing shutdown")
                os.kill(pid, signal.SIGKILL)
                time.sleep(1)
            except OSError:
                pass  # Process already stopped.
            
            logger.info("File watcher stopped successfully")
            
        except OSError as e:
            if e.errno == 3:  # No such process
                logger.warning("⚠️  Process not found (may have already stopped)")
            else:
                logger.error(f"❌ Error stopping process: {e}")
                return False
        
        # Remove the PID file.
        pid_file.unlink()
        logger.debug(f"   PID file removed: {pid_file}")
        
        return True
        
    except (ValueError, FileNotFoundError) as e:
        logger.error(f"❌ Error reading PID file: {e}")
        return False

def main():
    """Main entry point."""
    logger.info(" File Watcher Service Stopper")
    logger.info("=" * 40)
    
    if stop_file_watcher():
        return 0
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())

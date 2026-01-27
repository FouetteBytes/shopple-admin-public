import time
import json
import os
import sys
import subprocess
import threading
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from file_watcher import FileWatcher

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class JobHandler(FileSystemEventHandler):
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.processing = set()
        self.processing_lock = threading.Lock()
        
        # Config path matches naming in backend
        self.config_path = os.path.join(base_dir, 'config', 'crawler_settings.json')
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        
        # Track active threads
        self.active_threads = []
        
        logger.info(f"Initialized JobHandler with dynamic concurrency limit")

    def get_max_concurrent_crawlers(self):
        """Read concurrency limit from config file, default to env or 2"""
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                    val = config.get('max_concurrent_crawlers')
                    if val is not None:
                        return int(val)
        except Exception:
            pass
        return int(os.environ.get('MAX_CONCURRENT_CRAWLERS', '2'))

    def on_created(self, event):
        if event.is_directory or not event.src_path.endswith('.json'):
            return
        
        job_file = event.src_path
        filename = os.path.basename(job_file)
        
        with self.processing_lock:
            if filename in self.processing:
                return
            self.processing.add(filename)
        
        logger.info(f"New job detected: {filename}")
        
        # Run in separate thread that will wait for a slot
        thread = threading.Thread(target=self.process_job, args=(job_file,))
        thread.start()

    def process_job(self, job_file):
        # Join thread to active list
        current_thread = threading.current_thread()
        
        # Wait for available slot
        while True:
            max_jobs = self.get_max_concurrent_crawlers()
            
            # Prune dead threads
            self.active_threads = [t for t in self.active_threads if t.is_alive()]
            
            if len(self.active_threads) < max_jobs:
                self.active_threads.append(current_thread)
                break
            
            time.sleep(2)  # Check again later

        try:
            # Check if file still exists (race condition check)
            if not os.path.exists(job_file):
                logger.warning(f"Job file vanished before processing: {job_file}")
                return

            # Wait briefly for file write to complete
            time.sleep(0.5)
            
            with open(job_file, 'r') as f:
                job = json.load(f)
            
            crawler_id = job.get('crawler_id')
            script_path = job.get('script_path')
            args = job.get('args', [])
            env_vars = job.get('env', {})
            
            logger.info(f"Starting crawler job {crawler_id}: {script_path}")
            
            # Prepare environment
            env = os.environ.copy()
            env.update(env_vars)
            env['PYTHONUNBUFFERED'] = '1'
            
            # Run the crawler and redirect stdout/stderr to a backend-readable log file.
            log_dir = os.path.join(self.base_dir, 'logs')
            os.makedirs(log_dir, exist_ok=True)
            log_file = os.path.join(log_dir, f"{crawler_id}.log")
            
            with open(log_file, 'w') as f_log:
                process = subprocess.Popen(
                    [sys.executable, script_path] + args,
                    env=env,
                    stdout=f_log,
                    stderr=subprocess.STDOUT,
                    cwd=os.path.dirname(script_path)
                )
                
                process.wait()
                
            logger.info(f"Job {crawler_id} completed with code {process.returncode}")
            
            # Clean up job file
            if os.path.exists(job_file):
                os.remove(job_file)
            
        except Exception as e:
            logger.error(f"Failed to process job {job_file}: {e}")
        finally:
            # Thread cleanup occurs via the is_alive() filter in the next loop iteration.
            
            filename = os.path.basename(job_file)
            with self.processing_lock:
                if filename in self.processing:
                    self.processing.remove(filename)

def start_job_watcher():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    jobs_dir = os.path.join(base_dir, "jobs")
    os.makedirs(jobs_dir, exist_ok=True)
    
    logger.info(f"Starting Job Watcher in {jobs_dir}")

    # Start File Watcher for output directory
    file_watcher = FileWatcher()
    file_watcher.start()
    
    event_handler = JobHandler(base_dir)
    observer = Observer()
    observer.schedule(event_handler, jobs_dir, recursive=False)
    observer.start()
    
    try:
        while True:
            # Fallback polling for Docker volume mounts (watchdog can be flaky on mounts)
            try:
                for filename in os.listdir(jobs_dir):
                    if filename.endswith('.json'):
                        job_file = os.path.join(jobs_dir, filename)
                        # Simulate creation event - handler handles deduplication
                        class MockEvent:
                            is_directory = False
                            src_path = job_file
                        
                        event_handler.on_created(MockEvent())
            except Exception as e:
                logger.error(f"Polling error: {e}")
                
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        file_watcher.stop()
    observer.join()

if __name__ == "__main__":
    start_job_watcher()

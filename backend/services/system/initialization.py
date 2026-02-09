"""
Service initialization module for the Flask application.
Handles initialization of all external services and dependencies.
"""
import os
import sys
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Add the crawler directory to Python path  
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'crawler'))

# Global service instances
classifier = None
crawler_manager = None
crawler_scheduler = None
file_storage_manager = None
file_watcher = None
classification_history_service = None

# Service availability flags
CRAWLER_AVAILABLE = False
CRAWLER_SCHEDULER_AVAILABLE = False
FILE_STORAGE_AVAILABLE = False
FILE_WATCHER_AVAILABLE = False
SERVICES_INITIALIZING = True  # Flag to indicate services are still loading

def initialize_classifier():
    """Initialize the AI classifier"""
    global classifier
    try:
        from backend.features.ai.service.classification_engine import SmartFallbackAIClassifier
        if SmartFallbackAIClassifier:
            logger.info("Initializing AI classifier")
            classifier = SmartFallbackAIClassifier()
            logger.info("AI classifier ready")
            return True
    except Exception as e:
        log_error(logger, e, context={"service": "classifier", "operation": "initialize"})
        return False
    return False

def initialize_crawler():
    """Initialize the crawler manager"""
    global crawler_manager, CRAWLER_AVAILABLE
    try:
        logger.info("Initializing crawler manager")
        # Set PROJECT_ROOT environment variable if not already set
        if not os.getenv('PROJECT_ROOT'):
            # Backend is in PROJECT_ROOT/backend
            # Current file: backend/services/system/initialization.py
            # Need to go up 3 levels to reach backend/ and then 1 more for project root
            backend_path = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            project_root = os.path.dirname(backend_path)
            os.environ['PROJECT_ROOT'] = project_root
            logger.info("Set PROJECT_ROOT", extra={"path": project_root})
        
        # Set PYTHON_EXECUTABLE if not already set (use current interpreter)
        if not os.getenv('PYTHON_EXECUTABLE'):
            os.environ['PYTHON_EXECUTABLE'] = sys.executable
            logger.info("Set PYTHON_EXECUTABLE", extra={"path": sys.executable})
        
        from crawler_manager import CrawlerManager
        crawler_manager = CrawlerManager()
        CRAWLER_AVAILABLE = True
        logger.info("Crawler Manager initialized successfully")
        
    except Exception as e:
        log_error(logger, e, context={"component": "CrawlerManager", "phase": "initialization"})
        crawler_manager = None
        CRAWLER_AVAILABLE = False


def initialize_crawler_scheduler():
    """Initialize the crawler automation scheduler"""
    global crawler_scheduler, CRAWLER_SCHEDULER_AVAILABLE
    try:
        if not CRAWLER_AVAILABLE or not crawler_manager:
            logger.info("Skipping crawler scheduler init - crawler unavailable")
            crawler_scheduler = None
            CRAWLER_SCHEDULER_AVAILABLE = False
            return

        from backend.features.crawler.service.crawler_scheduler import CrawlerScheduler

        cache_dir = os.path.join(os.getenv('PROJECT_ROOT', os.getcwd()), 'crawler', 'cache')
        crawler_scheduler = CrawlerScheduler(crawler_manager, cache_dir)
        CRAWLER_SCHEDULER_AVAILABLE = True
        logger.info("Crawler Scheduler initialized successfully")
    except Exception as exc:  # noqa: BLE001
        crawler_scheduler = None
        CRAWLER_SCHEDULER_AVAILABLE = False
        logger.warning("Crawler Scheduler not available", extra={"error": str(exc)})

def initialize_file_storage():
    """Initialize the file storage manager"""
    global file_storage_manager, FILE_STORAGE_AVAILABLE
    try:
        from clean_file_manager import CleanFileStorageManager
        file_storage_manager = CleanFileStorageManager()
        FILE_STORAGE_AVAILABLE = True
        logger.info("File Storage Manager initialized successfully")
    except Exception as e:
        logger.warning("File Storage Manager not available", extra={"error": str(e)})
        file_storage_manager = None
        FILE_STORAGE_AVAILABLE = False

def initialize_classification_history():
    """Initialize the classification history service"""
    global classification_history_service
    try:
        from backend.features.ai.service.classifier_history_service import initialize_history_service, get_history_service

        initialize_history_service()
        classification_history_service = get_history_service()
    except Exception as exc:  # noqa: BLE001
        classification_history_service = None
        logger.warning("Classification History service not available", extra={"error": str(exc)})

def initialize_file_watcher():
    """Initialize the file watcher"""
    global file_watcher, FILE_WATCHER_AVAILABLE
    try:
        from file_watcher import FileWatcher
        file_watcher = FileWatcher()
        FILE_WATCHER_AVAILABLE = True
        logger.info("File Watcher initialized successfully")
    except Exception as e:
        logger.warning("File Watcher not available", extra={"error": str(e)})
        file_watcher = None
        FILE_WATCHER_AVAILABLE = False

def start_file_watcher():
    """Start the file watcher in a separate thread"""
    if file_watcher and FILE_WATCHER_AVAILABLE:
        try:
            logger.info("Starting file watcher for auto-upload")
            success = file_watcher.start()
            if success:
                logger.info("File watcher started successfully")
            else:
                logger.error("Failed to start file watcher")
        except Exception as e:
            log_error(logger, e, context={"service": "file_watcher", "operation": "start"})
    else:
        logger.warning("File watcher not available - auto-upload disabled")

def _load_env_and_keystore():
    """Load environment variables and keystore (fast operations)"""
    # Ensure .env is loaded early so KEYSTORE_SECRET and other envs are available
    try:
        from backend.config.env_config import load_env_file as _load_env_file
        _load_env_file()
        logger.info("Loaded environment variables from .env")
    except Exception as e:
        logger.warning("Could not load .env before keystore init", extra={"error": str(e)})
    # Load secure keys (if any) into environment before initializing classifier
    try:
        from services.system.keystore import load_keys_from_disk, get_keys
        load_keys_from_disk()
        keys = get_keys()
        if keys:
            import os as _os
            if keys.get('groq') is not None:
                _os.environ['GROQ_API_KEY'] = keys['groq'] or ''
            if keys.get('openrouter') is not None:
                _os.environ['OPENROUTER_API_KEY'] = keys['openrouter'] or ''
            if keys.get('gemini') is not None:
                _os.environ['GEMINI_API_KEY'] = keys['gemini'] or ''
            if keys.get('cerebras') is not None:
                _os.environ['CEREBRAS_API_KEY'] = keys['cerebras'] or ''
            logger.info("Secure keys loaded from keystore", extra={"keys_count": len(keys)})
    except Exception as e:
        logger.warning("Keystore not loaded", extra={"error": str(e)})


def _prewarm_product_matcher_cache():
    """Pre-warm the IntelligentProductMatcher cache from Firestore.
    
    Runs in a background thread so it doesn't block app startup.
    If the Firestore query fails/hangs, the app still starts normally.
    """
    import threading

    def _do_prewarm():
        try:
            import os as _os2
            from services.firebase.firebase_client import initialize_firebase
            from backend.features.products.service.matcher.core import IntelligentProductMatcher

            cache_file = _os2.path.join(
                _os2.path.dirname(_os2.path.abspath(__file__)),
                '..', '..', 'cache', 'product_cache.pkl'
            )
            matcher = IntelligentProductMatcher(cache_file=cache_file, similarity_threshold=0.75)

            if len(matcher.product_cache) == 0:
                logger.info("Pre-warming product matcher cache from database")
                db = initialize_firebase()
                matcher.refresh_cache_from_db(db)
                logger.info("Product matcher cache pre-warmed",
                            extra={"product_count": len(matcher.product_cache)})
            else:
                logger.info("Product matcher cache loaded from storage",
                            extra={"product_count": len(matcher.product_cache)})
        except Exception as exc:
            logger.warning("Product matcher cache pre-warm failed",
                           extra={"error": str(exc)})

    t = threading.Thread(target=_do_prewarm, name="prewarm-matcher", daemon=True)
    t.start()
    logger.info("Product matcher pre-warm started in background thread")


def initialize_all_services():
    """Initialize all services"""
    global SERVICES_INITIALIZING
    
    logger.info("Starting backend server")
    
    # Load env and keystore synchronously (fast)
    _load_env_and_keystore()
    
    # Initialize services synchronously (now fast with lazy loading)
    logger.info("Initializing services (lazy loading enabled)")
    
    # Initialize classifier (instant - cache loads on first use)
    initialize_classifier()
    
    # Initialize crawler (instant - file sync on first access)
    initialize_crawler()
    initialize_crawler_scheduler()
    
    # Initialize file storage
    initialize_file_storage()
    
    # Initialize classification history
    initialize_classification_history()
    
    # Initialize file watcher and start it
    initialize_file_watcher()
    start_file_watcher()
    
    # Pre-warm product matcher cache (background thread – non-blocking)
    _prewarm_product_matcher_cache()
    
    # Mark initialization complete
    SERVICES_INITIALIZING = False
    
    logger.info("All services initialized successfully")
    logger.debug("Service availability status", extra={
        "crawler": CRAWLER_AVAILABLE,
        "file_storage": FILE_STORAGE_AVAILABLE,
        "file_watcher": FILE_WATCHER_AVAILABLE
    })

def get_classifier():
    """Get the classifier instance, initializing if needed"""
    global classifier
    if not classifier:
        initialize_classifier()
    return classifier

def reload_classifier_keys():
    """Reinitialize handlers on the existing classifier to pick up updated keys.

    Reads keys **directly from the encrypted keystore** (shared disk file) and
    passes them to handler constructors.  This avoids the race condition where
    os.environ / get_api_config() may return stale values in a multi-worker
    Gunicorn setup (each worker has its own process memory).
    """
    global classifier
    try:
        if not classifier:
            return False

        # ── 1. Load keystore from disk (shared across all workers)
        from services.system.keystore import load_keys_from_disk, get_keys
        load_keys_from_disk()
        ks = get_keys()  # {"groq": "gsk_...", "cerebras": "csk_...", ...}

        groq_key = ks.get('groq') or None
        openrouter_key = ks.get('openrouter') or None
        gemini_key = ks.get('gemini') or None
        cerebras_key = ks.get('cerebras') or None

        # Also sync into os.environ for any code that still reads env vars
        _provider_env = {
            'groq': 'GROQ_API_KEY',
            'openrouter': 'OPENROUTER_API_KEY',
            'gemini': 'GEMINI_API_KEY',
            'cerebras': 'CEREBRAS_API_KEY',
        }
        for provider, env_var in _provider_env.items():
            val = ks.get(provider)
            if val:
                os.environ[env_var] = val

        providers_with_keys = [p for p in ('groq', 'openrouter', 'gemini', 'cerebras') if ks.get(p)]
        logger.info("Keystore keys loaded for handler reload",
                    extra={"providers_with_keys": providers_with_keys})

        # ── 2. Recreate handlers with keys passed directly (no env var indirection)
        from backend.services.ai_handlers.groq_handler import GroqHandler
        from backend.services.ai_handlers.openrouter_handler import OpenRouterHandler
        from backend.services.ai_handlers.gemini_handler import GeminiHandler
        from backend.services.ai_handlers.cerebras_handler import CerebrasHandler

        classifier.groq_handler = GroqHandler(api_key=groq_key)
        classifier.openrouter_handler = OpenRouterHandler(api_key=openrouter_key)
        classifier.gemini_handler = GeminiHandler(api_key=gemini_key)
        classifier.cerebras_handler = CerebrasHandler(api_key=cerebras_key)
        logger.info("Reinitialized API handlers with updated keys")
        return True
    except Exception as e:
        log_error(logger, e, context={"service": "classifier", "operation": "reload_keys"})
        return False

def get_crawler_manager():
    """Get the crawler manager instance"""
    return crawler_manager


def get_crawler_scheduler():
    """Get the crawler scheduler instance"""
    return crawler_scheduler

def get_file_storage_manager():
    """Get the file storage manager instance"""
    return file_storage_manager

def get_file_watcher():
    """Get the file watcher instance"""
    return file_watcher

def get_classification_history_service():
    """Get the classification history service instance"""
    return classification_history_service

def is_crawler_available():
    """Get current crawler availability status"""
    return CRAWLER_AVAILABLE


def is_crawler_scheduler_available():
    """Get current crawler scheduler availability status"""
    return CRAWLER_SCHEDULER_AVAILABLE

def is_file_storage_available():
    """Get current file storage availability status"""
    return FILE_STORAGE_AVAILABLE

def is_file_watcher_available():
    """Get current file watcher availability status"""
    return FILE_WATCHER_AVAILABLE

def is_services_initializing():
    """Check if services are still initializing"""
    return SERVICES_INITIALIZING

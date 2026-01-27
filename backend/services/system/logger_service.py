"""
Centralized Logging Service for Shopple Admin Backend

This module provides a unified logging interface with:
- Structured JSON output 
- Multiple log levels (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- File rotation (prevents disk fill)
- Console output 
- Contextual logging with extra fields (product_id, user_id, etc.)


Usage:
    from services.system.logger_service import get_logger
    
    logger = get_logger(__name__)
    logger.info("Product updated", extra={"product_id": "abc123", "admin_id": "user456"})
    logger.error("Database error", extra={"error": str(e)}, exc_info=True)
"""

import logging
import json
import sys
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Dict, Any, Optional
from pathlib import Path


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging.
    Outputs logs in JSON format for easy parsing by log aggregation tools.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON string"""

        def _infer_service(logger_name: str) -> str:
            parts = logger_name.split('.') if logger_name else []
            if 'features' in parts:
                idx = parts.index('features')
                if idx + 1 < len(parts):
                    return parts[idx + 1]
            if 'services' in parts:
                idx = parts.index('services')
                if idx + 1 < len(parts):
                    return parts[idx + 1]
            if parts:
                return parts[0]
            return 'unknown'

        # Base log structure
        log_data: Dict[str, Any] = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
            'component': 'backend',
            'service': _infer_service(record.name),
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        # Add extra context fields (product_id, user_id, etc.)
        if hasattr(record, 'extra_fields'):
            log_data.update(record.extra_fields)
        
        # Add any custom fields passed via extra={}
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'created', 'filename', 'funcName', 
                          'levelname', 'levelno', 'lineno', 'module', 'msecs', 
                          'message', 'pathname', 'process', 'processName', 
                          'relativeCreated', 'thread', 'threadName', 'exc_info',
                          'exc_text', 'stack_info', 'extra_fields']:
                try:
                    # Only add JSON-serializable values
                    json.dumps(value)
                    log_data[key] = value
                except (TypeError, ValueError):
                    log_data[key] = str(value)
        
        return json.dumps(log_data)


class ConsoleFormatter(logging.Formatter):
    """
    Human-readable colored formatter for console output.
    Used during development for easy reading.
    """
    
    # ANSI color codes
    COLORS = {
        'DEBUG': '\033[36m',      # Cyan
        'INFO': '\033[32m',       # Green
        'WARNING': '\033[33m',    # Yellow
        'ERROR': '\033[31m',      # Red
        'CRITICAL': '\033[35m',   # Magenta
        'RESET': '\033[0m',       # Reset
    }
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record with colors for console"""
        
        # Add color to level name
        level_color = self.COLORS.get(record.levelname, self.COLORS['RESET'])
        colored_level = f"{level_color}{record.levelname:8s}{self.COLORS['RESET']}"
        
        # Format timestamp
        timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        
        # Build message with context
        message = record.getMessage()
        
        # Add extra context if present
        extra_parts = []
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'created', 'filename', 'funcName', 
                          'levelname', 'levelno', 'lineno', 'module', 'msecs', 
                          'message', 'pathname', 'process', 'processName', 
                          'relativeCreated', 'thread', 'threadName', 'exc_info',
                          'exc_text', 'stack_info', 'extra_fields']:
                extra_parts.append(f"{key}={value}")
        
        if extra_parts:
            message += f" | {' '.join(extra_parts)}"
        
        # Format: [2024-11-16 10:30:45] INFO     [product_routes] Product updated
        log_line = f"[{timestamp}] {colored_level} [{record.name}] {message}"
        
        # Add exception traceback if present
        if record.exc_info:
            log_line += '\n' + self.formatException(record.exc_info)
        
        return log_line


class LoggerService:
    """
    Centralized logger service singleton.
    Manages all logging configuration and provides logger instances.
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LoggerService, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self._initialize_logging()
            LoggerService._initialized = True
    
    def _initialize_logging(self):
        """Set up logging configuration"""
        
        # Create logs directory if it doesn't exist
        
        root_dir = Path(__file__).parent.parent.parent
        log_dir = root_dir / 'logs'
        log_dir.mkdir(exist_ok=True)
        
        # Get log level from environment (default: INFO)
        log_level_str = os.getenv('LOG_LEVEL', 'INFO').upper()
        log_level = getattr(logging, log_level_str, logging.INFO)
        
        # Get environment (development/production)
        environment = os.getenv('ENVIRONMENT', 'development').lower()
        
        # Configure root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(log_level)
        
        # Remove existing handlers
        root_logger.handlers.clear()
        
        # 1. JSON File Handler (for production, log aggregation)
        json_handler = RotatingFileHandler(
            log_dir / 'shopple_admin.json.log',
            maxBytes=50 * 1024 * 1024,  # 50MB per file
            backupCount=10,              # Keep 10 old files (500MB total)
            encoding='utf-8'
        )
        json_handler.setLevel(log_level)
        json_handler.setFormatter(JSONFormatter())
        root_logger.addHandler(json_handler)
        
        # 2. Human-readable File Handler (for manual review)
        text_handler = RotatingFileHandler(
            log_dir / 'shopple_admin.log',
            maxBytes=50 * 1024 * 1024,  # 50MB per file
            backupCount=10,              # Keep 10 old files
            encoding='utf-8'
        )
        text_handler.setLevel(log_level)
        text_handler.setFormatter(logging.Formatter(
            '%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
        root_logger.addHandler(text_handler)
        
        # 3. Console Handler (for development)
        if environment == 'development':
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(log_level)
            console_handler.setFormatter(ConsoleFormatter())
            root_logger.addHandler(console_handler)
        
        # Suppress Flask werkzeug development server warnings
        logging.getLogger('werkzeug').setLevel(logging.ERROR)
        
        # Log initialization
        init_logger = logging.getLogger(__name__)
        init_logger.info(
            f"Logging initialized",
            extra={
                'environment': environment,
                'log_level': log_level_str,
                'log_dir': str(log_dir),
                'json_log': str(log_dir / 'shopple_admin.json.log'),
                'text_log': str(log_dir / 'shopple_admin.log')
            }
        )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.
    
    Args:
        name: Logger name (typically __name__ of the module)
    
    Returns:
        Configured logger instance
    
    Example:
        logger = get_logger(__name__)
        logger.info("Processing started", extra={"product_id": "abc123"})
    """
    # Initialize logging service (singleton, only runs once)
    LoggerService()
    
    # Return logger instance
    return logging.getLogger(name)


def log_request(logger: logging.Logger, method: str, path: str, 
                user_id: Optional[str] = None, **kwargs):
    """
    Helper to log HTTP requests with consistent format.
    
    Args:
        logger: Logger instance
        method: HTTP method (GET, POST, etc.)
        path: Request path
        user_id: Optional user ID
        **kwargs: Additional context
    """
    logger.info(
        f"{method} {path}",
        extra={
            'request_method': method,
            'request_path': path,
            'user_id': user_id,
            **kwargs
        }
    )


def log_product_operation(logger: logging.Logger, operation: str, 
                         product_id: str, admin_id: Optional[str] = None, **kwargs):
    """
    Helper to log product operations with consistent format.
    
    Args:
        logger: Logger instance
        operation: Operation type (CREATE, UPDATE, DELETE, etc.)
        product_id: Product ID
        admin_id: Optional admin user ID
        **kwargs: Additional context
    """
    logger.info(
        f"Product {operation}",
        extra={
            'operation': operation,
            'product_id': product_id,
            'admin_id': admin_id,
            'resource_type': 'product',
            **kwargs
        }
    )


def log_price_operation(logger: logging.Logger, operation: str,
                       product_id: str, store: str, **kwargs):
    """
    Helper to log price operations with consistent format.
    
    Args:
        logger: Logger instance
        operation: Operation type (UPDATE, MIGRATE, etc.)
        product_id: Product ID
        store: Store name
        **kwargs: Additional context
    """
    logger.info(
        f"Price {operation}",
        extra={
            'operation': operation,
            'product_id': product_id,
            'store': store,
            'resource_type': 'price',
            **kwargs
        }
    )


def log_error(logger: logging.Logger, error: Exception, context: Optional[Dict[str, Any]] = None):
    """
    Helper to log errors with full context and traceback.
    
    Args:
        logger: Logger instance
        error: Exception object
        context: Optional context dictionary
    """
    logger.error(
        f"Error: {str(error)}",
        extra={
            'error_type': type(error).__name__,
            'error_message': str(error),
            **(context or {})
        },
        exc_info=True
    )


# Initialize logging when module is imported
_logger_service = LoggerService()

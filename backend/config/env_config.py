"""
Environment configuration loader for AI Product Classifier
Loads API keys and settings from .env file
"""

import os
import sys

from backend.services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)
from typing import Dict, Any


def load_env_file(env_path: str = None) -> Dict[str, str]:
    """
    Load environment variables from .env file
    
    Args:
        env_path: Path to .env file (default: .env in project root)
    
    Returns:
        Dictionary of environment variables
    """
    if env_path is None:
        # Default to .env in project root (two levels up from backend/config/)
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(script_dir))
        env_path = os.path.join(project_root, '.env')
    
    env_vars = {}
    
    if not os.path.exists(env_path):
        logger.warning("No .env file found", extra={"path": str(env_path)})
        logger.info("You can create one by running: python env_config.py create")
        return env_vars
    
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                
                # Skip empty lines and comments
                if not line or line.startswith('#'):
                    continue
                
                # Parse KEY=VALUE format
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    
                    # Only set if not empty and not a placeholder
                    if value and not value.startswith('your_') and value != 'your_api_key_here':
                        env_vars[key] = value
                        os.environ[key] = value  # Also set in environment
                        logger.debug("Loaded key from .env", extra={"key": key})
                    else:
                        logger.debug("Placeholder value found - skipping", extra={"key": key})
                else:
                    logger.warning("Invalid line in .env file", extra={"line_num": line_num, "line": line})
    
    except Exception as e:
        log_error(logger, e, {"context": "Error reading .env file"})
    
    return env_vars


def get_api_config() -> Dict[str, Any]:
    """
    Get API configuration from environment
    Enhanced to support multiple Groq API keys for load balancing
    
    Returns:
        Dictionary with API configuration
    """
    # Load .env file first
    load_env_file()
    
    # Load single Groq key (backward compatibility)
    groq_api_key = os.getenv('GROQ_API_KEY')
    
    # Load multiple Groq keys for load balancing
    groq_api_keys = []
    if groq_api_key and not groq_api_key.startswith('your_'):
        groq_api_keys.append(groq_api_key)
    
    # Try numbered keys (support unlimited keys)
    for i in range(1, 21):  # Support up to 20 keys (easily expandable)
        key = os.getenv(f'GROQ_API_KEY_{i}')
        if key and not key.startswith('your_') and key not in groq_api_keys:
            groq_api_keys.append(key)
    
    # Try alternative patterns  
    for i in range(1, 21):  # Support up to 20 keys
        key = os.getenv(f'GROQ_KEY_{i}')
        if key and not key.startswith('your_') and key not in groq_api_keys:
            groq_api_keys.append(key)
    
    # Set primary groq_api_key for backward compatibility
    primary_groq_key = groq_api_keys[0] if groq_api_keys else groq_api_key
    
    config = {
        'groq_api_key': primary_groq_key,
        'groq_api_keys': groq_api_keys,
        'cerebras_api_key': os.getenv('CEREBRAS_API_KEY'),
        'gemini_api_key': os.getenv('GEMINI_API_KEY'),
        'openrouter_api_key': os.getenv('OPENROUTER_API_KEY'),
        'use_conversation_memory': os.getenv('USE_CONVERSATION_MEMORY', 'true').lower() == 'true',
        'debug_mode': os.getenv('DEBUG_MODE', 'false').lower() == 'true'
    }
    
    # Report API availability
    available_apis = []
    if groq_api_keys:
        available_apis.append(f"Groq ({len(groq_api_keys)} key{'s' if len(groq_api_keys) > 1 else ''})")
    if config['cerebras_api_key']:
        available_apis.append("Cerebras")
    if config['gemini_api_key']:
        available_apis.append("Gemini")
    if config['openrouter_api_key']:
        available_apis.append("OpenRouter")
    
    if available_apis:
        logger.info("Available APIs", extra={"apis": available_apis})
    else:
        logger.error("No API keys found in .env file! Please add at least one API key.")
    
    if config['use_conversation_memory']:
        logger.info("Conversation memory enabled - AI will remember context between messages")
    
    return config


def create_env_template():
    """Create .env file from template if it doesn't exist"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    env_path = os.path.join(project_root, '.env')
    template_path = os.path.join(project_root, '.env.template')
    
    if not os.path.exists(env_path) and os.path.exists(template_path):
        try:
            with open(template_path, 'r') as template:
                content = template.read()
            with open(env_path, 'w') as env_file:
                env_file.write(content)
            logger.info("Created .env file", extra={"path": str(env_path)})
            logger.info("Edit .env file and add your API keys")
        except Exception as e:
            log_error(logger, e, {"context": "Error creating .env file"})


if __name__ == "__main__":
    # Test the configuration loader
    config = get_api_config()
    logger.info("Environment configuration loaded", extra={"config": config})
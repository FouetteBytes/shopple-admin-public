"""
Base Controller Class.
Provides standardized response handling for all controllers.
"""
from typing import Any, Dict, Tuple, Union
from flask import jsonify, Response
from services.system.logger_service import get_logger

logger = get_logger(__name__)

class BaseController:
    """
    Abstract base class for all controllers.
    Enforces standardized response format.
    """
    
    def handle_response(self, data: Any, status: int = 200) -> Tuple[Response, int]:
        """
        Standardized success response.
        :param data: The payload to return.
        :param status: HTTP status code (default 200).
        :return: Flask JSON response.
        """
        # Preserve backward-compatible response shapes while standardizing success handling.
        # If callers already include a `success` field, return the payload unchanged.
        # Otherwise wrap the payload in a `{ success: true, data: ... }` envelope to avoid API changes.
        
        # If the data is already a dict and has 'success' key, return as is.
        if isinstance(data, dict) and 'success' in data:
            return jsonify(data), status
            
        # Default fallback wrapper (if applicable) - generally safe for new endpoints
        return jsonify({'success': True, 'data': data}), status

    def handle_error(self, message: str, status: int = 500) -> Tuple[Response, int]:
        """
        Standardized error response.
        """
        logger.error(f"Controller error ({status}): {message}")
        return jsonify({'success': False, 'error': message}), status

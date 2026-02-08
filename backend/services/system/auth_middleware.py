"""
Global Authentication Middleware
Protects all API endpoints with Firebase token verification
Supports both Bearer tokens and Firebase session cookies
"""
from functools import wraps
from flask import request, jsonify, g
from firebase_admin import auth
from services.system.logger_service import get_logger

logger = get_logger(__name__)

# Endpoints that do not require authentication.
# These are typically health checks, status endpoints, or read-only data.
# The frontend session/login is handled separately by Next.js.
PUBLIC_ENDPOINTS = [
    '/api/health',
    '/health',
    '/api/stats',  # Dashboard stats (read-only)
    '/api/system/resources',  # Resource monitor (read-only)
    '/api/system/usage',  # System usage (read-only)
    '/api/system/services',  # System services status (read-only)
    '/api/crawler/status',  # Crawler status (read-only)
    '/api/crawler/available',  # Available crawlers list (read-only)
    '/api/crawler/status-all',  # All crawler statuses (read-only)
    '/api/crawler/schedules',  # Crawler schedules list (read-only)
    '/api/categories',  # Categories list (read-only)
    '/api/cache/stats',  # Cache stats (read-only)
    '/api/cache/entries',  # Cache entries list (read-only)
    '/api/audit/log',  # Audit log ingestion (needs to work from frontend without auth)
    '/api/frontend/log',  # Frontend log ingestion (client-side error/console logs)
]

# Prefix patterns for public read-only endpoints (GET only).
# These match any path starting with the prefix.
PUBLIC_PREFIXES = [
    '/api/prices/',  # Price data (read-only, used by dashboards)
    '/api/products/search',  # Product search (read-only)
    '/api/products/stats',  # Product stats (read-only)
    '/api/products/opensearch/stats',  # OpenSearch product index stats (read-only)
    '/api/pending-products',  # Product requests (read-only for GET)
    '/api/products/',  # Individual product data (read-only for GET)
    '/api/users',  # User lists (read-only for GET)
    '/api/admin/users',  # Admin user insights (read-only for GET)
    '/api/admin/avatar/',  # Avatar/memoji assets (public static assets)
    '/api/cache/',  # Cache data (read-only for GET)
    '/api/scheduler/',  # Scheduler data (read-only for GET)
    '/api/crawler/',  # Crawler data (read-only for GET)
    '/api/classification/history',  # Classification history (read-only for GET)
    '/api/audit/storage',  # OpenSearch audit storage stats (read-only)
]

# Streaming endpoints that need special handling.
# These endpoints check auth but handle it differently due to SSE.
STREAMING_ENDPOINTS = [
    '/api/crawler/progress/',  # Matches /api/crawler/progress/<id>
    '/api/crawler/progress-all',
    '/classify',  # Classifier streaming endpoint
    '/api/products/preview-stream',  # Product preview streaming
]

# Session cookie name (must match frontend's session-manager.ts).
SESSION_COOKIE_NAME = 'admin-session'


def is_public_endpoint(path: str, method: str = 'GET') -> bool:
    """Check whether the endpoint is public (no auth required)."""
    # Check exact matches (always public regardless of method).
    if path in PUBLIC_ENDPOINTS:
        return True
    
    # Prefix matches are only public for GET requests (read-only).
    if method == 'GET':
        for prefix in PUBLIC_PREFIXES:
            if path.startswith(prefix):
                return True
    
    return False


def is_streaming_endpoint(path: str) -> bool:
    """Check if endpoint is a streaming endpoint"""
    for pattern in STREAMING_ENDPOINTS:
        if path.startswith(pattern) or pattern in path:
            return True
    return False


def verify_firebase_token(id_token: str) -> dict:
    """
    Verify Firebase ID token and return decoded claims
    
    Args:
        id_token: The Firebase ID token from Authorization header
        
    Returns:
        dict: Decoded token with user claims
        
    Raises:
        Exception: If token is invalid
    """
    try:
        # Verify the ID token and check if revoked
        decoded_token = auth.verify_id_token(id_token, check_revoked=True)
        return decoded_token
    except auth.RevokedIdTokenError:
        raise Exception('Token has been revoked')
    except auth.ExpiredIdTokenError:
        raise Exception('Token has expired')
    except auth.InvalidIdTokenError:
        raise Exception('Invalid token')
    except Exception as e:
        raise Exception(f'Token verification failed: {str(e)}')


def verify_session_cookie(session_cookie: str) -> dict:
    """
    Verify Firebase session cookie and return decoded claims
    
    Args:
        session_cookie: The Firebase session cookie
        
    Returns:
        dict: Decoded claims with user info
        
    Raises:
        Exception: If session cookie is invalid
    """
    try:
        # Verify the session cookie and check if revoked
        decoded_claims = auth.verify_session_cookie(session_cookie, check_revoked=True)
        return decoded_claims
    except auth.RevokedIdTokenError:
        raise Exception('Session has been revoked')
    except auth.ExpiredSessionCookieError:
        raise Exception('Session has expired')
    except auth.InvalidSessionCookieError:
        raise Exception('Invalid session')
    except Exception as e:
        raise Exception(f'Session verification failed: {str(e)}')


def require_auth(f):
    """
    Decorator to require authentication for an endpoint
    Can be applied to individual routes if needed
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get token from Authorization header
        auth_header = request.headers.get('Authorization')
        
        if not auth_header or not auth_header.startswith('Bearer '):
            logger.warning(
                "Missing or invalid Authorization header",
                extra={
                    'path': request.path,
                    'method': request.method,
                    'ip': request.remote_addr
                }
            )
            return jsonify({
                'success': False,
                'error': 'Missing or invalid Authorization header. Please provide a valid Bearer token.'
            }), 401
        
        try:
            # Extract token
            id_token = auth_header.split('Bearer ')[1]
            
            # Verify token
            decoded_token = verify_firebase_token(id_token)
            
            # Store user info in request context
            g.user_id = decoded_token.get('uid')
            g.user_email = decoded_token.get('email')
            g.is_admin = decoded_token.get('admin', False)
            g.is_super_admin = decoded_token.get('superAdmin', False)
            
            logger.debug(
                "Authentication successful",
                extra={
                    'user_id': g.user_id,
                    'user_email': g.user_email,
                    'is_admin': g.is_admin,
                    'path': request.path
                }
            )
            
            # Call the original function
            return f(*args, **kwargs)
            
        except Exception as e:
            logger.warning(
                "Authentication failed",
                extra={
                    'path': request.path,
                    'method': request.method,
                    'error': str(e),
                    'ip': request.remote_addr
                }
            )
            return jsonify({
                'success': False,
                'error': f'Authentication failed: {str(e)}'
            }), 401
    
    return decorated_function


def global_auth_middleware():
    """
    Global before_request handler for authentication
    Applied to all /api/* endpoints and sensitive system endpoints
    Supports both Bearer tokens and session cookies
    """
    # Skip non-API and non-system endpoints
    is_api_endpoint = request.path.startswith('/api') or request.path.startswith('/classify')
    is_keys_endpoint = request.path.startswith('/keys')
    
    if not is_api_endpoint and not is_keys_endpoint:
        return None
    
    # Skip public endpoints (pass method to check GET-only public prefixes)
    if is_public_endpoint(request.path, request.method):
        return None
    
    # Skip OPTIONS requests (CORS preflight)
    if request.method == 'OPTIONS':
        return None
    
    # Streaming endpoints perform authentication internally due to SSE handling.
    if is_streaming_endpoint(request.path):
        logger.debug(
            "Skipping auth check for streaming endpoint (handled internally)",
            extra={'path': request.path}
        )
        return None
    
    # Try Bearer token first
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        try:
            id_token = auth_header.split('Bearer ')[1]
            decoded_token = verify_firebase_token(id_token)
            
            # Store user info in request context
            g.user_id = decoded_token.get('uid')
            g.user_email = decoded_token.get('email')
            g.is_admin = decoded_token.get('admin', False)
            g.is_super_admin = decoded_token.get('superAdmin', False)
            
            logger.debug(
                "Bearer token auth passed",
                extra={
                    'user_id': g.user_id,
                    'user_email': g.user_email,
                    'is_admin': g.is_admin,
                    'path': request.path
                }
            )
            return None  # Auth successful
        except Exception as e:
            logger.debug(f"Bearer token verification failed: {e}")
            # Fall through to try session cookie
    
    # Try session cookie
    session_cookie = request.cookies.get(SESSION_COOKIE_NAME)
    if session_cookie:
        try:
            decoded_claims = verify_session_cookie(session_cookie)
            
            # Store user info in request context
            g.user_id = decoded_claims.get('uid')
            g.user_email = decoded_claims.get('email')
            g.is_admin = decoded_claims.get('admin', False)
            g.is_super_admin = decoded_claims.get('superAdmin', False)
            
            logger.debug(
                "Session cookie auth passed",
                extra={
                    'user_id': g.user_id,
                    'user_email': g.user_email,
                    'is_admin': g.is_admin,
                    'path': request.path
                }
            )
            return None  # Auth successful
        except Exception as e:
            logger.debug(f"Session cookie verification failed: {e}")
            # Fall through to return 401
    
    # No valid authentication found
    logger.warning(
        "Unauthorized API access attempt",
        extra={
            'path': request.path,
            'method': request.method,
            'ip': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', 'unknown'),
            'has_auth_header': bool(auth_header),
            'has_session_cookie': bool(session_cookie)
        }
    )
    return jsonify({
        'success': False,
        'error': 'Authentication required. Please provide a valid Bearer token in the Authorization header.'
    }), 401


def require_admin(f):
    """
    Decorator to require admin privileges
    Must be used AFTER @require_auth
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not getattr(g, 'is_admin', False):
            logger.warning(
                "Admin access denied",
                extra={
                    'user_id': getattr(g, 'user_id', 'unknown'),
                    'path': request.path
                }
            )
            return jsonify({
                'success': False,
                'error': 'Admin privileges required'
            }), 403
        return f(*args, **kwargs)
    return decorated_function


def require_super_admin(f):
    """
    Decorator to require super admin privileges
    Must be used AFTER @require_auth
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not getattr(g, 'is_super_admin', False):
            logger.warning(
                "Super admin access denied",
                extra={
                    'user_id': getattr(g, 'user_id', 'unknown'),
                    'path': request.path
                }
            )
            return jsonify({
                'success': False,
                'error': 'Super admin privileges required'
            }), 403
        return f(*args, **kwargs)
    return decorated_function

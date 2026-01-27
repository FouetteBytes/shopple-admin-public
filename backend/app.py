"""
Main Flask application for the Product Classifier backend.
Organized with modular route blueprints for better maintainability.
"""
import os
import time
import uuid
from dotenv import load_dotenv
from flask import Flask, request, g
from flask_cors import CORS
from flask_compress import Compress
from flask_talisman import Talisman
from services.system.security import limiter, configure_limiter

# Load environment variables from .env file
load_dotenv()

# Initialize logging service FIRST (before other imports)
from services.system.logger_service import get_logger
logger = get_logger(__name__)

# Import service initialization
from services.system.initialization import initialize_all_services

# Import authentication middleware
from services.system.auth_middleware import global_auth_middleware

# Import all route blueprints
from backend.features.ai.index import classifier_bp
from backend.features.crawler.index import crawler_bp
from backend.features.products.index import product_bp
from backend.features.prices.index import price_bp
from backend.features.notes.index import notes_bp
from backend.features.users.index import user_bp as users_feature_bp
from backend.features.system.index import system_bp as system_feature_bp


# Create Flask app
app = Flask(__name__)

def _resolve_service(path: str) -> str:
    parts = [segment for segment in (path or '').split('/') if segment]
    if not parts:
        return 'root'

    if parts[0] == 'api':
        return parts[1] if len(parts) > 1 else 'api'

    if parts[0] == 'classify':
        return 'ai'
    if parts[0] == 'crawler':
        return 'crawler'
    if parts[0] == 'products':
        return 'products'
    if parts[0] == 'prices':
        return 'prices'
    if parts[0] == 'notes':
        return 'notes'
    if parts[0] == 'users':
        return 'users'
    if parts[0] == 'keys':
        return 'system'

    return parts[0]


def _resolve_audit_risk(path: str) -> str:
    high_risk_paths = (
        '/keys',
        '/api/users',
        '/api/system/services',
        '/api/cache',
        '/api/crawler',
        '/api/products',
        '/api/prices',
        '/api/crawler/storage',
    )
    if any(path.startswith(prefix) for prefix in high_risk_paths):
        return 'high'
    return 'medium'


@app.before_request
def _check_authentication():
    """Global authentication check for all API endpoints"""
    return global_auth_middleware()


@app.before_request
def _log_request_start():
    g.request_start = time.time()
    g.request_id = uuid.uuid4().hex
    g.request_service = _resolve_service(request.path)


@app.after_request
def _log_request_end(response):
    duration_ms = None
    if hasattr(g, 'request_start'):
        duration_ms = round((time.time() - g.request_start) * 1000, 2)

    request_id = getattr(g, 'request_id', None)
    service = getattr(g, 'request_service', None) or _resolve_service(request.path)
    # Get user info from request context (set by auth middleware) or headers
    user_email = getattr(g, 'user_email', None) or request.headers.get('X-Admin-Email') or request.headers.get('X-User-Email')
    user_id = getattr(g, 'user_id', None) or request.headers.get('X-Admin-Id') or request.headers.get('X-User-Id')

    logger.info(
        f"{request.method} {request.path}",
        extra={
            'request_id': request_id,
            'request_method': request.method,
            'request_path': request.path,
            'request_query': request.query_string.decode('utf-8', errors='ignore') if request.query_string else '',
            'request_service': service,
            'request_status': response.status_code,
            'request_duration_ms': duration_ms,
            'user_email': user_email,
            'user_id': user_id,
            'remote_addr': request.headers.get('X-Forwarded-For', request.remote_addr),
        }
    )

    if request.method in ('POST', 'PUT', 'PATCH', 'DELETE') and not request.path.startswith('/api/audit'):
        logger.info(
            "AUDIT_EVENT",
            extra={
                'audit_action': 'API_CALL',
                'audit_resource': request.path,
                'audit_user_email': user_email or 'unknown',
                'audit_user_id': user_id or 'unknown',
                'audit_success': response.status_code < 400,
                'audit_risk_level': _resolve_audit_risk(request.path),
                'audit_timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'audit_source': 'backend',
                'audit_notes': {
                    'method': request.method,
                    'service': service,
                    'status': response.status_code,
                    'request_id': request_id,
                    'remote_addr': request.headers.get('X-Forwarded-For', request.remote_addr)
                }
            }
        )

    return response

# Initialize Security Headers (Talisman)
# Force HTTPS in production, set strict content security policy
is_production = os.getenv('ENVIRONMENT') == 'production'

# Content Security Policy (CSP)
# This controls what resources the browser gets to load if this app returns HTML.
# For a JSON API, we strictly block everything (frames, objects) but allow basic self-origin scripts.
csp = {
    'default-src': ["'self'"],
    'frame-ancestors': ["'none'"],  # Prevent this API from being embedded in iframes (clickjacking protection)
    'form-action': ["'self'"],
}

Talisman(
    app,
    force_https=is_production,
    content_security_policy=csp,
    strict_transport_security=is_production,
    session_cookie_secure=is_production,
    session_cookie_http_only=True
)

# Initialize Rate Limiter
configure_limiter(app)

# Enable Gzip compression for all responses
Compress(app)

# Configure CORS to allow frontend on a different origin (Next.js dev/prod)
# - Expose common headers
# - Allow Content-Type in requests (so JSON POST doesn't get blocked after preflight)
def _resolve_allowed_origins():
    raw_origins = os.getenv('FRONTEND_ORIGIN')
    if not raw_origins or raw_origins.strip() == '*':
        return '*'

    origins = [origin.strip() for origin in raw_origins.split(',') if origin.strip()]
    return origins or '*'


CORS(
    app,
    resources={r"/*": {"origins": _resolve_allowed_origins()}},
    expose_headers='*',
    allow_headers='*',
    methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
)

# Initialize all services
initialize_all_services()

# Register all blueprints
app.register_blueprint(classifier_bp)
app.register_blueprint(crawler_bp)
app.register_blueprint(product_bp)
app.register_blueprint(price_bp)
app.register_blueprint(notes_bp)
app.register_blueprint(users_feature_bp)
app.register_blueprint(system_feature_bp)

if __name__ == '__main__':
    # Use production mode to avoid auto-reload socket issues
    host = os.getenv('FLASK_RUN_HOST', os.getenv('HOST', '0.0.0.0'))
    port = int(os.getenv('FLASK_RUN_PORT', os.getenv('PORT', '5000')))
    
    logger.info(
        "Starting Flask server",
        extra={
            'host': host,
            'port': port,
            'environment': os.getenv('ENVIRONMENT', 'development'),
            'frontend_origin': os.getenv('FRONTEND_ORIGIN', '*')
        }
    )
    
    app.run(debug=False, host=host, port=port, threaded=True)

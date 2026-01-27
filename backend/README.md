# Backend Code Organization

## Overview
The Flask backend has been refactored from a single large `app.py` file (2500+ lines) into a modular structure for better maintainability and organization.

## Running the Backend

**⚠️ Important:** The backend is designed to run inside a Docker container.
Running `python app.py` manually is **deprecated** as it bypasses the logging infrastructure (Fluent Bit) and environment configuration.

**To Start:**
```bash
# From the project root
docker-compose up --build backend
```

### Configuration for Remote Access
If deploying to a remote server, ensure `.env` is configured:
- `FRONTEND_ORIGIN`: Set to the URL of your frontend (e.g., `http://<YOUR_IP>:3000`) to allow CORS requests.

### Logging
The backend writes structured JSON logs to `logs/shopple_admin.json.log`.
These logs are automatically collected by the **Fluent Bit** container and forwarded to **OpenSearch**.

## Directory Structure

```
backend/
├── app.py                      # Main Flask application entry point
├── routes/                     # Modular route handlers
│   ├── audit_routes.py         # Audit logging endpoints
│   ├── ...
│   └── user_insights_routes.py # User analytics
├── services/                   # Business logic & integrations
│   ├── slack/                  # Slack notification services
│   ├── cache_service.py        # Cache logic
│   ├── logger_service.py       # Centralized logging
│   └── ...
├── secure/                     # Secure storage (keys, allowlists)
├── utils/                      # Shared utilities
├── tests/                      # Unit and integration tests
└── data/                       # Static data files (notes.json)
```

## Route Modules

### 1. Health Routes (`health_routes.py`)
- `GET /health` - Health check endpoint

### 2. Classifier Routes (`classifier_routes.py`)
- `POST /classify` - Streaming AI classification
- `POST /classify-batch` - Batch AI classification

### 3. Cache Routes (`cache_routes.py`)
- `GET /cache/stats` - Cache statistics
- `GET /cache/entries` - All cache entries
- `POST /cache/suggestions` - Fuzzy matching suggestions
- `PUT /cache/entry` - Update cache entry
- `DELETE /cache/entry` - Delete cache entry
- `POST /cache/cleanup` - Clean expired entries
- `POST /cache/clear` - Clear all cache
- `POST /cache/save-edited` - Save user edits to cache
- `GET /cache/config` - Get cache configuration
- `POST /cache/configure` - Configure cache settings

### 4. Crawler Routes (`crawler_routes.py`)
- `GET /crawler/status` - Crawler system status
- `GET /crawler/available` - Available crawlers
- `POST /crawler/start` - Start single crawler
- `POST /crawler/start-multiple` - Start multiple crawlers
- `POST /crawler/stop/<id>` - Stop specific crawler
- `POST /crawler/stop-all` - Stop all crawlers
- `GET /crawler/status/<id>` - Crawler status
- `GET /crawler/status-all` - All crawler statuses
- `GET /crawler/results/<id>` - Crawler results
- `GET /crawler/results` - All results
- `GET /crawler/output-files` - List output files
- `GET /crawler/load-file/<store>/<filename>` - Load output file
- `DELETE /crawler/delete-file/<store>/<filename>` - Delete output file
- `POST /crawler/aggregate` - Aggregate results
- `POST /crawler/cleanup` - Cleanup old data
- `POST /crawler/load-to-classifier` - Load results to classifier
- `POST /crawler/clear-results` - Clear crawler results
- `POST /crawler/clear-activities` - Clear activities
- `DELETE /crawler/result/<id>` - Delete single result
- `GET /crawler/progress/<id>` - Stream crawler progress
- `GET /crawler/progress-all` - Stream all progress

### 5. Storage Routes (`storage_routes.py`)
- `GET|POST|DELETE /api/crawler/storage/files` - File management
- `GET|POST /api/crawler/storage/config` - Storage configuration
- `GET /api/crawler/storage/status/<store>/<category>/<filename>` - File status
- `GET /api/crawler/storage/progress` - Upload progress

### 6. Product Routes (`product_routes.py`)
- `GET /api/products/stats` - Product statistics
- `GET /api/products` - List products with pagination
- `GET /api/products/<id>` - Get specific product
- `PUT /api/products/<id>` - Update product
- `DELETE /api/products/<id>` - Delete product
- `POST /api/products/delete-all` - Delete all products (Super Admin)
- `POST /api/products/preview` - Preview products for upload
- `POST /api/products/confirm` - Confirm product upload
- `POST /api/products/upload-old` - DEPRECATED endpoint

### 7. Category Routes (`category_routes.py`)
- `GET /api/categories` - Get all categories

### 8. Audit Routes (`audit_routes.py`)
- `GET /api/audit/logs` - Retrieve system audit logs

### 9. Avatar Routes (`avatar_routes.py`)
- `GET /api/avatar/<user_id>` - Get user avatar
- `POST /api/avatar/upload` - Upload new avatar

### 10. Key Management Routes (`keys_routes.py`)
- `GET /keys/status` - Check API key status
- `POST /keys/set` - Set API keys
- `POST /keys/test` - Test API key connectivity
- `POST /keys/reload` - Reload keys from storage
- `GET /keys/allowed-models` - Get allowed models per provider

### 11. Notes Routes (`notes_routes.py`)
- `GET /api/notes` - Get all notes
- `POST /api/notes` - Create a note
- `PUT /api/notes/<id>` - Update a note
- `DELETE /api/notes/<id>` - Delete a note

### 12. Pending Products Routes (`pending_products_routes.py`)
- `GET /api/pending-products` - List products awaiting review
- `POST /api/pending-products/approve` - Approve pending product
- `POST /api/pending-products/reject` - Reject pending product

### 13. Price Routes (`price_routes.py`)
- `GET /api/prices/history/<product_id>` - Get price history
- `POST /api/prices/analyze` - Analyze price trends

### 14. Product Request Routes (`product_request_routes.py`)
- `GET /api/product-requests` - List user product requests
- `POST /api/product-requests` - Submit a new request
- `PATCH /api/product-requests/<id>/status` - Update request status

### 15. Proxy Routes (`proxy_routes.py`)
- `GET /proxy/image` - Securely proxy external images to avoid CORS/HTTPS issues

### 16. System Routes (`system_routes.py`)
- `GET /system/status` - Overall system health and status
- `POST /system/restart/<service>` - Restart a specific service

### 17. User Insights Routes (`user_insights_routes.py`)
- `GET /api/insights/users` - Get user activity analytics
- `GET /api/insights/growth` - User growth metrics

## Services

### Initialization Service (`services/initialization.py`)
Handles initialization of all external services:
- AI Classifier
- Crawler Manager  
- File Storage Manager
- File Watcher

## Benefits of Refactoring

1. **Maintainability**: Each module has a specific responsibility
2. **Readability**: Smaller, focused files are easier to understand
3. **Debugging**: Issues can be isolated to specific modules
4. **Testing**: Individual modules can be tested independently
5. **Collaboration**: Multiple developers can work on different modules
6. **Scalability**: New features can be added as separate modules

## Migration Notes

- All existing endpoints remain functional
- No breaking changes to the API
- Original `app.py` backed up as `app_backup.py`
- Import paths and functionality preserved
- All route handlers moved to appropriate modules
- Service instances properly shared across modules

## Usage

Start the server as usual:
```bash
python app.py
```

The modular structure is transparent to the frontend - all endpoints work exactly the same as before.

## Scheduler configuration

The crawler scheduler runs inside the backend process and can be tuned via environment variables:

- `CRAWLER_SCHEDULER_POLL_SECONDS` (default `5`): Controls how frequently the scheduler loop wakes up to evaluate due jobs. Lower numbers make schedule triggers more responsive, at the cost of slightly higher CPU usage.
- `CRAWLER_SCHEDULE_MIN_INTERVAL_MINUTES` (default `240`): Enforces a minimum gap between automated runs triggered by interval schedules. This prevents runaway schedules from hammering the crawler fleet; set it higher or lower depending on infrastructure capacity.

Set these variables before launching `app.py` (for example in your `.env`, shell profile, or process manager configuration).

## Upstash Redis cache

Real-time product and price endpoints now use Upstash Redis to keep repeated queries fast while still falling back to Firestore when the cache is unavailable.

1. Create a database at https://upstash.com and copy the REST credentials.
2. Add the following environment variables before starting the backend:

```
UPSTASH_REDIS_REST_URL="https://<your-db>.upstash.io"
UPSTASH_REDIS_REST_TOKEN="<your-token>"
```

### Product endpoints

- `services/product_repository.py` owns Firestore access and caching for `/api/products/stats` and `/api/products`.
- Every cached response includes an `X-Cache: HIT|MISS` header so dashboards can observe warm/cold states.
- Any write path that ultimately calls `invalidate_product_cache()` (e.g. `/api/products/confirm`) clears both stats and paginated list keys.

High-level behavior:

- `services/product_repository.py` and `services/price_repository.py` now wrap every Firestore read and write for the `/api/products` and `/api/prices/*` endpoints and emit `X-Cache: HIT|MISS` headers so clients can spot warm vs cold responses.
- Writes (product uploads, edits, and price ingests) still hit Firestore first, then trigger precise Redis invalidation so the next read always reflects canonical data.
- If the environment variables are missing, the cache layer quietly disables itself and every endpoint behaves exactly as before.

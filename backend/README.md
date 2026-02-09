# Shopple Admin Backend

Enterprise-grade Python Flask API server for the Shopple e-commerce intelligence platform. Built with Domain-Driven Design (DDD), multi-provider AI integration, and production-ready observability.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Feature Modules](#feature-modules)
- [Core Services](#core-services)
- [API Documentation](#api-documentation)
- [Authentication & Security](#authentication--security)
- [Caching Strategy](#caching-strategy)
- [Logging & Monitoring](#logging--monitoring)
- [Background Jobs](#background-jobs)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Shopple Admin Backend is a RESTful API server providing the data layer and business logic for the Shopple administrative dashboard. It orchestrates:

- **AI-Powered Classification**: Multi-provider LLM integration for product categorization
- **Intelligent Product Matching**: Fuzzy matching and duplicate detection across retailers
- **Web Crawler Orchestration**: Job management for automated product data extraction
- **Price Analytics**: Historical tracking, trend analysis, and batch price uploads
- **User & Access Control**: Firebase-based authentication with custom claims
- **Real-time Updates**: WebSocket support for live status updates
- **Cache Management**: Upstash Redis integration for high-performance data access

This API serves as the central hub connecting frontend UI, crawler workers, AI services, and data stores.

---

## Tech Stack

### Core Framework
- **Flask 3.0.3** - Lightweight WSGI web application framework
- **Gunicorn** - Production WSGI HTTP server (8 threads, 1 worker)
- **Python 3.11+** - Modern Python with type hints and async support

### Data Storage
- **Firebase Firestore** - NoSQL document database for product data
- **Upstash Redis** - Serverless Redis for caching and session management
- **SQLite** - Embedded database for crawler state (shared with crawler service)

### AI Integration
- **Groq API** - Fast LLM inference (Llama-3.1-70b-versatile)
- **Google Gemini** - Google's Gemini 2.0 Flash model
- **Cerebras Cloud SDK** - High-performance inference
- **OpenRouter** - Multi-model API gateway

### Authentication & Security
- **Firebase Admin SDK 6.9** - Server-side authentication and custom claims
- **PyJWT 2.10** - JSON Web Token handling
- **Flask-Talisman** - HTTPS enforcement and security headers
- **Flask-Limiter** - Rate limiting for API endpoints

### Web Scraping & Integration
- **Crawl4AI 0.6.3** - Async web crawler integration
- **BeautifulSoup4** - HTML parsing
- **Kubernetes Client 31.0** - Container orchestration integration
- **Docker SDK 7.0** - Container management

### Developer Tools
- **pytest** - Testing framework with fixtures
- **Flask-CORS 4.0** - Cross-Origin Resource Sharing
- **Flask-Compress 1.14** - Response compression
- **python-dotenv** - Environment variable management

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                     │
│                      Port 3000                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ HTTP/REST + WebSocket
                 │
    ┌────────────▼────────────────────────────────┐
    │         Backend API (Flask)                 │ ──┐
    │         Port 5001                           │   │
    │                                             │   │
    │  ┌─────────────────────────────────────┐   │   │
    │  │    Feature Modules (DDD)            │   │   │ Fluent Bit
    │  ├─────────────────────────────────────┤   │   │ Logging
    │  │ • AI Classification                 │   │   │
    │  │ • Crawler Orchestration             │   │   ▼
    │  │ • Product Management                │   │ OpenSearch
    │  │ • Price Analytics                   │   │ Port 9200
    │  │ • User Management                   │   │
    │  │ • System Operations                 │   │
    │  └─────────────────────────────────────┘   │
    │                                             │
    │  ┌─────────────────────────────────────┐   │
    │  │    Core Services                    │   │
    │  ├─────────────────────────────────────┤   │
    │  │ • Logger Service (JSON)             │   │
    │  │ • Cache Service (Redis)             │   │
    │  │ • Firebase Service                  │   │
    │  │ • AI Handler Registry               │   │
    │  │ • Crawler Scheduler                 │   │
    │  └─────────────────────────────────────┘   │
    └─────┬───────────┬───────────┬──────────────┘
          │           │           │
    ┌─────▼────┐ ┌───▼────┐ ┌───▼──────┐
    │ Firebase │ │ Upstash│ │ Crawler  │
    │ Firestore│ │ Redis  │ │ Pod(s)   │
    └──────────┘ └────────┘ └──────────┘
```

### Request Flow

1. **Client Request**: Next.js frontend sends HTTP request with session cookie
2. **Middleware**: `auth_middleware.py` validates Firebase ID token and custom claims
3. **Rate Limiting**: Flask-Limiter enforces per-endpoint rate limits
4. **Routing**: Blueprint routes request to appropriate controller
5. **Controller**: Validates input, delegates to service layer
6. **Service**: Implements business logic, coordinates between repositories
7. **Repository**: Handles data access (Firestore, Redis, external APIs)
8. **Response**: JSON response with appropriate HTTP status code
9. **Logging**: Structured JSON log written to `logs/shopple_admin.jsonlog`
10. **Monitoring**: Fluent Bit forwards logs to OpenSearch for analysis

---

## Prerequisites

- **Docker & Docker Compose** (recommended deployment method)
- **Python 3.11+** (for local development only)
- **Firebase Project** with Firestore and Authentication enabled
- **Upstash Redis Account** (optional, for caching)
- **AI Provider API Keys** (Groq, Gemini, Cerebras, or OpenRouter)

---

## Getting Started

### Production Deployment (Recommended)

```bash
# From project root
docker-compose up --build backend

# With worker service for background jobs
docker-compose up --build backend worker

# Access API at http://localhost:5001
```

### Local Development (Optional)

⚠️ **Not recommended**: Docker deployment ensures environment consistency and logging infrastructure.

```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Health Check

```bash
curl http://localhost:5001/health
# Expected: {"status": "healthy", "timestamp": "..."}
```

---

## Directory Structure

```
backend/
├── app.py                          # Flask application entry point & configuration
├── worker.py                       # Background worker service (long-running jobs)
├── requirements.txt                # Production dependencies
│
├── common/                         # Shared base classes (DDD foundation)
│   └── base/
│       ├── base_controller.py      # Abstract controller with common methods
│       ├── base_service.py         # Abstract service with utilities
│       └── base_repository.py      # Abstract repository for data access
│
├── features/                       # Feature modules (Domain-Driven Design)
│   │
│   ├── ai/                         # AI Classification Feature
│   │   ├── index.py                # Blueprint registration
│   │   ├── controller/             # Request handlers
│   │   │   └── classifier_controller.py
│   │   └── service/                # Business logic
│   │       ├── classification_service.py
│   │       └── ai_provider_service.py
│   │
│   ├── crawler/                    # Web Crawler Orchestration Feature
│   │   ├── index.py                # Blueprint registration
│   │   ├── controller/             # Request handlers
│   │   │   ├── crawler_controller.py
│   │   │   ├── scheduler_controller.py
│   │   │   └── storage_controller.py
│   │   └── service/                # Business logic
│   │       ├── crawler_service.py
│   │       ├── crawler_scheduler.py   # Custom scheduler (not CronJob)
│   │       └── storage_service.py
│   │
│   ├── products/                   # Product Management Feature
│   │   ├── index.py                # Blueprint registration
│   │   ├── controller/             # Request handlers
│   │   │   ├── product_controller.py
│   │   │   └── category_controller.py
│   │   ├── service/                # Business logic
│   │   │   ├── product_service.py
│   │   │   ├── product_batch_service.py
│   │   │   ├── product_image_service.py
│   │   │   ├── category_service.py
│   │   │   └── matcher/            # Intelligent matching engine
│   │   │       ├── core.py         # Fuzzy matching & deduplication
│   │   │       ├── cache_manager.py
│   │   │       └── matcher_service.py
│   │   ├── repository/             # Data access
│   │   │   ├── product_repository.py
│   │   │   └── cache_repository.py
│   │   ├── pending/                # Pending product approvals
│   │   │   ├── controller/
│   │   │   └── service/
│   │   └── request/                # User product requests
│   │       ├── controller/
│   │       └── service/
│   │
│   ├── prices/                     # Price Management Feature
│   │   ├── index.py                # Blueprint registration
│   │   ├── controller/             # Request handlers
│   │   │   └── price_controller.py
│   │   ├── service/                # Business logic
│   │   │   ├── price_service.py
│   │   │   └── price_analytics_service.py
│   │   └── repository/             # Data access
│   │       └── price_repository.py
│   │
│   ├── notes/                      # Notes Feature (Personal notes)
│   │   ├── index.py                # Blueprint registration
│   │   ├── controller/             # Request handlers
│   │   ├── domain/                 # Domain models
│   │   ├── dto/                    # Data Transfer Objects
│   │   ├── mapper/                 # Entity/DTO mapping
│   │   ├── repository/             # Data access
│   │   └── service/                # Business logic
│   │
│   ├── users/                      # User Management Feature
│   │   ├── index.py                # Blueprint registration
│   │   ├── controller/             # Request handlers
│   │   │   ├── user_controller.py
│   │   │   ├── auth_controller.py
│   │   │   └── insights_controller.py
│   │   ├── domain/                 # Domain models
│   │   ├── dto/                    # Data Transfer Objects
│   │   ├── mapper/                 # Entity/DTO mapping
│   │   ├── repository/             # Data access
│   │   └── service/                # Business logic
│   │       ├── user_service.py
│   │       ├── auth_service.py
│   │       └── session_service.py
│   │
│   └── system/                     # System Operations Feature
│       ├── index.py                # Blueprint registration
│       ├── controller/             # Request handlers
│       │   ├── health_controller.py
│       │   ├── keys_controller.py
│       │   └── audit_controller.py
│       └── service/                # Business logic
│           ├── logger_service.py
│           ├── security.py
│           ├── initialization.py
│           └── auth_middleware.py
│
├── services/                       # Shared services (cross-cutting concerns)
│   ├── slack_notifier.py           # Slack webhook integration
│   │
│   ├── ai_handlers/                # AI provider adapters
│   │   ├── groq_handler.py         # Groq API (Llama models)
│   │   ├── gemini_handler.py       # Google Gemini
│   │   ├── cerebras_handler.py     # Cerebras Cloud SDK
│   │   └── openrouter_handler.py   # OpenRouter multi-model
│   │
│   ├── cache/                      # Caching infrastructure
│   │   ├── product_cache.json      # Product deduplication cache
│   │   └── cache_metadata.json     # Cache versioning
│   │
│   ├── categories/                 # Category management utilities
│   │   ├── category_initialization_service.py
│   │   └── category_cleanup_service.py
│   │
│   ├── classification/             # AI classification utilities
│   │   └── classification_service.py
│   │
│   ├── firebase/                   # Firebase SDK wrappers
│   │   ├── firebase_client.py      # Firestore client initialization
│   │   └── firebase_service.py     # Common Firestore operations
│   │
│   ├── products/                   # Product-related utilities
│   │   ├── opensearch_product_service.py  # OpenSearch integration
│   │   ├── price_repository.py     # Shared price data access
│   │   └── ...
│   │
│   ├── slack/                      # Slack integration utilities
│   │   └── ...
│   │
│   ├── system/                     # System-level services
│   │   ├── logger_service.py       # Centralized JSON logging
│   │   ├── security.py             # Rate limiting & security
│   │   ├── initialization.py       # Service initialization
│   │   └── auth_middleware.py      # Authentication middleware
│   │
│   └── users/                      # User management utilities
│       └── ...
│
├── utils/                          # Helper functions
│   ├── firestore_fetch_products.py # Firestore utilities
│   ├── product_utils.py            # Product data transformations
│   └── string_utils.py             # String manipulation
│
├── schemas/                        # Pydantic models & validation
│   └── product_schemas.py          # Product data schemas
│
├── config/                         # Configuration files
│   ├── __init__.py
│   └── env_config.py               # Environment variable loading
│
├── data/                           # Static data files
│   ├── allowed_models.json         # AI model allowlist
│   ├── keys.json.enc               # Encrypted API keys
│   └── notes.json                  # Legacy notes data
│
├── secure/                         # Secure file storage (gitignored)
│   └── ...                         # API keys, credentials
│
├── static/                         # Static assets
│   └── memoji/                     # User avatar library
│
├── logs/                           # Application logs
│   └── shopple_admin.json.log      # Structured JSON logs
│
├── tests/                          # Test suite
│   ├── __init__.py
│   ├── README.md                   # Testing documentation
│   ├── test_*.py                   # Unit tests
│   ├── integration/                # Integration tests
│   └── services/                   # Service-specific tests
│
├── fluent-bit.conf                 # Fluent Bit log forwarding config
├── parsers.conf                    # Log parser definitions
├── Dockerfile                      # Container definition (backend)
└── README.md                       # This file
```

---

## Feature Modules

The backend uses **Domain-Driven Design (DDD)** with feature modules organized by business domain. Each feature is self-contained with its own controllers, services, and repositories.

### 1. **AI Classification** (`features/ai/`)

LLM-powered product classification with multi-provider support.

**Capabilities:**
- Streaming classification via Server-Sent Events (SSE)
- Batch classification for bulk operations
- Multi-provider failover (Groq → Gemini → Cerebras → OpenRouter)
- Confidence scoring and AI rationale tracking
- Manual review queue for low-confidence results

**Key Endpoints:**
- `POST /classify` - Stream single product classification
- `POST /classify-batch` - Batch classify multiple products
- `GET /classify/providers` - List available AI providers
- `POST /classify/test-provider` - Test provider connectivity

**AI Handlers:**
- **Groq**: Primary provider, Llama-3.1-70b-versatile (fast, accurate)
- **Gemini**: Google's Gemini 2.0 Flash (fallback)
- **Cerebras**: High-performance inference (enterprise)
- **OpenRouter**: Multi-model gateway (flexibility)

---

### 2. **Crawler Orchestration** (`features/crawler/`)

Manages web crawler jobs across distributed crawler pods.

**Capabilities:**
- Job lifecycle management (start, stop, monitor)
- Custom Python-based scheduler (not K8s CronJob)
- Schedule types: one-time, daily, weekly, interval
- Real-time progress tracking via WebSocket
- Firebase Storage integration for results
- Parallel execution with configurable concurrency

**Key Endpoints:**
- `POST /api/crawler/start` - Start single crawler job
- `POST /api/crawler/start-multiple` - Start batch jobs
- `GET /api/crawler/status/<id>` - Get job status
- `POST /api/crawler/stop/<id>` - Stop running job
- `GET /api/crawler/schedules` - List scheduled jobs
- `POST /api/crawler/schedules` - Create schedule
- `GET /api/crawler/results` - List completed jobs

**Scheduler (`crawler_scheduler.py`):**
- Polls Firestore every 5 seconds
- Enforces minimum 4-hour gap between runs
- Slack notifications for job completion/failure
- Shared state across backend replicas

**Environment Variables:**
- `CRAWLER_SCHEDULER_POLL_SECONDS` (default: 5)
- `CRAWLER_SCHEDULE_MIN_INTERVAL_MINUTES` (default: 240)

---

### 3. **Product Management** (`features/products/`)

Comprehensive product CRUD, intelligent matching, and batch operations.

**Capabilities:**
- Fuzzy matching across retailers (detect duplicates)
- Intelligent product matcher with confidence scoring
- Batch upload with preview and confirmation
- Image upload and optimization
- Category management
- Product approval workflow
- User product request handling

**Key Components:**

#### **Intelligent Matcher** (`service/matcher/`)
```python
# Fuzzy matching algorithm
1. Name similarity (RapidFuzz Levenshtein distance)
2. Price proximity (within threshold)
3. Retailer-aware matching
4. Confidence scoring (0-100%)
5. Cache optimization for performance
```

**Key Endpoints:**
- `GET /api/products` - List products (paginated, cached)
- `GET /api/products/stats` - Product statistics (cached)
- `POST /api/products/preview` - Preview batch upload
- `POST /api/products/confirm` - Confirm and insert products
- `PUT /api/products/<id>` - Update product
- `DELETE /api/products/<id>` - Delete product
- `GET /api/products/duplicates` - Find duplicate products
- `POST /api/products/merge` - Merge duplicate products

**Caching Strategy:**
- Product list: 60-second TTL
- Product stats: 60-second TTL
- Cache invalidation on write operations
- `X-Cache: HIT|MISS` header for observability

---

### 4. **Price Analytics** (`features/prices/`)

Historical price tracking and trend analysis.

**Capabilities:**
- Price history storage per product
- Trend analysis (increasing, decreasing, stable)
- Batch price upload with validation
- Price change notifications
- Statistical analysis (min, max, average, median)

**Key Endpoints:**
- `GET /api/prices/history/<product_id>` - Get price history
- `POST /api/prices/analyze` - Analyze price trends
- `POST /api/prices/upload` - Batch price upload
- `GET /api/prices/analytics` - Price analytics dashboard data

**Data Model:**
```typescript
{
  product_id: string,
  price: number,
  retailer: string,
  timestamp: datetime,
  source: "crawler" | "manual" | "api"
}
```

---

### 5. **User Management** (`features/users/`)

Firebase-based authentication with custom claims and session management.

**Capabilities:**
- User CRUD operations
- Role-based access control (admin, super_admin)
- Session management with HTTP-only cookies
- Account provisioning and invitation
- User activity tracking
- Growth analytics

**Key Endpoints:**
- `POST /api/admin/create-user` - Create admin account (super_admin only)
- `POST /api/admin/login` - Admin login with Firebase ID token
- `POST /api/admin/logout` - Session invalidation
- `GET /api/admin/session` - Validate session
- `GET /api/insights/users` - User activity analytics
- `GET /api/insights/growth` - Growth metrics

**Custom Claims:**
```json
{
  "admin": true,
  "super_admin": true,
  "email": "user@example.com",
  "uid": "firebase-uid"
}
```

---

### 6. **System Operations** (`features/system/`)

System health monitoring, configuration management, and audit logging.

**Capabilities:**
- Health checks (API, Firestore, Redis, Crawler)
- API key management (encrypted storage)
- Audit log retrieval
- Service status monitoring
- Configuration management

**Key Endpoints:**
- `GET /health` - Simple health check
- `GET /system/status` - Detailed system status
- `POST /keys/set` - Store API keys (encrypted)
- `GET /keys/status` - Check key availability
- `GET /api/audit/logs` - Retrieve audit logs

---

## Core Services

### Logger Service (`services/system/logger_service.py`)

Centralized structured logging with JSON output.

**Features:**
- Multiple log levels (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Contextual logging with extra fields
- File rotation (10MB max, 5 backups)
- Console and file output
- Automatic service inference from module name

**Usage:**
```python
from services.system.logger_service import get_logger

logger = get_logger(__name__)

logger.info("Product updated", extra={
    "product_id": "abc123",
    "admin_id": "user456",
    "changes": {"price": "new_price"}
})
```

**Log Format:**
```json
{
  "timestamp": "2026-02-09T15:30:45.123Z",
  "level": "INFO",
  "service": "products",
  "module": "backend.features.products.service.product_service",
  "message": "Product updated",
  "context": {
    "product_id": "abc123",
    "admin_id": "user456",
    "changes": {"price": "new_price"}
  }
}
```

---

### Firebase Service (`services/firebase/`)

Firestore client wrapper with common operations.

**Features:**
- Connection pooling
- Automatic retry with exponential backoff
- Batch operations
- Transaction support
- Real-time listeners

**Common Operations:**
```python
from services.firebase.firebase_service import FirebaseService

service = FirebaseService()

# Get document
product = service.get_document('products', 'product_id')

# Query collection
products = service.query_collection('products', [
    ('retailer', '==', 'keells'),
    ('created_at', '>=', start_date)
])

# Batch write
service.batch_write([
    {'collection': 'products', 'id': 'id1', 'data': {...}},
    {'collection': 'products', 'id': 'id2', 'data': {...}}
])
```

---

### Cache Service (Upstash Redis)

High-performance caching layer for frequently accessed data.

**Features:**
- Serverless Redis (no infrastructure management)
- Automatic failover to Firestore if unavailable
- TTL-based expiration
- Cache invalidation on writes
- `X-Cache` header for observability

**Configuration:**
```bash
UPSTASH_REDIS_REST_URL="https://<your-db>.upstash.io"
UPSTASH_REDIS_REST_TOKEN="<your-token>"
```

**Cache Keys:**
- `products:stats` - Product statistics (60s TTL)
- `products:list:{page}:{limit}` - Paginated product list (60s TTL)
- `matcher:cache:{retailer}:{category}` - Matcher cache (5min TTL)

**Cache Headers:**
```http
X-Cache: HIT  # Served from Redis
X-Cache: MISS # Served from Firestore
```

---

### AI Handler Registry

Abstract factory pattern for multi-provider AI integration.

**Handler Interface:**
```python
class AIHandler(ABC):
    @abstractmethod
    async def classify(self, prompt: str, schema: dict) -> dict:
        pass
    
    @abstractmethod
    def test_connection(self) -> bool:
        pass
```

**Provider Selection Logic:**
1. Check environment variable for preferred provider
2. Test connectivity for each provider in order
3. Use first working provider
4. Fall back to next provider on failure

**Supported Providers:**
- Groq (primary)
- Gemini (fallback)
- Cerebras (enterprise)
- OpenRouter (multi-model)

---

## API Documentation

### Authentication Endpoints

#### Admin Login
```http
POST /api/admin/login
Content-Type: application/json

{
  "idToken": "firebase-id-token"
}

Response:
{
  "success": true,
  "user": {
    "uid": "firebase-uid",
    "email": "admin@example.com",
    "isAdmin": true,
    "isSuperAdmin": false
  }
}
```

#### Session Validation
```http
GET /api/admin/session
Cookie: session=<session-token>

Response:
{
  "valid": true,
  "user": { ... }
}
```

---

### Product Endpoints

#### List Products (Paginated, Cached)
```http
GET /api/products?page=1&limit=20
Cookie: session=<session-token>

Response:
{
  "products": [...],
  "total": 1250,
  "page": 1,
  "pages": 63
}

Headers:
X-Cache: HIT
```

#### Product Statistics (Cached)
```http
GET /api/products/stats
Cookie: session=<session-token>

Response:
{
  "total": 1250,
  "by_retailer": {
    "keells": 680,
    "cargills": 570
  },
  "by_category": {
    "vegetables": 250,
    "fruits": 180,
    ...
  },
  "last_updated": "2026-02-09T15:30:45Z"
}

Headers:
X-Cache: HIT
```

#### Batch Upload (Preview)
```http
POST /api/products/preview
Content-Type: application/json

{
  "products": [
    {
      "name": "Product Name",
      "price": 100.50,
      "retailer": "keells",
      ...
    }
  ]
}

Response:
{
  "preview": {
    "total": 50,
    "new": 45,
    "duplicates": 5,
    "duplicate_details": [...]
  }
}
```

---

### Crawler Endpoints

#### Start Crawler Job
```http
POST /api/crawler/start
Content-Type: application/json

{
  "retailer": "keells",
  "category": "vegetables"
}

Response:
{
  "job_id": "uuid-here",
  "status": "running",
  "started_at": "2026-02-09T15:30:45Z"
}
```

#### Get Job Status
```http
GET /api/crawler/status/<job_id>

Response:
{
  "job_id": "uuid-here",
  "status": "completed",
  "progress": 100,
  "products_found": 245,
  "started_at": "2026-02-09T15:30:45Z",
  "finished_at": "2026-02-09T15:35:12Z",
  "duration_seconds": 267
}
```

---

### Classification Endpoints

#### Streaming Classification (SSE)
```http
POST /classify
Content-Type: application/json

{
  "products": [
    {
      "name": "Product Name",
      "description": "..."
    }
  ]
}

Response (SSE Stream):
event: progress
data: {"index": 0, "total": 10, "percent": 10}

event: result
data: {"product": {...}, "category": "vegetables", "confidence": 95}

event: complete
data: {"total": 10, "successful": 9, "failed": 1}
```

---

## Authentication & Security

### Session Management

- **HTTP-only Cookies**: Session tokens stored in secure, HTTP-only cookies
- **Session Duration**: 1 hour (auto-refresh on activity)
- **Cross-tab Sync**: BroadcastChannel API for multi-tab sessions
- **CSRF Protection**: Talisman-enforced CSRF tokens on state-changing operations

### Role-Based Access Control (RBAC)

**Roles:**
- **Admin**: Standard administrative privileges (view, edit, manage products)
- **Super Admin**: Full system access (user provisioning, system configuration)

**Custom Claims:**
```python
# Stored in Firebase ID token
{
  "admin": True,
  "super_admin": True,
  "email": "admin@example.com"
}
```

**Middleware Protection:**
```python
@require_admin  # Requires admin=True claim
@require_super_admin  # Requires super_admin=True claim
```

### Rate Limiting

```python
# Per endpoint limits
@limiter.limit("100 per minute")  # Standard endpoints
@limiter.limit("10 per minute")   # Heavy operations (batch upload)
@limiter.limit("5 per minute")    # Authentication endpoints
```

### Security Headers

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
```

---

## Caching Strategy

### Upstash Redis Integration

**Benefits:**
- **Serverless**: No infrastructure management
- **Low Latency**: ~1-5ms response times
- **Automatic Failover**: Falls back to Firestore if Redis unavailable
- **Observability**: `X-Cache` headers show hit/miss status

**Cache Keys:**
```
products:stats        → Product statistics (60s TTL)
products:list:{params} → Paginated product list (60s TTL)
matcher:cache:{key}   → Matcher results (5min TTL)
prices:history:{id}   → Price history (2min TTL)
```

**Invalidation Strategy:**
```python
# On product write (create, update, delete)
def invalidate_product_cache():
    redis.delete("products:stats")
    redis.delete_pattern("products:list:*")
    redis.delete_pattern("matcher:cache:*")
```

**Configuration:**
```bash
# .env
UPSTASH_REDIS_REST_URL="https://your-db.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"
```

**Behavior:**
- If environment variables missing → cache disabled
- If Redis request fails → fallback to Firestore
- All caching is transparent to client

---

## Logging & Monitoring

### Structured JSON Logging

All logs written in JSON format for easy parsing by log aggregation tools.

**Log Entry Example:**
```json
{
  "timestamp": "2026-02-09T15:30:45.123Z",
  "level": "INFO",
  "service": "products",
  "module": "backend.features.products.controller.product_controller",
  "message": "Product batch upload completed",
  "context": {
    "admin_id": "user123",
    "products_uploaded": 50,
    "duplicates_found": 3,
    "duration_ms": 2341
  },
  "risk": "high"
}
```

### Log Aggregation Pipeline

```
Backend (Python)
    │
    └─> logs/shopple_admin.json.log
           │
           └─> Fluent Bit (Container)
                  │
                  └─> OpenSearch (Port 9200)
                         │
                         └─> OpenSearch Dashboards (Port 5601)
```

### Useful Queries

```javascript
// Failed API requests
level: "ERROR" AND service: "products"

// Slow requests (> 1s)
context.duration_ms: >1000

// High-risk operations
risk: "high"

// Authentication failures
service: "users" AND message: "login failed"

// Cache miss rate
X-Cache: "MISS"
```

---

## Background Jobs

### Worker Service (`worker.py`)

Long-running background worker for asynchronous tasks.

**Use Cases:**
- Large batch processing
- Scheduled data exports
- Database maintenance
- Email/notification processing

**Deployment:**
```bash
docker-compose up -d worker
```

**Current Implementation:**
- Keepalive service (60-second loop)
- Placeholder for future job queue integration

**Future Enhancements:**
- Celery integration for distributed task queue
- Redis-based job queue
- Scheduled tasks (data cleanup, report generation)

---

## Configuration

### Environment Variables

```bash
# Flask Configuration
FLASK_ENV=production
SECRET_KEY=your-random-secret-key-min-32-chars

# CORS
FRONTEND_ORIGIN=http://localhost:3000

# Firebase (Server-side)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Upstash Redis (Optional)
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# AI Providers
GROQ_API_KEY=gsk_...
GOOGLE_API_KEY=AIza...
CEREBRAS_API_KEY=csk-...
OPENROUTER_API_KEY=sk-or-...

# Crawler Scheduler
CRAWLER_SCHEDULER_POLL_SECONDS=5
CRAWLER_SCHEDULE_MIN_INTERVAL_MINUTES=240

# Slack Notifications (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Logging
LOG_LEVEL=INFO
LOG_FILE=logs/shopple_admin.json.log
```

---

## Deployment

### Docker Deployment (Recommended)

```bash
# Build backend container
docker-compose build backend

# Start backend service
docker-compose up -d backend

# Start with worker
docker-compose up -d backend worker

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Kubernetes Deployment

See `../k8s/README.md` for complete Kubernetes setup.

**Key Resources:**
- **Deployment**: `k8s/03-backend.yaml` (1 replica, Gunicorn 8 threads)
- **Service**: ClusterIP on port 5001
- **ConfigMap**: Environment variables
- **Secret**: Sensitive credentials (Firebase, Redis, AI keys)
- **PersistentVolume**: 10Gi for logs and cache

**Resource Limits:**
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

**Scaling:**
```bash
# Horizontal scaling
kubectl scale deployment backend --replicas=3

# Update image
kubectl set image deployment/backend backend=shopple-backend:v2.0
```

---

## Testing

### Test Suite

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_product_service.py -v

# Run with coverage
pytest tests/ --cov=backend --cov-report=html

# Integration tests only
pytest tests/integration/ -v
```

### Test Organization

```
tests/
├── __init__.py
├── conftest.py                    # Shared fixtures
├── test_crawler_scheduler.py     # Scheduler tests
├── test_logging.py                # Logger tests
├── test_product_image_service.py  # Image service tests
├── integration/                   # Integration tests
│   ├── test_api_endpoints.py
│   ├── test_firestore_integration.py
│   └── test_redis_caching.py
└── services/                      # Service-specific tests
    ├── test_matcher.py
    ├── test_classification.py
    └── test_price_analytics.py
```

---

## Troubleshooting

### Common Issues

#### 1. **"Firebase Admin SDK initialization failed"**
- **Cause**: Missing or invalid Firebase credentials
- **Solution**: Verify `FIREBASE_PRIVATE_KEY` is properly escaped
- **Check**: `echo $FIREBASE_PRIVATE_KEY | grep "BEGIN PRIVATE KEY"`

#### 2. **"Upstash Redis connection failed"**
- **Cause**: Invalid Redis URL or token
- **Solution**: Verify credentials at https://console.upstash.com
- **Note**: Application continues working without cache

#### 3. **"Rate limit exceeded"**
- **Cause**: Too many requests from same IP
- **Solution**: Wait for rate limit window to reset
- **Check**: Response header `X-RateLimit-Remaining`

#### 4. **"Session expired" on every request**
- **Cause**: Cookie not being set (HTTPS/domain mismatch)
- **Solution**: Ensure `FRONTEND_ORIGIN` matches actual frontend URL
- **Check**: Browser DevTools → Application → Cookies

#### 5. **"AI classification timeout"**
- **Cause**: Provider rate limit or API key invalid
- **Solution**: Check API key status at provider dashboard
- **Fallback**: System automatically tries next provider

#### 6. **"Crawler job stuck in 'running' status"**
- **Cause**: Crawler pod crashed or network issue
- **Solution**: Check crawler pod logs with `kubectl logs crawler-pod`
- **Manual Fix**: `POST /api/crawler/stop/<job_id>` to reset status

---

### Debug Mode

Enable verbose logging:

```bash
# In .env
LOG_LEVEL=DEBUG

# Restart backend
docker-compose restart backend
```

**Debug Output:**
- All SQL queries
- Cache hit/miss details
- AI provider selection logic
- Request/response payloads
- Firebase operations

---

## Performance Optimization

### Database Queries
- Use batch operations for bulk writes
- Implement pagination for large datasets
- Create Firestore indices for common queries
- Cache frequently accessed data in Redis

### API Response Times
- Enable Brotli compression for responses
- Use `X-Cache` headers to monitor cache effectiveness
- Implement request debouncing on frontend
- Set appropriate TTLs for cached data

### Resource Usage
- Monitor memory usage with `docker stats`
- Adjust Gunicorn worker threads based on load
- Scale horizontally for high traffic
- Use connection pooling for database connections

---



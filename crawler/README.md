# Shopple Multi-Site Crawler

Intelligent web crawler for automated product data extraction from major supermarket e-commerce platforms. Built with Crawl4AI, with extraction, and production-ready orchestration.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Core Components](#core-components)
- [Crawler Categories](#crawler-categories)
- [Data Pipeline](#data-pipeline)
- [Configuration](#configuration)
- [Operation Modes](#operation-modes)
- [Monitoring & Logging](#monitoring--logging)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Shopple Multi-Site Crawler is an asynchronous, web scraping system designed for large-scale product data extraction from dynamic e-commerce websites. It combines intelligent scrolling algorithms, LLM-based content extraction, and robust job orchestration to reliably scrape thousands of products across multiple retailers.

### Supported Retailers

- **Keells Super** (`https://www.keellssuper.com`) - Sri Lanka's leading supermarket chain
- **Cargills Online** (`https://cargillsonline.com`) - Major retail supermarket

### Key Capabilities

- **Automated Data Extraction**: Schedule and execute crawl jobs across 18+ product categories
- **Intelligent Pagination**: Adaptive infinite scroll detection with product count monitoring
- **Real-time Monitoring**: WebSocket-based job status updates and progress tracking
- **Storage Integration**: Automatic upload to Firebase Storage with organized archival
- **Parallel Execution**: Multi-threaded job runner with configurable concurrency
- **Persistent State**: SQLite-backed cache for run history and deduplication

---

## Tech Stack

### Core Framework
- **Crawl4AI 0.6.3** - Async web crawler with JavaScript execution and LLM extraction
- **Python 3.11+** - Modern async/await patterns with type hints
- **asyncio** - Concurrent task execution and event loops

### Browser Automation
- **Playwright** - Headless Chromium for dynamic content rendering
- **Stealth Plugins** - Anti-detection measures for production scraping

### AI & Data Processing
- **Groq API** - Fast LLM inference (Llama-3.1-8b-instant)
- **Pydantic 2.x** - Schema validation and data modeling
- **BeautifulSoup4** - HTML parsing and cleanup

### Storage & Caching
- **SQLite3** - Persistent crawler state and job history
- **Firebase Storage** - Cloud storage for scraped JSON files
- **Firebase Admin 6.9** - Server-side Firebase operations

### Monitoring & Logging
- **Watchdog** - File system event monitoring
- **Fluent Bit** - Log aggregation and forwarding
- **OpenSearch** - Centralized logging backend

### Testing
- **pytest** - Comprehensive test suite with async support
- **pytest-asyncio** - Async test fixtures

---

## Architecture

### System Overview

```
┌────────────────┐
│  Backend API   │ ──┐
│  (Flask)       │   │ Trigger Jobs
└────────────────┘   │
                     ▼
              ┌──────────────────┐
              │ Crawler Manager  │ ◄── Job Orchestration
              │  (Docker)        │
              └─────────┬────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐
    │  Keells  │  │ Cargills │  │   File   │
    │ Crawlers │  │ Crawlers │  │ Watcher  │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │              │              │
         └──────────────┼──────────────┘
                        ▼
                 ┌──────────────┐
                 │ SQLite Cache │
                 │  + JSON Out  │
                 └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │   Firebase   │
                 │   Storage    │
                 └──────────────┘
```

### Request Flow

1. **Job Submission**: Backend API receives crawl request from dashboard
2. **Manager Dispatch**: CrawlerManager validates job and spawns crawler instance
3. **Browser Automation**: Crawler launches headless Chrome, navigates to target URL
4. **Intelligent Scrolling**: Adaptive scroll algorithm loads all products (infinite scroll)
5. **LLM Extraction**: HTML content sent to Groq API for structured data extraction
6. **Data Validation**: Pydantic models validate and normalize extracted products
7. **Persistence**: Results written to JSON file and SQLite database
8. **File Detection**: FileWatcher detects new JSON output
9. **Cloud Upload**: Firebase Storage Manager uploads JSON to organized archive
10. **Status Update**: Job status updated in backend database via API callback

---

## Prerequisites

- **Docker & Docker Compose** (recommended for containerized deployment)
- **Python 3.11+** (for local development)
- **Chromium/Chrome** (automatically installed in Docker container)
- **Groq API Key** (for LLM-based extraction)
- **Firebase Project** (for storage and authentication)

---

## Getting Started

### Production Deployment (Recommended)

```bash
# From project root
docker-compose up --build crawler

# Run with file watcher for automatic uploads
docker-compose up --build crawler file-watcher
```

### Local Development

⚠️ **Not recommended**: Docker ensures correct Chromium version and dependencies.

```bash
cd crawler
pip install -r requirements.txt
python crawler_manager.py
```

### Running Specific Crawlers

```bash
# Single category
python keells/keells_vegetables_crawler.py

# All Keells categories
python -m tests.test_all_keells_crawlers

# All Cargills categories
python -m tests.test_all_cargills_crawlers
```

---

## Directory Structure

```
crawler/
├── crawler_manager.py                 # Primary job orchestration engine
├── enhanced_crawler_manager.py        # Advanced manager with retry logic
├── crawler_integration.py             # API integration layer
├── file_watcher.py                    # File system event monitor
├── job_watcher.py                     # Job lifecycle monitor
├── firebase_storage_manager.py        # Cloud storage handler
├── clean_file_manager.py              # File upload deduplication
├── start_watcher.py                   # Watcher daemon starter
├── stop_watcher.py                    # Watcher daemon stopper
├── check_watcher.py                   # Watcher status checker
├── cleanup.py                         # Cache and output cleanup
│
├── keells/                            # Keells Super crawlers
│   ├── keells_base_crawler.py         # Base class with shared logic
│   ├── keells_vegetables_crawler.py   # Fresh vegetables
│   ├── keells_fruits_crawler.py       # Fresh fruits
│   ├── keells_meat_crawler.py         # Meat & poultry
│   ├── keells_seafood_crawler.py      # Seafood
│   ├── keells_chilled_products_crawler.py  # Dairy & chilled
│   ├── keells_frozen_food_crawler.py  # Frozen foods
│   ├── keells_beverages_crawler.py    # Drinks & beverages
│   ├── keells_groceries_crawler.py    # Pantry staples
│   └── keells_household_essentials_crawler.py  # Household items
│
├── cargills/                          # Cargills Online crawlers
│   ├── cargills_base_crawler.py       # Base class with shared logic
│   ├── cargills_vegetables_crawler.py # Fresh vegetables
│   ├── cargills_fruits_crawler.py     # Fresh fruits
│   ├── cargills_meats_crawler.py      # Meat & poultry
│   ├── cargills_seafood_crawler.py    # Seafood
│   ├── cargills_dairy_crawler.py      # Dairy products
│   ├── cargills_frozen_foods_crawler.py # Frozen foods
│   ├── cargills_beverages_crawler.py  # Drinks & beverages
│   └── cargills_household_crawler.py  # Household items
│   └── docs/                          # Refactoring documentation
│
├── cache/                             # Persistent state storage
│   ├── __init__.py
│   ├── sqlite_store.py                # SQLite database wrapper
│   ├── crawler_cache.db               # Job history & results (SQLite)
│   ├── product_cache.json             # Product deduplication cache
│   ├── crawler_schedules.json         # Scheduled job definitions
│   └── cache_metadata.json            # Cache versioning info
│
├── config/                            # Configuration files
│   └── crawler_settings.json          # Crawler behavior settings
│
├── output/                            # Scraped data output
│   ├── keells/                        # Keells category folders
│   │   ├── vegetables/
│   │   ├── fruits/
│   │   └── ...
│   └── cargills/                      # Cargills category folders
│       ├── vegetables/
│       └── ...
│
├── logs/                              # Structured logging output
│   └── crawler.json.log               # JSON-formatted logs (Fluent Bit)
│
├── tests/                             # Comprehensive test suite
│   ├── __init__.py
│   ├── conftest.py                    # pytest fixtures
│   ├── test_all_keells_crawlers.py    # Full Keells test suite
│   ├── test_all_cargills_crawlers.py  # Full Cargills test suite
│   ├── test_output/                   # Test results directory
│   └── docs/                          # Testing documentation
│       ├── AUTOMATED_TESTING_SETUP.md
│       ├── COMPREHENSIVE_TEST_GUIDE.md
│       ├── TESTING_GUIDE.md
│       └── QUICK_REFERENCE.md
│
├── requirements.txt                   # Production dependencies
├── requirements-dev.txt               # Development dependencies
├── requirements-firebase.txt          # Firebase-specific packages
├── storage_config.json                # Firebase Storage configuration
├── .gitignore                         # Git ignore rules
└── README.md                          # This file
```

---

## Core Components

### 1. **Crawler Manager** (`crawler_manager.py`)

Central orchestration system for crawler execution and lifecycle management.

**Responsibilities:**
- Job queue management with priority scheduling
- Crawler process spawning and monitoring
- Error handling and automatic retry logic
- Progress tracking and status reporting
- Parallel execution with configurable workers
- Integration with backend API for status updates

**Key Methods:**
```python
start_crawl(retailer, category, job_id, callback_url)
stop_crawl(job_id)
get_job_status(job_id)
list_active_jobs()
cleanup_stale_jobs()
```

**Features:**
- Thread-safe job execution
- Graceful shutdown handling
- Automatic cleanup of orphaned processes
- Real-time progress callbacks via WebSocket

---

### 2. **Base Crawlers** (`keells_base_crawler.py`, `cargills_base_crawler.py`)

Abstract base classes implementing crawler core logic. All category-specific crawlers inherit from these.

**Shared Functionality:**
- Browser session management
- Intelligent scroll pagination
- Product count monitoring
- LLM-based extraction
- Data validation (Pydantic)
- JSON output generation
- Error handling and logging

**Two-Phase Architecture:**

#### **Phase 1: Intelligent Product Loading**
```python
async def load_all_products(self, session):
    """
    Scrolls page until all products loaded or stability reached
    - Monitors product count changes
    - Implements exponential backoff
    - Detects lazy-loading completion
    - Returns total product count
    """
```

#### **Phase 2: Bulk Data Extraction**
```python
async def extract_products(self, session):
    """
    Uses LLM to extract structured data from loaded HTML
    - Targets .product-card-container elements
    - Sends HTML to Groq API with Pydantic schema
    - Validates and normalizes data
    - Returns List[Product]
    """
```

**Product Schema:**
```python
class Product(BaseModel):
    product_name: str  # Full product name
    price: str         # Price with currency (e.g., "Rs 297.00")
    image_url: Optional[str]  # Product image URL
```

---

### 3. **File Watcher** (`file_watcher.py`)

Background daemon that monitors `output/` directory for new crawler results.

**Event Flow:**
1. Watchdog detects `*.json` file creation
2. Waits for file to close (stability check)
3. Debounces duplicate events (1-second window)
4. Triggers `CleanFileStorageManager.process_file()`
5. Uploads to Firebase Storage
6. Updates job status in backend database

**Features:**
- Multi-threaded file processing
- Deduplication to prevent double uploads
- Automatic retry on upload failure
- Organized storage paths: `crawler_output/{retailer}/{category}/{date}/{filename}`

**Usage:**
```bash
# Start watcher daemon
python start_watcher.py

# Check status
python check_watcher.py

# Stop daemon
python stop_watcher.py
```

---

### 4. **SQLite Cache Store** (`cache/sqlite_store.py`)

Thread-safe persistent storage for crawler state and history.

**Database Schema:**
```sql
-- Job execution history
CREATE TABLE crawler_runs (
    crawler_id TEXT PRIMARY KEY,
    retailer TEXT,
    category TEXT,
    status TEXT,  -- running, completed, failed
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    products_found INTEGER,
    output_file TEXT,
    error_message TEXT
);

-- Product deduplication
CREATE TABLE product_cache (
    product_id TEXT PRIMARY KEY,
    retailer TEXT,
    category TEXT,
    product_name TEXT,
    price TEXT,
    image_url TEXT,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP
);

-- File upload tracking
CREATE TABLE upload_status (
    file_path TEXT PRIMARY KEY,
    uploaded_at TIMESTAMP,
    firebase_url TEXT,
    file_size INTEGER
);
```

**Operations:**
- Job status tracking (start, update, complete)
- Product deduplication across runs
- Upload history with Firebase URLs
- Cache invalidation and cleanup

---

### 5. **Firebase Storage Manager** (`firebase_storage_manager.py`)

Manages cloud storage uploads with organized directory structure.

**Storage Organization:**
```
crawler_output/
├── keells/
│   ├── vegetables/
│   │   └── 2026-02-09/
│   │       └── keells_vegetables_20260209_153045.json
│   └── fruits/
│       └── 2026-02-09/
│           └── keells_fruits_20260209_154120.json
└── cargills/
    └── vegetables/
        └── 2026-02-09/
            └── cargills_vegetables_20260209_155230.json
```

**Features:**
- Automatic retry with exponential backoff
- Public URL generation
- Metadata tagging (retailer, category, date, product_count)
- Duplicate detection (skip if already uploaded)
- Progress tracking for large files

---

## Crawler Categories

### Keells Super (10 Categories)

| Category | URL Pattern | Product Count |
|----------|-------------|---------------|
| Vegetables | `/fresh-vegetables` | ~200 |
| Fruits | `/fresh-fruits` | ~150 |
| Meat & Poultry | `/meat-poultry` | ~100 |
| Seafood | `/seafood` | ~80 |
| Chilled Products | `/chilled-products` | ~250 |
| Frozen Foods | `/frozen-food` | ~180 |
| Beverages | `/beverages` | ~300 |
| Groceries | `/groceries` | ~500 |
| Household Essentials | `/household-essentials` | ~400 |

### Cargills Online (8 Categories)

| Category | URL Pattern | Product Count |
|----------|-------------|---------------|
| Vegetables | `/vegetables` | ~180 |
| Fruits | `/fruits` | ~120 |
| Meats | `/meats` | ~90 |
| Seafood | `/seafood` | ~70 |
| Dairy | `/dairy` | ~200 |
| Frozen Foods | `/frozen-foods` | ~150 |
| Beverages | `/beverages` | ~280 |
| Household | `/household` | ~350 |

---

## Data Pipeline

### Extraction Process

```
1. Browser Launch
   └─> Headless Chromium with stealth plugins

2. Page Navigation
   └─> Load target URL with timeout (30s)

3. Intelligent Scrolling (Phase 1)
   ├─> Monitor product count every 2s
   ├─> Scroll incrementally (500px)
   ├─> Detect stability (3 consecutive waits with no change)
   └─> Return total product count

4. HTML Extraction (Phase 2)
   ├─> Find all `.product-card-container` elements
   ├─> Extract outer HTML for each card
   └─> Concatenate into single HTML payload

5. LLM Processing
   ├─> Send HTML + Pydantic schema to Groq API
   ├─> Model: llama-3.1-8b-instant
   ├─> Extract structured JSON
   └─> Parse and validate with Pydantic

6. Data Validation
   ├─> Check required fields (product_name, price)
   ├─> Normalize price format
   ├─> Validate image URLs
   └─> Filter duplicates

7. Output Generation
   ├─> Write JSON to output/{retailer}/{category}/
   ├─> Update SQLite cache
   └─> Trigger Firebase upload via FileWatcher

8. Status Notification
   └─> POST callback to backend API with results
```

---

## Configuration

### Environment Variables

```bash
# AI Extraction
GROQ_API_KEY=gsk_...                   # Groq API key for LLM extraction

# Firebase Configuration (Server-side)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Optional: Storage Configuration
STORAGE_BUCKET=your-project.appspot.com
FIREBASE_STORAGE_CONFIG_PATH=./storage_config.json

# Logging
LOG_LEVEL=INFO                         # DEBUG, INFO, WARNING, ERROR
CRAWLER_LOG_FILE=logs/crawler.json.log
```

### Crawler Settings (`config/crawler_settings.json`)

```json
{
  "max_scroll_attempts": 50,
  "scroll_delay_ms": 2000,
  "stability_threshold": 3,
  "page_load_timeout": 30000,
  "max_items_per_category": null,
  "concurrent_crawlers": 3,
  "retry_on_failure": true,
  "max_retries": 3,
  "headless": true,
  "stealth_mode": true
}
```

---

## Operation Modes

### 1. **API-Triggered Crawls** (Production)

Crawler jobs initiated via backend API from dashboard.

```python
# Backend API call
POST /api/crawler/start
{
  "retailer": "keells",
  "category": "vegetables",
  "job_id": "uuid-here",
  "callback_url": "http://backend:5001/api/crawler/callback"
}
```

---

### 2. **Manual Execution** (Development)

Direct script execution for testing or ad-hoc runs.

```bash
# Single crawler
python keells/keells_vegetables_crawler.py

# With custom output
python keells/keells_vegetables_crawler.py --output /custom/path
```

---

### 3. **Scheduled Execution** (Automated)

Managed by backend's `CrawlerScheduler` (see `backend/features/crawler/service/crawler_scheduler.py`).

Schedule types:
- **One-time**: Execute once at specified datetime
- **Daily**: Run every day at specific time
- **Weekly**: Run on specific days of week
- **Interval**: Run every N hours

---

### 4. **Batch Testing** (QA)

Run all crawlers for comprehensive testing.

```bash
# All Keells categories
pytest tests/test_all_keells_crawlers.py -v

# All Cargills categories
pytest tests/test_all_cargills_crawlers.py -v

# Parallel execution (4 workers)
pytest tests/ -n 4
```

---

## Monitoring & Logging

### Structured Logging

All crawlers use the backend's `logger_service` for consistent JSON logging.

**Log Format:**
```json
{
  "timestamp": "2026-02-09T15:30:45.123Z",
  "level": "INFO",
  "module": "keells_vegetables_crawler",
  "message": "Scroll attempt 5: Found 150 products",
  "context": {
    "retailer": "keells",
    "category": "vegetables",
    "job_id": "uuid-here",
    "product_count": 150
  }
}
```

**Log Destinations:**
- **Console**: Real-time during development
- **File**: `logs/crawler.json.log` (JSON format)
- **Fluent Bit**: Forwarded to OpenSearch for centralized logging
- **OpenSearch Dashboards**: Query, visualize, and alert on logs

---

### Log Aggregation Pipeline

```
Crawler (Python)
    │
    └─> logs/crawler.json.log
           │
           └─> Fluent Bit (Container)
                  │
                  └─> OpenSearch (Port 9200)
                         │
                         └─> OpenSearch Dashboards (Port 5601)
```

**Useful Queries:**
```
# Failed crawl jobs
level: "ERROR" AND module: keells_* OR cargills_*

# Scroll performance issues
message: "Scroll attempt" AND context.product_count: >1000

# Firebase upload failures
message: "upload failed"
```

---

### Job Status Tracking

Monitor active crawl jobs via backend API:

```bash
# List all jobs
curl http://localhost:5001/api/crawler/jobs

# Get specific job status
curl http://localhost:5001/api/crawler/jobs/{job_id}

# Stop running job
curl -X POST http://localhost:5001/api/crawler/jobs/{job_id}/stop
```

**Job Statuses:**
- `pending` - Queued, not yet started
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Error occurred
- `stopped` - Manually terminated
- `timeout` - Exceeded maximum duration

---

## Testing

### Test Suite Overview

Comprehensive testing framework with 100+ test cases covering:
- Individual crawler functionality
- Scroll logic and pagination
- LLM extraction accuracy
- Error handling and retries
- File system operations
- Firebase uploads

### Running Tests

```bash
# Install test dependencies
pip install -r requirements-dev.txt

# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_all_keells_crawlers.py -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Parallel execution (faster)
pytest tests/ -n auto
```

### Test Documentation

See `tests/docs/` for detailed testing guides:
- [AUTOMATED_TESTING_SETUP.md](tests/docs/AUTOMATED_TESTING_SETUP.md) - Initial setup
- [COMPREHENSIVE_TEST_GUIDE.md](tests/docs/COMPREHENSIVE_TEST_GUIDE.md) - Full guide
- [TESTING_GUIDE.md](tests/docs/TESTING_GUIDE.md) - Quick start
- [QUICK_REFERENCE.md](tests/docs/QUICK_REFERENCE.md) - Command reference

---

## Deployment

### Docker Deployment (Recommended)

```bash
# Build crawler container
docker-compose build crawler

# Start crawler service
docker-compose up -d crawler

# Start with file watcher
docker-compose up -d crawler file-watcher

# View logs
docker-compose logs -f crawler

# Stop services
docker-compose down
```

### Kubernetes Deployment

See `../k8s/README.md` for complete Kubernetes setup.

**Key Resources:**
- **Deployment**: `k8s/05-crawler.yaml` (1 replica, resource limits)
- **ConfigMap**: Crawler settings and environment variables
- **PersistentVolume**: 5Gi for output files and SQLite cache
- **Service**: ClusterIP for internal communication

**Scaling:**
```bash
# Scale crawler workers
kubectl scale deployment crawler --replicas=3

# Update crawler image
kubectl set image deployment/crawler crawler=shopple-crawler:v2.0
```

---

## Troubleshooting

### Common Issues

#### 1. **"Chromium not found" Error**
- **Cause**: Playwright browser not installed
- **Solution**: Run `playwright install chromium`
- **Docker**: Already included in `Dockerfile.crawler`

#### 2. **Scroll Timeout - No New Products**
- **Cause**: Infinite scroll not triggering or page fully loaded
- **Solution**: Check `scroll_delay_ms` in settings (increase to 3000+)
- **Debug**: Run with `headless=False` to observe browser behavior

#### 3. **LLM Extraction Returns Empty Results**
- **Cause**: Invalid Groq API key or rate limit exceeded
- **Solution**: Verify `GROQ_API_KEY` environment variable
- **Check**: Test API key with `curl` to Groq endpoint

#### 4. **Firebase Upload Failed**
- **Cause**: Missing Firebase credentials or incorrect permissions
- **Solution**: Verify `FIREBASE_PRIVATE_KEY` is properly escaped
- **Check**: Test with `firebase_storage_manager.py` directly

#### 5. **Products Not Appearing in Backend**
- **Cause**: FileWatcher not running or callback URL incorrect
- **Solution**: Ensure file-watcher container is running
- **Check**: Verify `callback_url` in job submission

#### 6. **High Memory Usage**
- **Cause**: Too many concurrent crawlers or large product sets
- **Solution**: Reduce `concurrent_crawlers` in settings
- **Resource Limits**: Set Docker memory limit (`deploy.resources.limits.memory`)

---

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Environment variable
export LOG_LEVEL=DEBUG

# Run crawler with debug output
python keells/keells_vegetables_crawler.py --debug

# View detailed scroll logs
tail -f logs/crawler.json.log | grep "Scroll attempt"
```

---

### Performance Tuning

**For Faster Crawls:**
```json
{
  "scroll_delay_ms": 1000,          // Reduce wait between scrolls
  "stability_threshold": 2,          // Fewer stability checks
  "concurrent_crawlers": 5           // More parallel jobs
}
```

**For More Reliable Crawls:**
```json
{
  "scroll_delay_ms": 3000,          // Longer wait for lazy loading
  "stability_threshold": 5,          // More thorough stability check
  "max_retries": 5,                  // More retry attempts
  "headless": false                  // Visual debugging
}
```

---

## Contributing

### Development Workflow

1. Create feature branch: `git checkout -b feature/new-crawler`
2. Add crawler in appropriate folder (`keells/` or `cargills/`)
3. Inherit from base crawler class
4. Implement required methods (URL, category name)
5. Add tests in `tests/`
6. Test with `pytest tests/test_your_crawler.py -v`
7. Submit PR with test results

### Crawler Template

```python
from keells_base_crawler import KeellsBaseCrawler

class KeellsNewCategoryCrawler(KeellsBaseCrawler):
    def __init__(self):
        super().__init__()
        self.retailer = "keells"
        self.category = "new-category"
        self.url = "https://www.keellssuper.com/new-category"
        self.output_filename = "keells_new_category"

if __name__ == "__main__":
    crawler = KeellsNewCategoryCrawler()
    asyncio.run(crawler.run())
```


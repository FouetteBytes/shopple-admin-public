# Comprehensive Keells Crawler Test Suite

## Overview

This comprehensive test suite tests **all 9 Keells crawlers** in a single test run and generates detailed metrics for each crawler, along with a unified Slack notification showing the results of all crawlers.

## Architecture

### 1. Base Crawler (`keells_base_crawler.py`)
- **Single source of truth** for all Keells crawling logic
- 391 lines of reusable code
- All 9 crawlers inherit from this base class
- Handles pagination, product extraction, progress tracking, and file saving

### 2. Simplified Crawlers (9 files)
Each crawler is now only ~20 lines:
- `keells_beverages_crawler.py`
- `keells_chilled_products_crawler.py`
- `keells_frozen_food_crawler.py`
- `keells_fruits_crawler.py`
- `keells_groceries_crawler.py`
- `keells_household_essentials_crawler.py`
- `keells_meat_crawler.py`
- `keells_seafood_crawler.py`
- `keells_vegetables_crawler.py`

Each crawler only needs to define:
- URL (e.g., `https://www.keellssuper.com/beverages`)
- Category name (e.g., `beverages`)

### 3. Comprehensive Test Suite (`test_all_keells_crawlers.py`)

#### Key Components:

**KEELLS_CRAWLERS Dictionary:**
```python
KEELLS_CRAWLERS = {
    "beverages": {
        "name": "Beverages",
        "url": "https://www.keellssuper.com/beverages",
        "category": "beverages"
    },
    # ... 8 more crawlers
}
```

**CrawlerTestResults Class:**
- Aggregates results from all crawler runs
- Generates comprehensive summary text
- Exports JSON with all metrics

**Main Test: `test_all_keells_crawlers()`:**
1. Loops through all 9 crawlers
2. Creates `KeellsBaseCrawler` instance for each
3. Runs `await crawler.run()`
4. Validates output file exists
5. Extracts metrics:
   - Product count
   - Duration (seconds)
   - File size (KB)
   - Sample products (first 3)
6. Stores results with success/failure status
7. Saves `test_results_summary.json`
8. Prints comprehensive summary
9. Fails test if any crawler failed

## Test Output

### JSON Output (`test_results_summary.json`)

```json
{
  "summary": {
    "total_crawlers": 9,
    "successful": 9,
    "failed": 0,
    "total_products": 90,
    "total_duration": 120.5,
    "timestamp": "2025-01-03T10:30:00"
  },
  "results": {
    "beverages": {
      "status": "success",
      "product_count": 10,
      "duration": 12.3,
      "file_size_kb": 45.2,
      "samples": ["Product 1", "Product 2", "Product 3"]
    },
    "chilled_products": { ... },
    "frozen_food": { ... },
    "fruits": { ... },
    "groceries": { ... },
    "household_essentials": { ... },
    "meat": { ... },
    "seafood": { ... },
    "vegetables": { ... }
  }
}
```

### Console Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Comprehensive Keells Crawler Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PASSED: Beverages
   Products: 10 | Duration: 12.3s | Size: 45.2 KB
   Sample: Product 1, Product 2, Product 3

✅ PASSED: Chilled Products
   Products: 10 | Duration: 11.8s | Size: 42.1 KB
   Sample: Product 1, Product 2, Product 3

... (7 more crawlers)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 OVERALL SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Crawlers:  9
Successful:      9 ✅
Failed:          0 ❌
Total Products:  90
Total Duration:  120.5s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## GitHub Actions Integration

### Workflow: `.github/workflows/crawler-tests.yml`

#### Job: `test-all-keells-crawlers`
1. Sets up Python 3.11
2. Installs dependencies (crawler requirements, pytest, Playwright)
3. Runs comprehensive test with `MAX_ITEMS=10` per crawler
4. Extracts metrics from `test_results_summary.json`
5. Uploads test results as artifacts

#### Job: `notify-comprehensive`
1. Downloads test results artifact
2. Parses `test_results_summary.json`
3. Builds comprehensive Slack message
4. Sends single notification with all 9 crawler results

### Slack Notification Format

```
✅ Comprehensive Keells Crawler Test Results

Total Crawlers: 9
Successful: 9 ✅
Failed: 0 ❌
Total Products: 90
Total Duration: 2m 0s
Branch: main

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Individual Crawler Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Beverages:
✅ 10 products | 12.3s | 45.2 KB

Chilled Products:
✅ 10 products | 11.8s | 42.1 KB

Frozen Food:
✅ 10 products | 13.1s | 48.5 KB

... (6 more crawlers)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Workflow: Crawler Tests | Triggered by: username | View Logs
```

## Running Tests Locally

### Run All Crawlers (Comprehensive Test)
```bash
cd crawler/tests
pytest test_all_keells_crawlers.py::TestAllKeellsCrawlers::test_all_keells_crawlers -v -s
```

### With Custom MAX_ITEMS
```bash
MAX_ITEMS=20 pytest test_all_keells_crawlers.py::TestAllKeellsCrawlers::test_all_keells_crawlers -v -s
```

### Run Individual Crawler (Legacy Test)
```bash
pytest test_keells_beverages.py -v -s
```

## Environment Variables

- `MAX_ITEMS`: Number of products to scrape per crawler (default: 100)
  - In CI/CD: Set to 10 for faster tests (9 crawlers × 10 = 90 total products)
  - Locally: Can be increased for more comprehensive testing
- `HEADLESS_MODE`: Set to `false` to see browser during testing (default: auto-detect CI)

## File Outputs

### Timestamped Files
Each crawler generates a timestamped output file:
- Format: `keells_{category}_{YYYYMMDD_HHMMSS}.json`
- Example: `keells_beverages_20250103_103000.json`
- Location: `crawler/test_output/keells/{category}/`

### Test Results Summary
- File: `crawler/test_output/keells/test_results_summary.json`
- Contains aggregated metrics for all 9 crawlers
- Used by GitHub Actions for Slack notifications

## Benefits of Comprehensive Testing

### ✅ Single Test Run
- All 9 crawlers tested in one go
- No need to run separate tests for each crawler
- Faster CI/CD pipeline (parallel execution possible in future)

### ✅ Unified Reporting
- Single Slack notification with all results
- Easy to see which crawlers passed/failed at a glance
- Comprehensive metrics for all categories

### ✅ Code Reusability
- Base crawler tested once, benefits all 9 crawlers
- DRY principle: 93% code reduction (3000→200 lines)
- Easy to add new crawlers (just add URL + category)

### ✅ Comprehensive Metrics
- Total products across all categories
- Total duration for all crawlers
- Individual crawler performance comparison
- Sample products for validation

### ✅ Better Debugging
- See which specific crawler failed
- Compare performance across categories
- Identify bottlenecks or issues quickly

## Adding New Crawlers

To add a new Keells category crawler:

1. **Create crawler file** (e.g., `keells_snacks_crawler.py`):
```python
import asyncio
from keells_base_crawler import crawl_keells_category

async def main(test_mode: bool = False):
    url = "https://www.keellssuper.com/snacks"
    category = "snacks"
    return await crawl_keells_category(url, category, test_mode)

if __name__ == "__main__":
    asyncio.run(main())
```

2. **Add to KEELLS_CRAWLERS dict** in `test_all_keells_crawlers.py`:
```python
KEELLS_CRAWLERS = {
    # ... existing crawlers
    "snacks": {
        "name": "Snacks",
        "url": "https://www.keellssuper.com/snacks",
        "category": "snacks"
    }
}
```

3. **Update Slack notification** in `.github/workflows/crawler-tests.yml`:
Add `snacks` to the crawler list in the `Parse Comprehensive Test Results` step.

That's it! The new crawler will automatically be tested and reported.

## Troubleshooting

### Test Fails with "No output file generated"
- Check that the crawler is producing output to `test_output/keells/{category}/`
- Verify the timestamped filename pattern matches: `keells_{category}_*.json`

### Slack Notification Not Received
- Verify `SLACK_WEBHOOK_URL` secret is configured in GitHub repository settings
- Check GitHub Actions logs for curl command output
- Validate Slack webhook URL is correct

### Some Crawlers Fail
- Check individual crawler logs in GitHub Actions
- Look at the `test_results_summary.json` artifact for detailed error messages
- Run failing crawler locally with `pytest -v -s` for detailed output

### MAX_ITEMS Not Applied
- Verify environment variable is set before running tests
- Check that base crawler reads `os.getenv("MAX_ITEMS")` correctly
- Confirm GitHub Actions passes `MAX_ITEMS` env var to test step

## Summary

The comprehensive test suite provides:
- **Single source of truth**: Base crawler eliminates duplication
- **Comprehensive testing**: All 9 crawlers in one test run
- **Unified reporting**: Single Slack notification with all results
- **Detailed metrics**: Product counts, durations, file sizes, samples
- **Easy maintenance**: Add new crawlers with just URL + category
- **Better debugging**: Individual crawler results at a glance

This architecture makes it easy to scale to additional categories and maintain consistent crawling behavior across all Keells product categories.

"""Comprehensive test suite for all Keells crawlers.

Runs all nine Keells crawlers and produces a report with category metrics.
Uses the base crawler to test each category with its URL.

Benefits:
- Single test file for all crawlers.
- Tests the base crawler implementation with live data.
- Generates metrics for each category.
- Supports CI reporting with summary output.
"""

import pytest
import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

# Add the parent directory to the path for imports.
sys.path.insert(0, str(Path(__file__).parent.parent / "keells"))

# Import the base crawler.
from keells_base_crawler import KeellsBaseCrawler, Product

# Check whether pytest is available.
PYTEST_AVAILABLE = True
try:
    import pytest
except ImportError:
    PYTEST_AVAILABLE = False
    print("⚠️  pytest not installed. Install with: pip install pytest pytest-asyncio")


# Define all Keells crawler configurations.
KEELLS_CRAWLERS = {
    "beverages": {
        "name": "Beverages",
        "url": "https://www.keellssuper.com/beverages",
        "category": "beverages"
    },
    "chilled_products": {
        "name": "Chilled Products",
        "url": "https://www.keellssuper.com/chilled-products",
        "category": "chilled_products"
    },
    "frozen_food": {
        "name": "Frozen Food",
        "url": "https://www.keellssuper.com/frozen-food",
        "category": "frozen_food"
    },
    "fruits": {
        "name": "Fresh Fruits",
        "url": "https://www.keellssuper.com/fresh-fruits",
        "category": "fruits"
    },
    "groceries": {
        "name": "Groceries",
        "url": "https://www.keellssuper.com/grocery",
        "category": "groceries"
    },
    "household_essentials": {
        "name": "Household Essentials",
        "url": "https://www.keellssuper.com/household-essentials",
        "category": "household_essentials"
    },
    "meat": {
        "name": "Meat Shop",
        "url": "https://www.keellssuper.com/keells-meat-shop",
        "category": "meat"
    },
    "seafood": {
        "name": "Fresh Seafood",
        "url": "https://www.keellssuper.com/fresh-fish",
        "category": "seafood"
    },
    "vegetables": {
        "name": "Fresh Vegetables",
        "url": "https://www.keellssuper.com/fresh-vegetables",
        "category": "vegetables"
    }
}


class CrawlerTestResults:
    """Store and manage test results for all crawlers."""
    
    def __init__(self):
        self.results: Dict[str, Dict[str, Any]] = {}
        self.total_duration = 0
        self.total_products = 0
        self.successful_crawlers = 0
        self.failed_crawlers = 0
    
    def add_result(self, category: str, result: Dict[str, Any]):
        """Add a crawler result."""
        self.results[category] = result
        
        if result.get("success"):
            self.successful_crawlers += 1
            self.total_products += result.get("product_count", 0)
            self.total_duration += result.get("duration", 0)
        else:
            self.failed_crawlers += 1
    
    def get_summary(self) -> str:
        """Get a text summary of all results."""
        total = len(self.results)
        summary = [
            "=" * 80,
            f" KEELLS CRAWLER TEST RESULTS SUMMARY",
            "=" * 80,
            f"Total Crawlers Tested: {total}",
            f"✅ Successful: {self.successful_crawlers}",
            f"❌ Failed: {self.failed_crawlers}",
            f" Total Products Scraped: {self.total_products}",
            f"⏱️  Total Duration: {self.total_duration:.2f}s",
            "=" * 80,
            ""
        ]
        
        # Add individual results.
        for category, result in self.results.items():
            config = KEELLS_CRAWLERS[category]
            status = "✅" if result.get("success") else "❌"
            summary.append(f"{status} {config['name']}:")
            
            if result.get("success"):
                summary.append(f"   Products: {result['product_count']}")
                summary.append(f"   Duration: {result['duration']:.2f}s")
                summary.append(f"   File: {result['output_file']}")
                
                # Show sample products.
                samples = result.get("samples", [])[:2]
                if samples:
                    summary.append(f"   Samples:")
                    for sample in samples:
                        # Samples are already formatted as strings.
                        summary.append(f"      • {sample}")
            else:
                summary.append(f"   Error: {result.get('error', 'Unknown error')}")
            
            summary.append("")
        
        return "\n".join(summary)
    
    def to_json(self) -> str:
        """Export results as JSON."""
        return json.dumps({
            "summary": {
                "total_crawlers": len(self.results),
                "successful": self.successful_crawlers,
                "failed": self.failed_crawlers,
                "total_products": self.total_products,
                "total_duration": round(self.total_duration, 2),
                "timestamp": datetime.now().isoformat()
            },
            "results": self.results
        }, indent=2)


if PYTEST_AVAILABLE:
    class TestAllKeellsCrawlers:
        """Automated test suite for all Keells crawlers."""
        
        @pytest.fixture
        def test_output_dir(self):
            """Return the test output directory."""
            return Path(__file__).parent.parent / "test_output" / "keells"
        
        @pytest.fixture
        def crawler_config(self):
            """Return crawler configuration with a MAX_ITEMS test limit."""
            max_items = os.getenv('MAX_ITEMS', '10')  # Default 10 for faster tests.
            return {
                'max_items': int(max_items) if max_items.isdigit() else 10,
                'test_mode': True
            }
        
        @pytest.fixture
        def results_tracker(self):
            """Create a results tracker."""
            return CrawlerTestResults()
        
        @pytest.mark.asyncio
        async def test_base_crawler_initialization(self):
            """Verify that the base crawler can be imported and initialized."""
            try:
                crawler = KeellsBaseCrawler(
                    url="https://www.keellssuper.com/beverages",
                    category="beverages",
                    test_mode=True
                )
                assert crawler is not None
                assert crawler.url == "https://www.keellssuper.com/beverages"
                assert crawler.category == "beverages"
                config = crawler._get_browser_config()
                assert config.use_managed_browser is False
                assert Product is not None
                print("✅ Base crawler initialization test passed")
            except Exception as e:
                pytest.fail(f"Failed to initialize base crawler: {e}")
        
        @pytest.mark.asyncio
        async def test_all_keells_crawlers(self, crawler_config, test_output_dir, results_tracker):
            """Run all Keells crawlers sequentially and collect metrics."""
            print(f"\n Running comprehensive test for all {len(KEELLS_CRAWLERS)} Keells crawlers")
            print(f"   Max items per crawler: {crawler_config['max_items']}")
            print(f"   Test mode: {crawler_config['test_mode']}")
            print("=" * 80)
            
            failed_categories = []
            
            for category_key, config in KEELLS_CRAWLERS.items():
                print(f"\n{'='*80}")
                print(f" Testing: {config['name']} ({category_key})")
                print(f"   URL: {config['url']}")
                print(f"{'='*80}")
                
                start_time = datetime.now()
                
                try:
                    # Create the crawler instance.
                    crawler = KeellsBaseCrawler(
                        url=config['url'],
                        category=config['category'],
                        test_mode=True
                    )
                    
                    # Run the crawler.
                    output_file = await crawler.run()
                    
                    # Calculate duration.
                    duration = (datetime.now() - start_time).total_seconds()
                    
                    # Find the output file.
                    category_dir = test_output_dir / config['category']
                    output_files = list(category_dir.glob(f"keells_{config['category']}_*.json"))
                    
                    if not output_files:
                        raise FileNotFoundError(f"No output file found in {category_dir}")
                    
                    # Select the most recent file.
                    actual_output_file = max(output_files, key=lambda p: p.stat().st_mtime)
                    
                    # Validate output.
                    with open(actual_output_file, 'r', encoding='utf-8') as f:
                        products = json.load(f)
                    
                    assert isinstance(products, list), "Output should be a list"
                    assert len(products) > 0, "Should have at least 1 product"
                    assert len(products) <= crawler_config['max_items'], "Should not exceed max_items"
                    
                    # Get file size.
                    file_size = actual_output_file.stat().st_size
                    file_size_kb = file_size / 1024
                    
                    # Get file timestamp.
                    file_timestamp = datetime.fromtimestamp(actual_output_file.stat().st_mtime).isoformat()
                    
                    # Extract sample product names (first three).
                    samples = [
                        f"{p['product_name']} - {p['price']}"
                        for p in products[:3]
                    ]
                    
                    # Store results.
                    result = {
                        "status": "success",
                        "success": True,
                        "product_count": len(products),
                        "duration": round(duration, 2),
                        "output_file": actual_output_file.name,
                        "filename": actual_output_file.name,
                        "file_size": file_size,
                        "file_size_kb": round(file_size_kb, 2),
                        "samples": samples,  # String samples, not objects.
                        "timestamp": file_timestamp,
                        "url": config['url']
                    }
                    
                    results_tracker.add_result(category_key, result)
                    
                    print(f"✅ {config['name']} completed successfully!")
                    print(f"   Products scraped: {len(products)}")
                    print(f"   Duration: {duration:.2f}s")
                    print(f"   File: {actual_output_file.name} ({file_size_kb:.2f}KB)")
                    
                    # Show samples.
                    print(f"   Sample products:")
                    for i, product in enumerate(products[:2], 1):
                        print(f"      {i}. {product['product_name']} - {product['price']}")
                    
                except Exception as e:
                    duration = (datetime.now() - start_time).total_seconds()
                    error_msg = str(e)
                    
                    print(f"❌ {config['name']} failed!")
                    print(f"   Error: {error_msg}")
                    print(f"   Duration: {duration:.2f}s")
                    
                    # Store the failure result.
                    results_tracker.add_result(category_key, {
                        "status": "failed",
                        "success": False,
                        "error": error_msg,
                        "duration": round(duration, 2),
                        "product_count": 0,
                        "file_size_kb": 0,
                        "samples": [],
                        "url": config['url']
                    })
                    
                    failed_categories.append(category_key)
            
            # Print summary.
            print("\n")
            print(results_tracker.get_summary())
            
            # Always save results to JSON for GitHub Actions (even on failure).
            try:
                results_file = test_output_dir / "test_results_summary.json"
                results_file.parent.mkdir(parents=True, exist_ok=True)
                
                # Debug: print absolute path.
                print(f" Saving results to: {results_file.absolute()}")
                print(f" Directory exists: {results_file.parent.exists()}")
                
                with open(results_file, 'w', encoding='utf-8') as f:
                    f.write(results_tracker.to_json())
                
                print(f"✅ Results saved successfully!")
                print(f" File size: {results_file.stat().st_size} bytes")
                
                # Verify that the file was written.
                if results_file.exists():
                    with open(results_file, 'r') as f:
                        content = f.read()
                        print(f"✅ Verified: File contains {len(content)} characters")
                else:
                    print(f"❌ WARNING: File does not exist after writing!")
                    
            except Exception as e:
                print(f"❌ ERROR saving results: {e}")
                import traceback
                traceback.print_exc()
            
            # Assert overall success.
            if failed_categories:
                pytest.fail(
                    f"❌ {len(failed_categories)} crawler(s) failed: {', '.join(failed_categories)}\n\n"
                    f"Successful: {results_tracker.successful_crawlers}/{len(KEELLS_CRAWLERS)}"
                )
            
            print(f"\n All {len(KEELLS_CRAWLERS)} crawlers passed successfully!")


# Run tests directly if executed as a script.
if __name__ == "__main__":
    if not PYTEST_AVAILABLE:
        print("❌ pytest is required to run tests")
        print("   Install with: pip install pytest pytest-asyncio")
        sys.exit(1)
    
    # Run with pytest.
    import pytest
    sys.exit(pytest.main([__file__, "-v", "-s"]))

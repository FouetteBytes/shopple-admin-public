"""Comprehensive test suite for all Cargills crawlers.

Runs all eight Cargills category crawlers in a single pass and generates
a summary with detailed metrics for each crawler.
"""

import pytest
import asyncio
import os
import json
from pathlib import Path
from datetime import datetime

# Import the base crawler.
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "cargills"))
from cargills_base_crawler import CargillsBaseCrawler

# Configuration for all Cargills crawlers.
CARGILLS_CRAWLERS = {
    "beverages": {
        "name": "Beverages",
        "url": "https://cargillsonline.com/Product/Beverages?IC=Mw==&NC=QmV2ZXJhZ2Vz",
        "category": "beverages"
    },
    "dairy": {
        "name": "Dairy",
        "url": "https://cargillsonline.com/Product/Dairy?IC=Ng==&NC=RGFpcnk=",
        "category": "dairy"
    },
    "frozen_foods": {
        "name": "Frozen Foods",
        "url": "https://cargillsonline.com/Product/Frozen-Food?IC=OA==&NC=RnJvemVuIEZvb2Q=",
        "category": "frozen_foods"
    },
    "fruits": {
        "name": "Fruits",
        "url": "https://cargillsonline.com/Product/Fruits?IC=OQ==&NC=RnJ1aXRz",
        "category": "fruits"
    },
    "household": {
        "name": "Household",
        "url": "https://cargillsonline.com/Product/Household?IC=MTA=&NC=SG91c2Vob2xk",
        "category": "household"
    },
    "meats": {
        "name": "Meats",
        "url": "https://cargillsonline.com/Product/Meats?IC=MTE=&NC=TWVhdHM=",
        "category": "meats"
    },
    "seafood": {
        "name": "Seafood",
        "url": "https://cargillsonline.com/Product/Seafood?IC=MTk=&NC=U2VhZm9vZA==",
        "category": "seafood"
    },
    "vegetables": {
        "name": "Vegetables",
        "url": "https://cargillsonline.com/Product/Vegetables?IC=MjM=&NC=VmVnZXRhYmxlcw==",
        "category": "vegetables"
    }
}


class CrawlerTestResults:
    """Aggregate test results for all crawlers."""
    
    def __init__(self):
        self.results = {}
        self.total_crawlers = len(CARGILLS_CRAWLERS)
        self.successful = 0
        self.failed = 0
        self.total_products = 0
        self.total_duration = 0.0
        self.timestamp = datetime.now().isoformat()
    
    def add_result(self, category: str, success: bool, product_count: int = 0,
                   duration: float = 0.0, filename: str = "", 
                   file_size_kb: float = 0.0, samples: list = None, error: str = "",
                   timestamp: str = ""):
        """Add a crawler result."""
        self.results[category] = {
            "status": "success" if success else "failed",
            "product_count": product_count,
            "duration": round(duration, 2),
            "filename": filename,
            "file_size_kb": round(file_size_kb, 2),
            "samples": samples[:3] if samples else [],
            "timestamp": timestamp,
            "error": error
        }
        
        if success:
            self.successful += 1
            self.total_products += product_count
        else:
            self.failed += 1
        
        self.total_duration += duration
    
    def get_summary(self) -> str:
        """Generate a text summary."""
        lines = [
            "=" * 80,
            " CARGILLS CRAWLER TEST RESULTS SUMMARY",
            "=" * 80,
            f"Total Crawlers Tested: {self.total_crawlers}",
            f"✅ Successful: {self.successful}",
            f"❌ Failed: {self.failed}",
            f" Total Products Scraped: {self.total_products}",
            f"⏱️  Total Duration: {self.total_duration:.2f}s",
            "=" * 80
        ]
        
        for category, result in self.results.items():
            status_icon = "✅" if result["status"] == "success" else "❌"
            display_name = CARGILLS_CRAWLERS[category]["name"]
            
            lines.append(f"{status_icon} {display_name}:")
            
            if result["status"] == "success":
                lines.append(f"   Products: {result['product_count']}")
                lines.append(f"   Duration: {result['duration']}s")
                lines.append(f"   File: {result['filename']}")
                if result['samples']:
                    lines.append(f"   Samples:")
                    for sample in result['samples']:
                        lines.append(f"      • {sample}")
            else:
                lines.append(f"   Error: {result['error']}")
        
        return "\n".join(lines)
    
    def to_json(self) -> dict:
        """Export results as JSON."""
        return {
            "summary": {
                "total_crawlers": self.total_crawlers,
                "successful": self.successful,
                "failed": self.failed,
                "total_products": self.total_products,
                "total_duration": round(self.total_duration, 2),
                "timestamp": self.timestamp
            },
            "results": self.results
        }


class TestAllCargillsCrawlers:
    """Comprehensive test suite for all Cargills crawlers."""
    
    @pytest.mark.asyncio
    async def test_base_crawler_initialization(self):
        """Verify that the base crawler can be initialized."""
        crawler = CargillsBaseCrawler(
            url="https://cargillsonline.com/Product/Beverages?IC=Mw==&NC=QmV2ZXJhZ2Vz",
            category="beverages",
            test_mode=True
        )
        assert crawler.category == "beverages"
        assert crawler.test_mode == True
        assert crawler.session_id.startswith("cargills_beverages_session")
        browser_config = crawler._get_browser_config()
        assert browser_config.use_managed_browser is False
    
    @pytest.mark.asyncio
    async def test_all_cargills_crawlers(self):
        """Run all eight Cargills crawlers and collect metrics."""
        print("\n Running comprehensive test for all 8 Cargills crawlers")
        
        # Read MAX_ITEMS from the environment (default 10 for tests).
        max_items = int(os.getenv("MAX_ITEMS", "10"))
        print(f"   Max items per crawler: {max_items}")
        print(f"   Test mode: True")
        
        # Results tracker.
        results_tracker = CrawlerTestResults()
        
        # Test output directory.
        base_test_dir = Path(__file__).parent.parent / "test_output" / "cargills"
        base_test_dir.mkdir(parents=True, exist_ok=True)
        
        # Run each crawler sequentially.
        for crawler_key, crawler_config in CARGILLS_CRAWLERS.items():
            print("\n" + "=" * 80)
            print(f" Testing: {crawler_config['name']} ({crawler_key})")
            print(f"   URL: {crawler_config['url']}")
            print("=" * 80)
            
            start_time = datetime.now()
            
            try:
                # Create the crawler instance.
                crawler = CargillsBaseCrawler(
                    url=crawler_config['url'],
                    category=crawler_key,
                    test_mode=True
                )
                
                # Run the crawler.
                result = await crawler.run()
                
                # Confirm successful execution.
                assert result['success'], f"Crawler failed: {result.get('error', 'Unknown error')}"
                
                # Verify the output file exists.
                output_dir = Path(result['output_path'])
                output_file = output_dir / result['filename']
                assert output_file.exists(), f"Output file not found: {output_file}"
                
                # Load and validate products.
                with open(output_file, 'r', encoding='utf-8') as f:
                    products = json.load(f)
                
                product_count = len(products)
                assert product_count > 0, "No products were scraped"
                assert product_count <= max_items, f"Too many products: {product_count} > {max_items}"
                
                # Get file size.
                file_size_kb = output_file.stat().st_size / 1024
                
                # Extract sample product names.
                samples = [
                    f"{p['product_name']} - {p['price']}"
                    for p in products[:3]
                ]
                
                # Calculate duration.
                duration = (datetime.now() - start_time).total_seconds()
                
                # Get file timestamp.
                file_timestamp = datetime.fromtimestamp(output_file.stat().st_mtime).isoformat()
                
                # Record success.
                results_tracker.add_result(
                    category=crawler_key,
                    success=True,
                    product_count=product_count,
                    duration=duration,
                    filename=result['filename'],
                    file_size_kb=file_size_kb,
                    samples=samples,
                    timestamp=file_timestamp
                )
                
                print(f"✅ {crawler_config['name']} completed successfully!")
                print(f"   Products scraped: {product_count}")
                print(f"   Duration: {duration:.2f}s")
                print(f"   File: {result['filename']} ({file_size_kb:.2f}KB)")
                print(f"   Sample products:")
                for i, sample in enumerate(samples, 1):
                    print(f"      {i}. {sample}")
                
            except Exception as e:
                duration = (datetime.now() - start_time).total_seconds()
                error_msg = str(e)
                
                # Record failure.
                results_tracker.add_result(
                    category=crawler_key,
                    success=False,
                    duration=duration,
                    error=error_msg,
                    timestamp=datetime.now().isoformat()
                )
                
                print(f"❌ {crawler_config['name']} failed!")
                print(f"   Error: {error_msg}")
                print(f"   Duration: {duration:.2f}s")
        
        # Print the comprehensive summary.
        print("\n" + results_tracker.get_summary())
        
        # Save results to JSON.
        results_file = base_test_dir / "test_results_summary.json"
        with open(results_file, 'w', encoding='utf-8') as f:
            json.dump(results_tracker.to_json(), f, indent=2, ensure_ascii=False)
        
        print(f"\n Results saved to: {results_file}")
        
        # Assert that all crawlers passed.
        if results_tracker.failed > 0:
            print(f"\n❌ {results_tracker.failed} crawler(s) failed!")
            pytest.fail(f"{results_tracker.failed} out of {results_tracker.total_crawlers} crawlers failed")
        else:
            print(f"\n All {results_tracker.total_crawlers} crawlers passed successfully!")


if __name__ == "__main__":
    # Run tests directly.
    pytest.main([__file__, "-v", "-s"])

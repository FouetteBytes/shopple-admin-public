"""
Keells Base Crawler - Reusable crawler for all Keells categories

This base crawler implements the common pagination logic for all Keells categories.
Each specific crawler (beverages, groceries, etc.) only needs to provide:
1. URL
2. Category name for output filename

Benefits:
- Single source of truth for crawling logic
- Easy to update all crawlers when website structure changes
- Consistent progress indicators across all crawlers
- Less code duplication
"""

import os
import sys

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Fix Windows encoding issues
if sys.platform.startswith('win'):
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    sys.stdout.reconfigure(encoding='utf-8', errors='ignore')
    sys.stderr.reconfigure(encoding='utf-8', errors='ignore')

import asyncio
import json
import uuid
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

from crawl4ai import (
    AsyncWebCrawler,
    CrawlerRunConfig,
    BrowserConfig,
    CacheMode
)
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Product(BaseModel):
    """Product model for Keells products"""
    product_name: str = Field(..., description="The full name of the product")
    price: str = Field(..., description="The price of the product, including currency")
    image_url: Optional[str] = Field(None, description="The URL of the product image")


class KeellsBaseCrawler:
    """
    Base crawler for all Keells categories.
    
    Implements the complete pagination flow:
    1. Load initial page
    2. Click "View All" button
    3. Navigate through all pages
    4. Extract products from each page
    5. Save results to JSON file
    """
    
    def __init__(self, url: str, category: str, test_mode: bool = False):
        """
        Initialize the base crawler
        
        Args:
            url: The Keells category URL (e.g., "https://www.keellssuper.com/beverages")
            category: Category name for output file (e.g., "beverages")
            test_mode: If True, saves to test_output folder
        """
        self.url = url
        self.category = category
        self.test_mode = test_mode
        self.session_id = f"keells_{category}_session_{uuid.uuid4().hex}"
        
        # Get max items from environment
        _env_max = os.getenv("MAX_ITEMS")
        try:
            self.max_items = int(_env_max) if (_env_max and int(_env_max) > 0) else None
        except Exception:
            self.max_items = None
        
        self.all_products: List[Product] = []

    def _emit_status(self, message: str, level: str = "info", extra: Optional[Dict[str, Any]] = None):
        """Print status lines for the dashboard while keeping structured logs."""
        safe_message = message if isinstance(message, str) else str(message)
        try:
            print(safe_message, flush=True)
        except Exception:
            try:
                print(safe_message.encode('utf-8', errors='replace').decode('ascii', errors='ignore'), flush=True)
            except Exception:
                pass
        log_fn = getattr(logger, level, logger.info)
        try:
            if extra:
                log_fn(safe_message, extra=extra)
            else:
                log_fn(safe_message)
        except Exception:
            log_fn(safe_message)
    
    def _get_browser_config(self) -> BrowserConfig:
        """Configure browser based on environment"""
        is_ci = os.getenv("CI") == "true" or os.getenv("GITHUB_ACTIONS") == "true"
        user_headless_mode = os.getenv("HEADLESS_MODE", "").lower() == "true"
        force_managed_browser = os.getenv("FORCE_MANAGED_BROWSER", "").lower() == "true"

        headless = is_ci or self.test_mode or user_headless_mode

        if headless:
            source = "CI environment" if is_ci else "test mode" if self.test_mode else "HEADLESS_MODE preference"
            self._emit_status(f"[CONFIG]  Using headless mode ({source})")
        else:
            self._emit_status("[CONFIG] ️ Using visible browser mode")

        if force_managed_browser:
            self._emit_status("⚠️ FORCE_MANAGED_BROWSER enabled – crawlers will share the managed browser (use only for debugging)", level="warning")
        else:
            self._emit_status("[CONFIG]  Dedicated browser per crawler (managed browser disabled for isolation)")

        config_kwargs = {
            "headless": headless,
            "sleep_on_close": True,
            "use_managed_browser": force_managed_browser,
            "browser_mode": "dedicated",
            "verbose": headless or not force_managed_browser,
        }

        if headless and (is_ci or self.test_mode):
            config_kwargs["extra_args"] = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--disable-extensions",
            ]

        return BrowserConfig(**config_kwargs)
    
    async def _load_initial_page(self, crawler):
        """Phase 1: Load initial page and click 'View All' button"""
        self._emit_status(f"[PHASE 1] Loading {self.url} and clicking 'View All' button", extra={"phase": "1", "url": self.url})
        
        # Load initial page
        initial_load_config = CrawlerRunConfig(
            session_id=self.session_id,
            page_timeout=60000,
            wait_for="css:.product-card-containerV2"
        )
        await crawler.arun(url=self.url, config=initial_load_config)
        self._emit_status("[PHASE 1] Initial page content loaded.", level="debug", extra={"phase": "1"})
        
        # Scroll to reveal "View All" button
        scroll_config = CrawlerRunConfig(
            session_id=self.session_id,
            js_only=True,
            js_code="window.scrollTo(0, document.body.scrollHeight);"
        )
        await crawler.arun(url=self.url, config=scroll_config)
        await asyncio.sleep(2)
        self._emit_status("[PROGRESS] Scrolled to bottom to reveal 'View All' button.", level="debug")
        
        # Click "View All" button
        click_view_all_js = """
        (() => {
            const viewAllButton = document.querySelector('button.btn.btn-success');
            if (viewAllButton && viewAllButton.textContent.includes('View All')) {
                viewAllButton.click();
                return 'Clicked View All';
            }
            return 'View All button not found';
        })();
        """
        click_result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(session_id=self.session_id, js_only=True, js_code=click_view_all_js)
        )
        self._emit_status(f"[ACTION] View All button action: {click_result.js_execution_result}", extra={"result": click_result.js_execution_result})
        await asyncio.sleep(3)
        self._emit_status("[PROGRESS] Waiting for pagination to load...", level="debug")
    
    async def _extract_page_products(self, crawler) -> List[Product]:
        """Extract products from current page"""
        # First, wait for products to be visible
        wait_for_products_js = """
        (() => {
            return new Promise((resolve) => {
                const checkProducts = () => {
                    const products = document.querySelectorAll('.product-card-containerV2');
                    if (products.length > 0) {
                        resolve(`Found ${products.length} product cards`);
                    } else {
                        // Check again after a short delay
                        setTimeout(checkProducts, 500);
                    }
                };
                checkProducts();
                
                // Timeout after 10 seconds
                setTimeout(() => resolve('Timeout: No products found'), 10000);
            });
        })();
        """
        
        wait_config = CrawlerRunConfig(
            session_id=self.session_id,
            js_only=True,
            js_code=wait_for_products_js
        )
        wait_result = await crawler.arun(url=self.url, config=wait_config)
        if wait_result.js_execution_result:
            wait_message = wait_result.js_execution_result['results'][0]['result']
            self._emit_status(f"  Wait result: {wait_message}", level="debug")
        
        # Now extract products
        extract_js = """
        (() => {
            const products = [];
            const productCards = document.querySelectorAll('.product-card-containerV2');
            
            productCards.forEach(card => {
                try {
                    // Get product name
                    const nameEl = card.querySelector('.product-card-nameV2');
                    const product_name = nameEl ? nameEl.textContent.trim() : null;
                    
                    // Get final price ONLY (ignore crossed-out original price)
                    const priceEl = card.querySelector('.product-card-final-priceV2');
                    let price = null;
                    if (priceEl) {
                        // Get text and remove "/ Unit" or "/Unit"
                        price = priceEl.textContent.trim()
                            .replace(/\\/\\s*Unit/gi, '')  // Remove "/ Unit" or "/Unit"
                            .replace(/\\s+/g, ' ')         // Normalize whitespace
                            .trim();
                    }
                    
                    // Get image URL
                    const imgEl = card.querySelector('.product-card-image-containerV2 img');
                    const image_url = imgEl ? imgEl.src : null;
                    
                    // Only add if we have required fields
                    if (product_name && price) {
                        products.push({
                            product_name,
                            price,
                            image_url
                        });
                    }
                } catch (e) {
                    console.error('Error extracting product:', e);
                }
            });
            
            return products;
        })();
        """
        
        extract_config = CrawlerRunConfig(
            session_id=self.session_id,
            js_only=True,
            js_code=extract_js
        )
        page_result = await crawler.arun(url=self.url, config=extract_config)
        
        if page_result.success and page_result.js_execution_result:
            try:
                products_data = page_result.js_execution_result['results'][0]['result']
                if products_data and isinstance(products_data, list):
                    return [Product(**data) for data in products_data if data]
            except Exception as e:
                self._emit_status(f"[ERROR] Error extracting products: {e}", level="error")
                log_error(logger, e, context={"operation": "extract_products"})
        
        return []
    
    async def _navigate_next_page(self, crawler) -> bool:
        """Navigate to next page. Returns True if successful, False if no more pages."""
        next_page_js = """
        (() => {
            const buttons = Array.from(document.querySelectorAll('.page-number-button'));
            const currentActive = document.querySelector('.page-number-button.active');
            
            if (!currentActive) return 'No active page found';
            
            const currentPageNum = parseInt(currentActive.textContent);
            const nextButton = buttons.find(btn => parseInt(btn.textContent) === currentPageNum + 1);
            
            if (nextButton) {
                nextButton.click();
                return 'Clicked page ' + (currentPageNum + 1);
            }
            
            // Try arrow button if numbered button not found
            const arrowButton = document.querySelector('.page-number-button-arrow');
            if (arrowButton && !arrowButton.disabled) {
                arrowButton.click();
                return 'Clicked arrow to next page';
            }
            
            return 'No next page available';
        })();
        """
        
        next_result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(session_id=self.session_id, js_only=True, js_code=next_page_js)
        )
        
        next_action = next_result.js_execution_result['results'][0]['result'] if next_result.js_execution_result else 'Unknown'
        self._emit_status(f"  Navigation: {next_action}", level="debug")
        
        if 'No next page' in next_action:
            return False
        
        # Wait longer for page to load and products to render
        self._emit_status("  Waiting for page to load...", level="debug")
        await asyncio.sleep(5)  # Increased from 3 to 5 seconds
        return True
    
    async def _crawl_all_pages(self, crawler):
        """Phase 2: Navigate through all pages and extract products"""
        self._emit_status("\n[PHASE 2] Starting pagination: Extracting products from all pages...", extra={"phase": "2"})
        
        current_page = 1
        max_pages = 50  # Safety limit
        
        while current_page <= max_pages:
            self._emit_status(f"\n[PAGE {current_page}] Processing page {current_page}...", extra={"page": current_page})
            
            # Extract products from current page
            page_products = await self._extract_page_products(crawler)
            
            if page_products:
                self._emit_status(f"[PRODUCTS] Extracted {len(page_products)} products from page {current_page}", extra={"page": current_page, "products_count": len(page_products)})
                self.all_products.extend(page_products)
                self._emit_status(f"[PROGRESS] Total items found: {len(self.all_products)}", extra={"total_products": len(self.all_products)})
                
                # Check if we've reached the item limit
                if self.max_items and len(self.all_products) >= self.max_items:
                    self._emit_status(f"[COMPLETE] ✅ Reached target of {self.max_items} items. Stopping extraction.", extra={"target": self.max_items})
                    break
            else:
                self._emit_status(f"[WARNING] No products found on page {current_page}", level="warning", extra={"page": current_page})
            
            # Try to navigate to next page
            has_next = await self._navigate_next_page(crawler)
            if not has_next:
                self._emit_status("\n[COMPLETE] Reached last page. Extraction complete.")
                break
            
            current_page += 1
    
    def _save_results(self):
        """Phase 3: Save results to JSON file"""
        if not self.all_products:
            self._emit_status("\n[ERROR] Crawl Failed or No Content Extracted", level="error")
            return None
        
        self._emit_status("\n[PHASE 3] Processing and saving results...", extra={"phase": "3"})
        
        # Convert to dictionary list
        output_data = [product.model_dump() for product in self.all_products]
        
        # Trim to max items if specified
        if self.max_items:
            output_data = output_data[:self.max_items]
        
        # Convert to JSON
        final_json_output = json.dumps(output_data, indent=2)
        
        self._emit_status("\n" + "="*50)
        self._emit_status(f"[COMPLETE] CRAWL COMPLETE: Found and processed {len(output_data)} unique products", extra={"products_count": len(output_data)})
        self._emit_status("="*50 + "\n")
        
        # Log JSON to debug level
        logger.debug("Final JSON output", extra={"json_preview": final_json_output[:500]})
        
        # Determine output directory
        base_crawler_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        if self.test_mode:
            output_dir = os.path.join(base_crawler_dir, "test_output", "keells", self.category)
        else:
            output_dir = os.path.join(base_crawler_dir, "output", "keells", self.category)
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate timestamped filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = os.path.join(output_dir, f"keells_{self.category}_{timestamp}.json")
        
        # Save to file
        with open(output_filename, 'w', encoding='utf-8') as f:
            f.write(final_json_output)
        
        self._emit_status(f"\n[SAVE]  Product data saved to {output_filename}", extra={"filename": output_filename, "products_count": len(output_data)})
        
        if self.test_mode:
            self._emit_status("[INFO] (Test mode: saved to test_output folder)", level="debug")
        
        return output_filename
    
    async def run(self):
        """Main execution method - runs the complete crawl process"""
        self._emit_status(f"[INIT] Initializing Intelligent Agent Crawler for Keells {self.category.title()}...", extra={"category": self.category})
        
        if self.max_items:
            self._emit_status(f"[CONFIG] Target: {self.max_items} items", extra={"max_items": self.max_items})
            self._emit_status(f"Configuration: Scraping up to {self.max_items} items.")
        else:
            self._emit_status("Configuration: Scraping all available items on the page.")
        
        browser_config = self._get_browser_config()
        
        async with AsyncWebCrawler(config=browser_config) as crawler:
            # Phase 1: Load page and click "View All"
            await self._load_initial_page(crawler)
            
            # Phase 2: Extract from all pages
            await self._crawl_all_pages(crawler)
        
        # Phase 3: Save results
        output_file = self._save_results()
        
        return output_file


# Convenience function for backwards compatibility
async def crawl_keells_category(url: str, category: str, test_mode: bool = False):
    """
    Convenience function to crawl a Keells category
    
    Args:
        url: Category URL
        category: Category name (for output filename)
        test_mode: Whether to save to test_output folder
    
    Returns:
        Path to output file
    """
    crawler = KeellsBaseCrawler(url, category, test_mode)
    return await crawler.run()
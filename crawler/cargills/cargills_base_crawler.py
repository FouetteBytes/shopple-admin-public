"""Cargills base crawler.

Single source of truth for all Cargills category crawlers.

This base crawler handles:
1. Angular-based dynamic content loading.
2. Infinite scroll pagination.
3. Product extraction from Angular scope or DOM fallback.
4. Progress tracking.
5. Timestamped file outputs.
6. Test mode support.
"""
import os
import sys

# Add the backend path for logger_service.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
from services.system.logger_service import get_logger, log_error

logger = get_logger(__name__)

# Fix Windows encoding issues.
if sys.platform.startswith('win'):
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    sys.stdout.reconfigure(encoding='utf-8', errors='ignore')
    sys.stderr.reconfigure(encoding='utf-8', errors='ignore')

import asyncio
import json
import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, BrowserConfig


# --- Product model ---
class Product(BaseModel):
    product_name: str = Field(..., description="The full name of the product including unit size")
    price: str = Field(..., description="The price of the product")
    image_url: Optional[str] = Field(None, description="The URL of the product image")


class CargillsBaseCrawler:
    """
    Base crawler for all Cargills categories.
    Handles Angular-based dynamic content with infinite scroll.
    """
    
    def __init__(self, url: str, category: str, test_mode: bool = False):
        """Initialize the Cargills crawler.

        Args:
            url: Category URL (e.g., "https://cargillsonline.com/Product/Beverages?IC=Mw==&NC=QmV2ZXJhZ2Vz").
            category: Category name (e.g., "beverages", "dairy", "frozen_foods").
            test_mode: If True, save to the test_output folder.
        """
        self.url = url
        self.category = category
        self.test_mode = test_mode
        self.session_id = f"cargills_{category}_session_{uuid.uuid4().hex}"
        
        # Get MAX_ITEMS from the environment (set by the crawler manager or tests).
        _env_max = os.getenv("MAX_ITEMS")
        try:
            self.max_items = int(_env_max) if (_env_max and int(_env_max) > 0) else None
        except Exception:
            self.max_items = None
        
        self.all_raw_products = []
        self.all_products = []
        
        # Determine the output directory based on test mode.
        base_crawler_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if test_mode:
            self.output_dir = os.path.join(base_crawler_dir, "test_output", "cargills", category)
        else:
            self.output_dir = os.path.join(base_crawler_dir, "output", "cargills", category)
        
        os.makedirs(self.output_dir, exist_ok=True)
        
        friendly_category = category.replace('_', ' ').title()
        self._emit_status(f"[INIT] Initializing Intelligent Agent Crawler for Cargills {friendly_category}...", extra={"category": category, "test_mode": test_mode})
        if self.max_items:
            self._emit_status(f"[CONFIG] Target: {self.max_items} items", extra={"max_items": self.max_items, "category": category})
        else:
            self._emit_status("[CONFIG] Target: all available items", extra={"max_items": None, "category": category})

    def _emit_status(self, message: str, level: str = "info", extra: Optional[Dict[str, Any]] = None):
        """Emit stdout-friendly status lines while keeping structured logs."""
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
        """Get browser configuration based on the environment."""
        is_ci = os.getenv('CI') == 'true' or os.getenv('GITHUB_ACTIONS') == 'true'
        force_managed_browser = os.getenv('FORCE_MANAGED_BROWSER', '').lower() == 'true'

        headless_mode = is_ci or self.test_mode or os.getenv('HEADLESS_MODE', '').lower() == 'true'

        if headless_mode:
            source = "CI environment" if is_ci else "test mode" if self.test_mode else "HEADLESS_MODE preference"
            self._emit_status(f"[CONFIG]  Using headless mode ({source})", extra={"source": source, "headless": True})
        else:
            self._emit_status("[CONFIG] ️ Using visible browser mode", extra={"headless": False})

        if force_managed_browser:
            self._emit_status("⚠️ FORCE_MANAGED_BROWSER enabled – crawlers will share the managed browser (use only for debugging)", level="warning", extra={"force_managed_browser": True})
        else:
            self._emit_status("[CONFIG]  Dedicated browser per crawler (managed browser disabled for isolation)", extra={"managed_browser": False})

        config_kwargs = {
            'headless': headless_mode,
            'sleep_on_close': True,
            'use_managed_browser': force_managed_browser,
            'browser_mode': 'dedicated',
            'viewport': {"width": 1920, "height": 1080},
            'verbose': headless_mode or not force_managed_browser,
        }

        if headless_mode and (is_ci or self.test_mode):
            config_kwargs['extra_args'] = [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--disable-extensions",
            ]

        return BrowserConfig(**config_kwargs)
    
    async def _load_initial_page(self, crawler):
        """Phase 1: Load initial page and wait for Angular content"""
        self._emit_status(f"[PHASE 1] Loading {self.url} and waiting for Angular content", extra={"phase": "1", "url": self.url})
        
        initial_config = CrawlerRunConfig(
            session_id=self.session_id,
            page_timeout=60000,
            wait_for="css:.cargillProd.ng-scope",
            delay_before_return_html=8
        )
        
        await crawler.arun(url=self.url, config=initial_config)
        self._emit_status("[PHASE 1] Initial page loaded", level="debug", extra={"phase": "1"})
    
    async def _extract_products_angular(self, crawler) -> dict:
        """
        Extract products from Angular scope (preferred method)
        Returns: dict with products list and metadata
        """
        extract_js = """
        (() => {
            const products = [];
            
            // Try Angular scope first for clean data
            try {
                if (window.angular && window.angular.element) {
                    const controller = document.querySelector('[ng-controller]');
                    if (controller) {
                        const scope = window.angular.element(controller).scope();
                        if (scope && scope.Products && Array.isArray(scope.Products)) {
                            console.log(`Angular scope has ${scope.Products.length} products`);
                            
                            scope.Products.forEach((product, index) => {
                                try {
                                    const productName = product.ItemName || product.ShortDescription || `Product_${index}`;
                                    const price = product.Price || 'No price';
                                    const unitSize = product.UnitSize || '';
                                    const uom = product.UOM || '';
                                    
                                    const priceOnly = price;
                                    const unitDisplay = unitSize && uom ? `${unitSize} ${uom}` : '';
                                    
                                    const imageUrl = product.ItemImage ? `https://cargillsonline.com${product.ItemImage}` : '';
                                    const skuCode = product.SKUCODE || '';
                                    
                                    // Combine product name with unit if available
                                    const final_product_name = unitDisplay ? `${productName} - ${unitDisplay}` : productName;
                                    
                                    products.push({
                                        product_name: final_product_name,
                                        price: `Rs ${priceOnly}`,
                                        image_url: imageUrl,
                                        sku_code: skuCode,
                                        unique_id: `${skuCode}_${productName}`
                                    });
                                } catch (e) {
                                    console.log(`Error extracting Angular product ${index}:`, e);
                                }
                            });
                            
                            return { 
                                products: products,
                                count: products.length,
                                source: 'angular_scope'
                            };
                        }
                    }
                }
            } catch (e) {
                console.log('Could not access Angular scope:', e);
            }
            
            // Fallback to DOM if Angular fails
            console.log('Angular extraction failed, trying DOM...');
            const productElements = document.querySelectorAll('.cargillProd.ng-scope');
            console.log(`Found ${productElements.length} DOM elements`);
            
            productElements.forEach((element, index) => {
                try {
                    const link = element.querySelector('a[href*="ProductDetails"]');
                    const productName = link ? link.href.split('/').pop().replace(/%20/g, ' ') : '';
                    
                    const priceButton = element.querySelector('button.dropbtni');
                    const priceText = priceButton ? priceButton.textContent.trim() : '';
                    
                    const img = element.querySelector('img');
                    const imageUrl = img ? img.src : '';
                    
                    if (productName && priceText) {
                        products.push({
                            product_name: productName,
                            price: priceText,
                            image_url: imageUrl,
                            unique_id: `${productName}_${priceText}`
                        });
                    }
                } catch (e) {
                    console.log(`Error extracting DOM product ${index}:`, e);
                }
            });
            
            return { 
                products: products,
                count: products.length,
                source: products.length > 0 ? 'dom_fallback' : 'none'
            };
        })();
        """
        
        result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=extract_js,
                delay_before_return_html=3
            )
        )
        
        if (result.js_execution_result and 
            result.js_execution_result.get('results') and 
            len(result.js_execution_result['results']) > 0 and
            'result' in result.js_execution_result['results'][0]):
            
            return result.js_execution_result['results'][0]['result']
        
        return {'products': [], 'count': 0, 'source': 'failed'}
    
    async def _scroll_and_wait(self, crawler) -> bool:
        """
        Scroll page to trigger Angular lazy loading
        Returns: True if new content loaded, False otherwise
        """
        scroll_js = """
        (() => {
            window.scrollTo(0, document.body.scrollHeight);
            return { scrolled: true, height: document.body.scrollHeight };
        })();
        """
        
        await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=scroll_js
            )
        )
        
        # Wait for new content to load
        await asyncio.sleep(3)
        return True
    
    async def _click_load_more(self, crawler) -> dict:
        """Attempt to click a Load More button if present"""
        click_load_more_js = """
        (() => {
            const buttons = document.querySelectorAll('button, a, div[role="button"]');
            for (const btn of buttons) {
                const text = btn.textContent.toLowerCase();
                if (text.includes('load more') || text.includes('show more') || 
                    text.includes('view more') || text.includes('next')) {
                    if (!btn.disabled && btn.offsetParent !== null) {
                        btn.click();
                        return { clicked: true, buttonText: btn.textContent };
                    }
                }
            }
            return { clicked: false };
        })();
        """

        result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=click_load_more_js
            )
        )

        if result.js_execution_result and result.js_execution_result.get('results'):
            return result.js_execution_result['results'][0]['result']
        return {"clicked": False}

    async def _check_loading_status(self, crawler) -> dict:
        """Check Angular loading status indicators"""
        check_loading_js = """
        (() => {
            const loader = document.querySelector('#loader, .loader, [class*="loading"]');
            const isLoading = loader && loader.style.display !== 'none';
            let angularReady = false;
            try {
                if (window.angular && window.angular.element) {
                    const scope = window.angular.element(document.querySelector('[ng-controller]')).scope();
                    angularReady = scope && scope.$$phase === null;
                }
            } catch (e) {
                angularReady = true;
            }
            return {
                isLoading: isLoading,
                angularReady: angularReady,
                loaderVisible: loader ? loader.style.display : 'not found'
            };
        })();
        """

        result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=check_loading_js
            )
        )

        if result.js_execution_result and result.js_execution_result.get('results'):
            return result.js_execution_result['results'][0]['result']
        return {
            "isLoading": False,
            "angularReady": True,
            "loaderVisible": "unknown"
        }

    async def _wait_for_angular_ready(self, crawler):
        """Wait until Angular digest cycle completes"""
        wait_for_angular_js = """
        (() => {
            return new Promise((resolve) => {
                let checkCount = 0;
                const maxChecks = 20;
                function checkAngular() {
                    checkCount++;
                    if (window.angular && window.angular.element) {
                        const scope = window.angular.element(document.querySelector('[ng-controller]')).scope();
                        if (scope && scope.$$phase === null) {
                            resolve({ ready: true, checks: checkCount });
                            return;
                        }
                    }
                    if (checkCount >= maxChecks) {
                        resolve({ ready: false, checks: checkCount });
                        return;
                    }
                    setTimeout(checkAngular, 500);
                }
                checkAngular();
            });
        })();
        """

        await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=wait_for_angular_js
            )
        )

    async def _extract_initial_products(self, crawler) -> dict:
        """Extract initial products using Angular scope or DOM fallback"""
        initial_extract_js = """
        (() => {
            const products = [];
            try {
                if (window.angular && window.angular.element) {
                    const controller = document.querySelector('[ng-controller]');
                    if (controller) {
                        const scope = window.angular.element(controller).scope();
                        if (scope && scope.Products && Array.isArray(scope.Products)) {
                            console.log(`Initial: Angular scope has ${scope.Products.length} products`);
                            scope.Products.forEach((product, index) => {
                                try {
                                    const productName = product.ItemName || product.ShortDescription || `Product_${index}`;
                                    const price = product.Price || 'No price';
                                    const unitSize = product.UnitSize || '';
                                    const uom = product.UOM || '';
                                    const priceOnly = price;
                                    const unitDisplay = unitSize && uom ? `${unitSize} ${uom}` : '';
                                    const imageUrl = product.ItemImage ? `https://cargillsonline.com${product.ItemImage}` : '';
                                    const skuCode = product.SKUCODE || '';
                                    const final_product_name = unitDisplay ? `${productName} - ${unitDisplay}` : productName;
                                    products.push({
                                        product_name: final_product_name,
                                        price: priceOnly,
                                        image_url: imageUrl,
                                        strike_price: '',
                                        batch_number: 0,
                                        element_index: index,
                                        unique_id: `${skuCode}_${productName}_${price}`,
                                        extraction_strategy: 'angular_scope_initial',
                                        sku_code: skuCode,
                                        unit_size: unitSize,
                                        uom: uom
                                    });
                                } catch (e) {
                                    console.log(`Error extracting initial Angular product ${index}:`, e);
                                }
                            });
                            return {
                                products: products,
                                count: products.length,
                                totalElements: scope.Products.length,
                                source: 'angular_scope'
                            };
                        }
                    }
                }
            } catch (e) {
                console.log('Could not access Angular scope for initial extraction:', e);
            }
            if (products.length === 0) {
                console.log('Angular initial extraction failed, trying DOM...');
                const productElements = document.querySelectorAll('.cargillProd.ng-scope');
                console.log(`Found ${productElements.length} DOM elements initially`);
                productElements.forEach((element, index) => {
                    try {
                        const link = element.querySelector('a[href*="ProductDetails"]');
                        const productName = link ? link.href.split('/').pop().replace(/%20/g, ' ') : '';
                        const priceButton = element.querySelector('button.dropbtni');
                        const priceText = priceButton ? priceButton.textContent.trim() : '';
                        const img = element.querySelector('img');
                        const imageUrl = img ? img.src : '';
                        const strikePrice = element.querySelector('.strike1, .strike2');
                        const strikePriceText = strikePrice ? strikePrice.textContent.trim() : '';
                        if (productName && priceText) {
                            products.push({
                                product_name: productName,
                                price: priceText,
                                image_url: imageUrl,
                                strike_price: strikePriceText,
                                batch_number: 0,
                                element_index: index,
                                unique_id: `${productName}_${priceText}`,
                                extraction_strategy: 'dom_fallback'
                            });
                        }
                    } catch (e) {
                        console.log(`Error extracting DOM product ${index}:`, e);
                    }
                });
            }
            return {
                products: products,
                count: products.length,
                totalElements: products.length,
                source: products.length > 0 ? products[0].extraction_strategy : 'none'
            };
        })();
        """

        result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=initial_extract_js,
                delay_before_return_html=3
            )
        )

        if (result.js_execution_result and result.js_execution_result.get('results') and
                len(result.js_execution_result['results']) > 0 and
                'result' in result.js_execution_result['results'][0]):
            return result.js_execution_result['results'][0]['result']

        return {'products': [], 'count': 0, 'totalElements': 0, 'source': 'failed'}

    async def _extract_alternative_products(self, crawler) -> dict:
        """Alternative extraction when initial attempt finds zero products"""
        alt_extract_js = """
        (() => {
            const products = [];
            const selectors = [
                '.cargillProd.ng-scope',
                '.cargillProd',
                '[class*="cargillProd"]',
                '[ng-repeat*="product"]'
            ];
            let productElements = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`Found ${elements.length} elements with selector: ${selector}`);
                    productElements = Array.from(elements);
                    break;
                }
            }
            console.log('Product elements found:', productElements.length);
            if (productElements.length > 0) {
                console.log('First element HTML:', productElements[0].outerHTML.substring(0, 200));
            }
            productElements.forEach((element, index) => {
                try {
                    const link = element.querySelector('a[href*="ProductDetails"]');
                    const productName = link ? link.href.split('/').pop().replace(/%20/g, ' ') : '';
                    const priceButton = element.querySelector('button.dropbtni, button[class*="drop"]');
                    const priceText = priceButton ? priceButton.textContent.trim() : '';
                    const img = element.querySelector('img');
                    const imageUrl = img ? img.src : '';
                    console.log(`Alt Product ${index}: name="${productName}", price="${priceText}"`);
                    if (productName || priceText) {
                        products.push({
                            product_name: productName || `Product_${index}`,
                            price: priceText || 'No price',
                            image_url: imageUrl,
                            strike_price: '',
                            batch_number: 0,
                            element_index: index,
                            unique_id: `${productName || index}_${priceText || 'noprice'}`
                        });
                    }
                } catch (e) {
                    console.log(`Error extracting alt product ${index}:`, e);
                }
            });
            return {
                products: products,
                count: products.length,
                totalElements: productElements.length
            };
        })();
        """

        result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=alt_extract_js
            )
        )

        if (result.js_execution_result and result.js_execution_result.get('results') and
                len(result.js_execution_result['results']) > 0 and
                'result' in result.js_execution_result['results'][0]):
            return result.js_execution_result['results'][0]['result']

        return {'products': [], 'count': 0, 'totalElements': 0}

    async def _extract_products_after_scroll(self, crawler, attempt_number: int) -> dict:
        """Extract products after scrolling using Angular scope or DOM fallback"""
        extract_after_scroll_js = """
        (() => {
            const products = [];
            let angularProductsCount = 0;
            let domProductsCount = 0;
            let strategyUsed = 'none';
            let sampleAngularProduct = null;
            try {
                if (window.angular && window.angular.element) {
                    const controller = document.querySelector('[ng-controller]');
                    if (controller) {
                        const scope = window.angular.element(controller).scope();
                        if (scope && scope.Products && Array.isArray(scope.Products)) {
                            angularProductsCount = scope.Products.length;
                            scope.Products.forEach((product, index) => {
                                try {
                                    const productName = product.ItemName || product.ShortDescription || `Product_${index}`;
                                    const price = product.Price || 'No price';
                                    const unitSize = product.UnitSize || '';
                                    const uom = product.UOM || '';
                                    const priceOnly = price;
                                    const unitDisplay = unitSize && uom ? `${unitSize} ${uom}` : '';
                                    const imageUrl = product.ItemImage ? `https://cargillsonline.com${product.ItemImage}` : '';
                                    const skuCode = product.SKUCODE || '';
                                    const description = product.Description || '';
                                    const final_product_name = unitDisplay ? `${productName} - ${unitDisplay}` : productName;
                                    if (!sampleAngularProduct) {
                                        sampleAngularProduct = product;
                                    }
                                    products.push({
                                        product_name: final_product_name,
                                        price: priceOnly,
                                        image_url: imageUrl,
                                        strike_price: '',
                                        batch_number: arguments[0],
                                        element_index: index,
                                        unique_id: `${skuCode}_${productName}_${price}`,
                                        extraction_strategy: 'angular_scope_direct',
                                        sku_code: skuCode,
                                        unit_size: unitSize,
                                        uom: uom,
                                        description: description.substring(0, 200)
                                    });
                                } catch (e) {
                                    console.log(`Error extracting Angular product ${index}:`, e);
                                }
                            });
                            strategyUsed = 'angular_scope_direct';
                        }
                    }
                }
            } catch (e) {
                console.log('Could not access Angular scope:', e);
            }
            if (products.length === 0) {
                console.log('Angular extraction failed, trying DOM extraction...');
                const selectorStrategies = [
                    {
                        name: 'cargillProd_standard',
                        selector: '.cargillProd.ng-scope',
                        linkSelector: 'a[href*="ProductDetails"]',
                        priceSelector: 'button.dropbtni'
                    },
                    {
                        name: 'cargillProd_alt',
                        selector: '.cargillProd',
                        linkSelector: 'a[href*="ProductDetails"]',
                        priceSelector: 'button[class*="drop"]'
                    }
                ];
                let productElements = [];
                for (const strategy of selectorStrategies) {
                    const elements = document.querySelectorAll(strategy.selector);
                    if (elements.length > 0) {
                        const validElements = Array.from(elements).filter(el => {
                            const link = el.querySelector(strategy.linkSelector);
                            const price = el.querySelector(strategy.priceSelector);
                            return link || price;
                        });
                        if (validElements.length > 0) {
                            productElements = validElements;
                            strategyUsed = strategy.name;
                            break;
                        }
                    }
                }
                domProductsCount = productElements.length;
                productElements.forEach((element, index) => {
                    try {
                        let productName = '';
                        const link = element.querySelector('a[href*="ProductDetails"], a[href*="Vegetables"]');
                        if (link && link.href) {
                            const urlParts = link.href.split('/');
                            productName = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
                            productName = productName.replace(/%20/g, ' ').replace(/\\?.*$/, '');
                        }
                        if (!productName) {
                            const titleEl = element.querySelector('[title], [ng-binding*="Name"], p[class*="title"]');
                            if (titleEl) {
                                productName = titleEl.title || titleEl.textContent.trim();
                            }
                        }
                        let priceText = '';
                        const priceButton = element.querySelector('button.dropbtni, button[class*="drop"], button[ng-if*="MasterSKUCODE"]');
                        if (priceButton) {
                            priceText = priceButton.textContent.trim();
                        }
                        const img = element.querySelector('img');
                        const imageUrl = img ? img.src : '';
                        const strikePrice = element.querySelector('.strike1, .strike2, [class*="strike"]');
                        const strikePriceText = strikePrice ? strikePrice.textContent.trim() : '';
                        if (productName || priceText) {
                            products.push({
                                product_name: productName || `Product_${index}`,
                                price: priceText || 'No price',
                                image_url: imageUrl,
                                strike_price: strikePriceText,
                                batch_number: arguments[0],
                                element_index: index,
                                unique_id: `${productName || index}_${priceText || 'noprice'}`,
                                extraction_strategy: strategyUsed
                            });
                        }
                    } catch (e) {
                        console.log(`Error extracting DOM product ${index}:`, e);
                    }
                });
            }
            return {
                products: products,
                count: products.length,
                angularProductsCount: angularProductsCount,
                domProductsCount: domProductsCount,
                strategyUsed: strategyUsed,
                timestamp: new Date().toISOString(),
                sampleAngularProduct: sampleAngularProduct
            };
        })();
        """

        result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=extract_after_scroll_js.replace('arguments[0]', str(attempt_number))
            )
        )

        if (result.js_execution_result and result.js_execution_result.get('results') and
                len(result.js_execution_result['results']) > 0 and
                'result' in result.js_execution_result['results'][0]):
            return result.js_execution_result['results'][0]['result']

        return {
            'products': [],
            'count': 0,
            'angularProductsCount': 0,
            'domProductsCount': 0,
            'strategyUsed': 'failed',
            'sampleAngularProduct': None
        }

    async def _attempt_angular_scope_extraction(self, crawler, attempt_number: int) -> dict:
        """Attempt direct Angular scope extraction when stuck"""
        angular_extract_js = """
        (() => {
            const products = [];
            try {
                if (window.angular && window.angular.element) {
                    const scope = window.angular.element(document.querySelector('[ng-controller]')).scope();
                    if (scope && scope.Products && Array.isArray(scope.Products)) {
                        console.log(`Extracting from Angular scope: ${scope.Products.length} products`);
                        scope.Products.forEach((product, index) => {
                            try {
                                const productName = product.Name || product.ProductName || `Product_${index}`;
                                const price = product.Price || product.UnitPrice || 'No price';
                                const imageUrl = product.ImageUrl || product.Image || '';
                                products.push({
                                    product_name: productName,
                                    price: price.toString(),
                                    image_url: imageUrl,
                                    strike_price: '',
                                    batch_number: arguments[0],
                                    element_index: index,
                                    unique_id: `${productName}_${price}`,
                                    source: 'angular_scope'
                                });
                            } catch (e) {
                                console.log(`Error extracting Angular product ${index}:`, e);
                            }
                        });
                    }
                }
            } catch (e) {
                console.log('Error accessing Angular scope:', e);
            }
            return {
                products: products,
                count: products.length,
                source: 'angular_scope'
            };
        })();
        """

        result = await crawler.arun(
            url=self.url,
            config=CrawlerRunConfig(
                session_id=self.session_id,
                js_only=True,
                js_code=angular_extract_js.replace('arguments[0]', str(attempt_number))
            )
        )

        if (result.js_execution_result and result.js_execution_result.get('results') and
                len(result.js_execution_result['results']) > 0 and
                'result' in result.js_execution_result['results'][0]):
            return result.js_execution_result['results'][0]['result']

        return {'products': [], 'count': 0, 'source': 'failed'}

    async def _crawl_with_scroll(self, crawler):
        """Phase 2: Handle dynamic content loading with infinite scroll and load more"""
        self._emit_status("\n[PHASE 2] Detecting dynamic content and starting infinite scroll extraction...", extra={"phase": "2"})

        self.all_raw_products = []
        last_product_count = 0
        stable_scrolls = 0
        max_stable_scrolls = 3
        scroll_attempts = 0
        max_scroll_attempts = 20
        target_items = self.max_items

        self._emit_status("[PROGRESS] Extracting initial products from Angular scope", level="debug")
        initial_data = await self._extract_initial_products(crawler)

        self.all_raw_products.extend(initial_data['products'])
        last_product_count = initial_data['count']

        self._emit_status(
            f"[PRODUCTS] Initial extraction found {last_product_count} products",
            extra={
                "products_count": last_product_count,
                "total_elements": initial_data.get('totalElements', 0),
                "source": initial_data.get('source', 'unknown')
            }
        )
        if last_product_count:
            self._emit_status(f"[PROGRESS] Total items found: {len(self.all_raw_products)}", extra={"total_products": len(self.all_raw_products)})

        if initial_data['products']:
            sample_name = initial_data['products'][0]['product_name']
            logger.debug(f"Sample product: {sample_name[:50]}...")

        if target_items and last_product_count >= target_items:
            self._emit_status(
                f"[COMPLETE] ✅ Initial extraction already meets target of {target_items} items",
                extra={"products_count": last_product_count, "target": target_items}
            )
            stable_scrolls = max_stable_scrolls

        if last_product_count == 0:
            logger.debug("No products found initially. Trying alternative approach")
            await asyncio.sleep(5)
            alt_result = await self._extract_alternative_products(crawler)
            if alt_result['count'] > 0:
                self.all_raw_products.extend(alt_result['products'])
                last_product_count = alt_result['count']
                self._emit_status(
                    f"[PRODUCTS] Alternative extraction recovered {last_product_count} products",
                    extra={"products_count": last_product_count, "total_elements": alt_result.get('totalElements', 0)}
                )
                if alt_result['products']:
                    logger.debug(f"Sample: {alt_result['products'][0]['product_name'][:50]}...")

        while stable_scrolls < max_stable_scrolls and scroll_attempts < max_scroll_attempts:
            scroll_attempts += 1
            self._emit_status(
                f"[SCROLL] Attempt {scroll_attempts}/{max_scroll_attempts}",
                level="debug",
                extra={"scroll_attempt": scroll_attempts, "max_attempts": max_scroll_attempts}
            )

            click_result = await self._click_load_more(crawler)
            if click_result.get('clicked'):
                button_text = click_result.get('buttonText', '').strip()
                display_text = button_text or "Load More"
                self._emit_status(
                    f"[ACTION] Clicked Load More button: '{display_text}'",
                    extra={"button_text": button_text}
                )
                await asyncio.sleep(15)
                loading_status = await self._check_loading_status(crawler)
                logger.debug(f"Loading status: {loading_status}", extra={"loading_status": loading_status})
                if loading_status.get('isLoading'):
                    logger.debug("Still loading, waiting additional time")
                    await asyncio.sleep(10)

            await self._scroll_and_wait(crawler)
            self._emit_status("[SCROLL] Scrolled page to trigger lazy loading", level="debug")
            await asyncio.sleep(5)
            await self._wait_for_angular_ready(crawler)

            current_data = await self._extract_products_after_scroll(crawler, scroll_attempts)
            current_product_count = current_data['count']
            angular_count = current_data.get('angularProductsCount', 0)
            dom_count = current_data.get('domProductsCount', 0)
            strategy_used = current_data.get('strategyUsed', 'unknown')
            sample_angular = current_data.get('sampleAngularProduct')

            logger.debug(f"Found {current_product_count} products (previously: {last_product_count})", extra={"current_count": current_product_count, "previous_count": last_product_count})
            logger.debug(f"Angular scope: {angular_count}, DOM: {dom_count}, Strategy: '{strategy_used}'", extra={"angular_count": angular_count, "dom_count": dom_count, "strategy": strategy_used})

            if sample_angular:
                sample_name = sample_angular.get('ItemName', 'Unknown')
                sample_price = sample_angular.get('Price', 'Unknown')
                logger.debug(f"Sample Angular product: {sample_name} - Rs {sample_price}")

            if current_data['products']:
                sample_product = current_data['products'][0]
                logger.debug(f"Current page sample: {sample_product.get('product_name', 'No name')[:40]}...")

            existing_ids = {p.get('unique_id') for p in self.all_raw_products if p.get('unique_id')}
            new_products_found = []
            for product in current_data['products']:
                unique_id = product.get('unique_id')
                if unique_id and unique_id not in existing_ids:
                    new_products_found.append(product)

            if new_products_found:
                self._emit_status(
                    f"[PRODUCTS] Found {len(new_products_found)} new products",
                    extra={"new_products_count": len(new_products_found)}
                )
                self.all_raw_products.extend(new_products_found)
                last_product_count = len(self.all_raw_products)
                stable_scrolls = 0
                self._emit_status(f"[PROGRESS] Total items found: {len(self.all_raw_products)}", extra={"total_products": len(self.all_raw_products)})
                for index, product in enumerate(new_products_found[:3]):
                    logger.debug(f"New {index + 1}: {product['product_name'][:40]}... - {product.get('price', 'No price')}")
                if target_items and len(self.all_raw_products) >= target_items:
                    self._emit_status(
                        f"[COMPLETE] ✅ Reached target of {target_items} items. Stopping collection",
                        extra={"target": target_items, "collected": len(self.all_raw_products)}
                    )
                    break
            else:
                stable_scrolls += 1
                self._emit_status(
                    f"[SCROLL] No new products found. Stability {stable_scrolls}/{max_stable_scrolls}",
                    level="debug",
                    extra={"stable_scrolls": stable_scrolls, "max_stable": max_stable_scrolls}
                )
                if angular_count > len(new_products_found) and stable_scrolls == 1:
                    logger.debug("Attempting direct extraction from Angular scope")
                    angular_data = await self._attempt_angular_scope_extraction(crawler, scroll_attempts)
                    if angular_data['count'] > current_product_count:
                        self._emit_status(
                            f"[PRODUCTS] Angular scope extraction recovered {angular_data['count']} items",
                            extra={"products_count": angular_data['count']}
                        )
                        current_data = angular_data
                        existing_ids = {p.get('unique_id') for p in self.all_raw_products if p.get('unique_id')}
                        new_products = []
                        for product in angular_data['products']:
                            unique_id = product.get('unique_id')
                            if unique_id and unique_id not in existing_ids:
                                new_products.append(product)
                                existing_ids.add(unique_id)
                        if new_products:
                            self.all_raw_products.extend(new_products)
                            self._emit_status(
                                f"[PRODUCTS] Added {len(new_products)} new products from Angular scope",
                                extra={"new_products_count": len(new_products)}
                            )
                            last_product_count = len(self.all_raw_products)
                            stable_scrolls = 0
                            if target_items and len(self.all_raw_products) >= target_items:
                                self._emit_status(
                                    f"[COMPLETE] ✅ Reached target of {target_items} items. Stopping collection",
                                    extra={"target": target_items, "collected": len(self.all_raw_products)}
                                )
                                break

            if target_items and len(self.all_raw_products) >= target_items:
                self._emit_status(
                    f"[COMPLETE] ✅ Reached target of {target_items} items with {len(self.all_raw_products)} products collected",
                    extra={"target": target_items, "collected": len(self.all_raw_products)}
                )
                break

        if stable_scrolls >= max_stable_scrolls:
            self._emit_status(
                f"[COMPLETE] No more products loading after {stable_scrolls} stable scrolls",
                extra={"stable_scrolls": stable_scrolls}
            )
        elif scroll_attempts >= max_scroll_attempts:
            self._emit_status(
                f"[COMPLETE] Reached maximum scroll attempts ({max_scroll_attempts})",
                extra={"max_attempts": max_scroll_attempts}
            )
    
    def _deduplicate_products(self):
        """Remove duplicate products based on unique_id"""
        seen = set()
        unique_products = []
        
        for product in self.all_raw_products:
            unique_id = product.get('unique_id', f"{product.get('product_name')}_{product.get('price')}")
            if unique_id not in seen:
                seen.add(unique_id)
                unique_products.append(product)
        
        duplicates_removed = len(self.all_raw_products) - len(unique_products)
        if duplicates_removed > 0:
            self._emit_status(
                f"[PROGRESS] Removed {duplicates_removed} duplicate products",
                extra={"duplicates_removed": duplicates_removed, "total_products": len(unique_products)}
            )
        
        return unique_products
    
    def _process_and_limit(self, products: List[dict]) -> List[Product]:
        """
        Process raw products and apply max_items limit
        Returns list of Product objects
        """
        # Apply limit if set
        if self.max_items:
            products = products[:self.max_items]
        
        # Convert to Product objects
        processed = []
        for raw_product in products:
            try:
                product = Product(
                    product_name=raw_product.get('product_name', 'Unknown'),
                    price=raw_product.get('price', 'No price'),
                    image_url=raw_product.get('image_url')
                )
                processed.append(product)
            except Exception as e:
                logger.warning(f"Error processing product: {e}", extra={"error": str(e)})
                continue
        
        return processed
    
    def _save_results(self, products: List[Product]) -> str:
        """
        Save products to JSON file with timestamp
        Returns: filename
        """
        # Generate timestamped filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"cargills_{self.category}_{timestamp}.json"
        filepath = os.path.join(self.output_dir, filename)
        
        # Convert to dict for JSON serialization
        products_data = [product.model_dump() for product in products]
        
        # Save to file
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(products_data, f, indent=2, ensure_ascii=False)
        
        self._emit_status(f"[SAVE]  Product data saved to {filepath}", extra={"filepath": filepath, "products_count": len(products)})
        if self.test_mode:
            self._emit_status("[INFO] (Test mode: saved to test_output folder)", level="debug", extra={"test_mode": True})
        
        return filename
    
    async def run(self) -> dict:
        """
        Main execution method
        
        Returns:
            dict: {
                'success': bool,
                'category': str,
                'product_count': int,
                'filename': str,
                'output_path': str
            }
        """
        start_time = datetime.now()
        
        try:
            browser_config = self._get_browser_config()
            
            async with AsyncWebCrawler(config=browser_config) as crawler:
                # Phase 1: Load initial page
                await self._load_initial_page(crawler)
                
                # Phase 2: Scroll and collect products
                await self._crawl_with_scroll(crawler)
                
                # Phase 3: Process and save
                self._emit_status("\n[PHASE 3] Processing all collected products", extra={"phase": "3"})
                
                # Deduplicate
                unique_products = self._deduplicate_products()
                self._emit_status(f"[PROGRESS] Total unique products: {len(unique_products)}", extra={"unique_products_count": len(unique_products)})
                
                # Process and limit
                processed_products = self._process_and_limit(unique_products)
                self._emit_status(f"[PROGRESS] Final product count after processing: {len(processed_products)}", extra={"final_products_count": len(processed_products)})
                
                self._emit_status("[PHASE 4] Saving final processed results", extra={"phase": "4"})
                
                # Display complete results
                self._emit_status(f"[COMPLETE] CRAWL COMPLETE: Found and processed {len(processed_products)} unique products", extra={"products_count": len(processed_products), "category": self.category})
                
                # Show sample products
                if processed_products:
                    sample_json = json.dumps(
                        [p.model_dump() for p in processed_products[:3]],
                        indent=2,
                        ensure_ascii=False
                    )
                    logger.debug("Sample products", extra={"sample_json": sample_json[:500]})
                
                # Save results
                filename = self._save_results(processed_products)
                
                # Calculate duration
                duration = (datetime.now() - start_time).total_seconds()
                
                return {
                    'success': True,
                    'category': self.category,
                    'product_count': len(processed_products),
                    'filename': filename,
                    'output_path': self.output_dir,
                    'duration': duration
                }
        
        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds()
            log_error(logger, e, context={"operation": "crawler_run", "category": self.category, "duration": duration})
            import traceback
            traceback.print_exc()
            
            return {
                'success': False,
                'category': self.category,
                'error': str(e),
                'duration': duration
            }


# Helper function for basic category crawling.
async def crawl_cargills_category(url: str, category: str, test_mode: bool = False) -> dict:
    """Crawl a Cargills category.

    Args:
        url: Category URL.
        category: Category name.
        test_mode: If True, save to test_output.

    Returns:
        Dictionary with crawl results.
    """
    crawler = CargillsBaseCrawler(url, category, test_mode)
    return await crawler.run()


if __name__ == "__main__":
    # Example usage.
    async def test():
        result = await crawl_cargills_category(
            url="https://cargillsonline.com/Product/Beverages?IC=Mw==&NC=QmV2ZXJhZ2Vz",
            category="beverages",
            test_mode=True
        )
        logger.info(f"Test result: {result}", extra={"result": result})
    
    asyncio.run(test())

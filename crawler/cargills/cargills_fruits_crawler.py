"""Cargills fruits crawler.

Uses the base crawler for consistent crawling behavior.
"""

import os
import sys
import asyncio

# Add the backend path for logger_service.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

from cargills_base_crawler import crawl_cargills_category


async def main(test_mode: bool = False):
    """Crawl the Cargills fruits category.

    Args:
        test_mode: If True, save to the test_output folder.
    """
    url = "https://cargillsonline.com/Product/Fruits?IC=OQ==&NC=RnJ1aXRz"
    category = "fruits"
    
    return await crawl_cargills_category(url, category, test_mode)


if __name__ == "__main__":
    result = asyncio.run(main())
    logger.info(
        "Crawl complete",
        extra={
            "product_count": result.get('product_count'),
            "crawler_filename": result.get('filename')
        }
    )

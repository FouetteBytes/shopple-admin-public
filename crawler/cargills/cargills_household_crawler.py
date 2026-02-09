"""
Cargills Household Crawler
Uses the base crawler for consistent crawling behavior
"""

import os
import sys
import asyncio

# Add backend to path for logger_service
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
from services.system.logger_service import get_logger

logger = get_logger(__name__)

from cargills_base_crawler import crawl_cargills_category


async def main(test_mode: bool = False):
    """
    Crawl Cargills Household category
    
    Args:
        test_mode: If True, saves to test_output folder
    """
    url = "https://cargillsonline.com/Product/Household?IC=MTA=&NC=SG91c2Vob2xk"
    category = "household"
    
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

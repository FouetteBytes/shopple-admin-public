"""Keells beverages crawler.

Uses the base crawler to scrape beverages from Keells.
Only the URL and category name are required.
"""

import asyncio
from keells_base_crawler import crawl_keells_category


async def main(test_mode: bool = False):
    """Crawl the Keells beverages category.

    Args:
        test_mode: If True, save output to the test folder instead of production.
    """
    url = "https://www.keellssuper.com/beverages"
    category = "beverages"
    
    return await crawl_keells_category(url, category, test_mode)


if __name__ == "__main__":
    asyncio.run(main())

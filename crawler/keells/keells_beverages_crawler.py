"""
Keells Beverages Crawler

Uses the base crawler to scrape beverages from Keells.
Only needs to specify the URL and category name!
"""

import asyncio
from keells_base_crawler import crawl_keells_category


async def main(test_mode: bool = False):
    '''
    Crawl Keells Beverages category
    
    Args:
        test_mode: If True, saves output to test folder instead of production folder
    '''
    url = "https://www.keellssuper.com/beverages"
    category = "beverages"
    
    return await crawl_keells_category(url, category, test_mode)


if __name__ == "__main__":
    asyncio.run(main())

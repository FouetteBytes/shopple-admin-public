"""Keells chilled products crawler."""
import asyncio
from keells_base_crawler import crawl_keells_category

async def main(test_mode: bool = False):
    """Crawl the Keells chilled products category."""
    url = 'https://www.keellssuper.com/chilled-products'
    category = 'chilled_products'
    return await crawl_keells_category(url, category, test_mode)

if __name__ == '__main__':
    asyncio.run(main())

'''Keells Vegetables Crawler'''
import asyncio
from keells_base_crawler import crawl_keells_category

async def main(test_mode: bool = False):
    url = 'https://www.keellssuper.com/fresh-vegetables'
    category = 'vegetables'
    return await crawl_keells_category(url, category, test_mode)

if __name__ == '__main__':
    asyncio.run(main())

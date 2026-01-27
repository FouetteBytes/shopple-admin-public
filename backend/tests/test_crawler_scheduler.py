from types import SimpleNamespace

from backend.features.crawler.service.crawler_scheduler import CrawlerScheduler


AVAILABLE_CRAWLERS = {
    "keells": {
        "fruits": {},
        "vegetables": {},
    },
    "cargills": {
        "dairy": {},
        "frozen": {},
    },
}


def make_scheduler() -> CrawlerScheduler:
    scheduler = CrawlerScheduler.__new__(CrawlerScheduler)
    scheduler.crawler_manager = SimpleNamespace(available_crawlers=AVAILABLE_CRAWLERS)
    return scheduler


def specs_set(specs):
    return {(spec["store"], spec["category"]) for spec in specs}


def test_category_mode_without_categories_targets_all_categories_for_store():
    scheduler = make_scheduler()
    selection = {"mode": "category", "stores": ["keells"]}

    specs = scheduler._selection_to_specs(selection)

    assert specs_set(specs) == {
        ("keells", "fruits"),
        ("keells", "vegetables"),
    }


def test_category_mode_with_empty_categories_behaves_like_all():
    scheduler = make_scheduler()
    selection = {"mode": "category", "stores": ["cargills"], "categories": []}

    specs = scheduler._selection_to_specs(selection)

    assert specs_set(specs) == {
        ("cargills", "dairy"),
        ("cargills", "frozen"),
    }


def test_category_mode_without_store_targets_all_stores():
    scheduler = make_scheduler()
    selection = {"mode": "category"}

    specs = scheduler._selection_to_specs(selection)

    assert specs_set(specs) == {
        ("keells", "fruits"),
        ("keells", "vegetables"),
        ("cargills", "dairy"),
        ("cargills", "frozen"),
    }

import pytest
import sys
import os

# Add the project root to the path so we can import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from backend.features.products.service.matcher import IntelligentProductMatcher


@pytest.fixture()
def matcher(tmp_path):
    cache_path = tmp_path / "matcher_cache.pkl"
    return IntelligentProductMatcher(
        cache_file=str(cache_path),
        similarity_threshold=0.7,
        exact_match_threshold=0.9,
    )


def test_normalize_product_name_handles_brand(matcher):
    normalized = matcher.normalize_product_name("Sprite Drink 1.5L", "Sprite")
    assert normalized == "drink 1.5l"


def test_generate_search_tokens_captures_core_terms(matcher):
    tokens = matcher.generate_search_tokens(
        name="Coca Cola Zero 1.5L",
        brand="Coca Cola",
        variety="Zero Sugar",
    )

    assert {"coca", "cola", "zero"}.issubset(tokens)
    assert "1.5l" in tokens
    assert "sugar" in tokens


def test_brand_named_similarity_boost(matcher):
    product_a = {
        "name": "Coca Cola - PET Bottle 1.5L",
        "brand_name": "Coca Cola",
        "sizeRaw": "1.5 L",
        "size": "1.5 L",
    }
    product_b = {
        "name": "Coca Cola",
        "brand_name": "Coca Cola",
        "sizeRaw": "1.5 L",
        "size": "1.5 L",
    }

    score, reasons = matcher.calculate_similarity(product_a, product_b)

    assert score >= matcher.similarity_threshold
    assert "Brand-named product matching" in reasons
    assert "Brand match" in reasons
    assert "Size match" in reasons

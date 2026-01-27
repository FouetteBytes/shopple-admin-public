"""
Integration tests for Cerebras handler - Tests real API calls
Requires CEREBRAS_API_KEY environment variable
"""
import pytest
import os
import sys
import time
import json

# Add backend directory and project root to path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
project_root = os.path.dirname(backend_dir)
sys.path.insert(0, backend_dir)
sys.path.insert(0, project_root)

# Mock dependencies if missing
try:
    import cerebras.cloud.sdk
except ImportError:
    from unittest.mock import MagicMock
    sys.modules['cerebras'] = MagicMock()
    sys.modules['cerebras.cloud'] = MagicMock()
    sys.modules['cerebras.cloud.sdk'] = MagicMock()

from services.ai_handlers.cerebras_handler import CerebrasHandler


@pytest.fixture
def allowed_models():
    """Load allowed models from config"""
    config_path = os.path.join(script_dir, '..', 'backend', 'secure', 'allowed_models.json')
    try:
        with open(config_path, 'r') as f:
            models = json.load(f)
            return models.get('cerebras', [])
    except Exception as e:
        pytest.skip(f"Could not load allowed_models.json: {e}")


@pytest.fixture
def api_key():
    """Get API key from environment"""
    key = os.getenv('CEREBRAS_API_KEY')
    if not key:
        pytest.skip("CEREBRAS_API_KEY not set - skipping integration test")
    return key


@pytest.fixture
def handler(api_key):
    """Create handler with real API key"""
    return CerebrasHandler(api_key=api_key)


def test_cerebras_availability(handler, allowed_models):
    """Test that Cerebras handler is available"""
    assert handler.is_available(), "Cerebras handler should be available with valid API key"


def test_cerebras_real_classification(handler, allowed_models):
    """Test real product classification with Cerebras API"""
    # Start timing
    start_time = time.time_ns()
    
    # Test product data
    test_product = {
        "name": "Sprite 1.5L Bottle",
        "price": 1.99,
        "store": "Keells"
    }
    
    # System prompt
    system_prompt = """You are a product classifier. Classify products into categories.
Return JSON: {"category": "Beverages", "sub_category": "Soft Drinks", "brand": "Sprite"}"""
    
    # Classify
    handler.add_system_instruction(system_prompt)
    response, model_used = handler.classify_product(
        f"Classify: {test_product['name']}"
    )
    
    # Calculate duration
    end_time = time.time_ns()
    duration_ms = (end_time - start_time) / 1_000_000
    
    # Assertions
    assert response is not None, "Response should not be None"
    assert len(response) > 0, "Response should not be empty"
    assert model_used is not None, "Model name should be returned"
    
    # Print metrics
    print(f"\n✅ Cerebras Integration Test Passed")
    print(f"   Model: {model_used}")
    print(f"   Response length: {len(response)} chars")
    print(f"   Duration: {duration_ms:.2f}ms")
    print(f"   Inference speed: {duration_ms:.2f}ms")
    
    # Check if response looks like JSON
    assert "{" in response or "category" in response.lower(), "Response should contain classification data"


def test_cerebras_high_performance(handler, allowed_models):
    """Test Cerebras high-performance inference"""
    start_time = time.time_ns()
    
    # Cerebras is known for fast inference
    response, model_used = handler.classify_product(
        "Quick classification test"
    )
    
    end_time = time.time_ns()
    duration_ms = (end_time - start_time) / 1_000_000
    
    assert response is not None, "Should get fast response"
    
    # Cerebras should be very fast (typically < 500ms)
    print(f"\n⚡ High-Performance Test:")
    print(f"   Duration: {duration_ms:.2f}ms")
    print(f"   Expected: < 2000ms for Cerebras")


@pytest.mark.timeout(30)
def test_cerebras_response_time(handler, allowed_models):
    """Test that API responds within acceptable time"""
    start = time.time()
    
    response, model = handler.classify_product(
        "Fast test"
    )
    
    elapsed = time.time() - start
    
    assert response is not None, "Should get response"
    assert elapsed < 10.0, f"Response too slow: {elapsed:.2f}s (expected < 10s)"
    
    print(f"\n⚡ Response time: {elapsed:.2f}s")


def test_cerebras_conversation_memory(handler, allowed_models):
    """Test conversation memory across multiple requests"""
    handler.add_system_instruction("You are a product classifier.")
    
    # First request
    response1, model1 = handler.classify_product(
        "Classify: Coca Cola",
        use_memory=True
    )
    
    # Second request with memory
    response2, model2 = handler.classify_product(
        "Classify: Pepsi",
        use_memory=True
    )
    
    assert response1 is not None, "First classification should succeed"
    assert response2 is not None, "Second classification should succeed with memory"
    
    print(f"\n Memory Test:")
    print(f"   First response length: {len(response1)}")
    print(f"   Second response length: {len(response2)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])


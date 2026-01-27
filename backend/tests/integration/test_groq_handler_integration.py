"""
Integration tests for Groq handler - Tests real API calls
Requires GROQ_API_KEY environment variable
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
    import groq
except ImportError:
    from unittest.mock import MagicMock
    sys.modules['groq'] = MagicMock()

from services.ai_handlers.groq_handler import GroqHandler


@pytest.fixture
def allowed_models():
    """Load allowed models from config"""
    config_path = os.path.join(script_dir, '..', 'backend', 'secure', 'allowed_models.json')
    try:
        with open(config_path, 'r') as f:
            models = json.load(f)
            return models.get('groq', [])
    except Exception as e:
        pytest.skip(f"Could not load allowed_models.json: {e}")


@pytest.fixture
def api_key():
    """Get API key from environment"""
    key = os.getenv('GROQ_API_KEY')
    if not key:
        pytest.skip("GROQ_API_KEY not set - skipping integration test")
    return key


@pytest.fixture
def handler(api_key):
    """Create handler with real API key"""
    return GroqHandler(api_key=api_key)


def test_groq_real_classification(handler, allowed_models):
    """Test real product classification with Groq API for each allowed model"""
    if not allowed_models:
        pytest.skip("No allowed Groq models configured")
    
    # Test each model individually
    for test_model in allowed_models:
        print(f"\n Testing Groq model: {test_model}")
        
        # Start timing
        start_time = time.time_ns()
        
        # Test product data
        test_product = {
            "name": "Coca Cola 330ml Can",
            "price": 2.50,
            "store": "Keells"
        }
        
        # System prompt
        system_prompt = """You are a product classifier. Classify products into categories.
Return JSON: {"category": "Beverages", "sub_category": "Soft Drinks", "brand": "Coca Cola"}"""
        
        # Classify
        handler.add_system_instruction(system_prompt)
        response, model_used = handler.classify_product(
            f"Classify: {test_product['name']}",
            model_override=test_model
        )
        
        # Calculate duration
        end_time = time.time_ns()
        duration_ms = (end_time - start_time) / 1_000_000
        
        # Assertions
        assert response is not None, f"Response should not be None for model {test_model}"
        assert len(response) > 0, f"Response should not be empty for model {test_model}"
        assert "GROQ(" in model_used, f"Expected model_used to contain 'GROQ(', got {model_used}"
        
        # Print metrics
        print(f"   ✅ Model {test_model} passed")
        print(f"   Response length: {len(response)} chars")
        print(f"   Duration: {duration_ms:.2f}ms")
        
        # Check if response looks like JSON
        assert "{" in response or "category" in response.lower(), f"Response should contain classification data for model {test_model}"
        
        # Reset conversation for next model
        handler.reset_conversation()


def test_groq_multiple_keys_load_balancing(api_key, allowed_models):
    """Test load balancing with multiple API keys"""
    if not allowed_models:
        pytest.skip("No allowed Groq models configured")
    
    test_model = allowed_models[0]
    
    # Create handler with multiple keys
    keys = [api_key, api_key]  # Use same key twice for testing
    handler = GroqHandler(api_keys=keys)
    
    # Make multiple requests
    for i in range(3):
        response, model = handler.classify_product(
            f"Test request {i}",
            model_override=test_model
        )
        assert response is not None, f"Request {i} should succeed"
    
    # Check stats
    stats = handler.get_load_balancer_stats()
    assert len(stats) > 0, "Should have usage stats"
    print(f"\n Load Balancer Stats: {stats}")


@pytest.mark.timeout(30)
def test_groq_response_time(handler, allowed_models):
    """Test that API responds within acceptable time for each model"""
    if not allowed_models:
        pytest.skip("No allowed Groq models configured")
    
    for test_model in allowed_models:
        print(f"\n⚡ Testing response time for model: {test_model}")
        start = time.time()
        
        response, model = handler.classify_product(
            "Quick test",
            model_override=test_model
        )
        
        elapsed = time.time() - start
        
        assert response is not None, f"Should get response from {test_model}"
        assert elapsed < 10.0, f"Response too slow for {test_model}: {elapsed:.2f}s (expected < 10s)"
        
        print(f"   ✅ {test_model}: {elapsed:.2f}s")
        handler.reset_conversation()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

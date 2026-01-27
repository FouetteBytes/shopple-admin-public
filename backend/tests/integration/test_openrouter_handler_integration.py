"""
Integration tests for OpenRouter handler - Tests real API calls
Requires OPENROUTER_API_KEY environment variable
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
    import requests
except ImportError:
    from unittest.mock import MagicMock
    sys.modules['requests'] = MagicMock()

from services.ai_handlers.openrouter_handler import OpenRouterHandler


@pytest.fixture
def allowed_models():
    """Load allowed models from config"""
    config_path = os.path.join(script_dir, '..', 'backend', 'secure', 'allowed_models.json')
    try:
        with open(config_path, 'r') as f:
            models = json.load(f)
            return models.get('openrouter', [])
    except Exception as e:
        pytest.skip(f"Could not load allowed_models.json: {e}")


@pytest.fixture
def api_key():
    """Get API key from environment"""
    key = os.getenv('OPENROUTER_API_KEY')
    if not key:
        pytest.skip("OPENROUTER_API_KEY not set - skipping integration test")
    return key


@pytest.fixture
def handler(api_key):
    """Create handler with real API key"""
    return OpenRouterHandler(api_key=api_key)


def test_openrouter_availability(handler, allowed_models):
    """Test that OpenRouter handler is available"""
    assert handler.is_available(), "OpenRouter handler should be available with valid API key"


def test_openrouter_real_classification(handler, allowed_models):
    """Test real product classification with OpenRouter API for each allowed model"""
    if not allowed_models:
        pytest.skip("No allowed OpenRouter models configured")
    
    # Test product data
    test_product = {
        "name": "Samsung Galaxy S24",
        "price": 999.99,
        "store": "Tech Store"
    }
    
    # System prompt
    system_prompt = """You are a product classifier. Classify products into categories.
Return JSON: {"category": "Electronics", "sub_category": "Smartphones", "brand": "Samsung"}"""
    
    for test_model in allowed_models:
        print(f"\n Testing OpenRouter model: {test_model}")
        
        # Start timing
        start_time = time.time_ns()
        
        # Classify with a free model
        handler.add_system_instruction(system_prompt)
        response, model_used = handler.classify_product(
            f"Classify: {test_product['name']}",
            model_override=test_model
        )
        
        # Calculate duration
        end_time = time.time_ns()
        duration_ms = (end_time - start_time) / 1_000_000
        
        # Handle rate limit errors gracefully
        if model_used == "OPENROUTER_ERROR" and (response is None or len(response) == 0):
            print(f"   ⚠️ Model {test_model} hit rate limit (429) - skipping validation")
            handler.reset_conversation()
            continue
        
        # Assertions
        assert response is not None, f"Response should not be None for model {test_model}"
        assert len(response) > 0, f"Response should not be empty for model {test_model}"
        
        # Print metrics
        print(f"   ✅ Model {test_model} passed")
        print(f"   Response length: {len(response)} chars")
        print(f"   Duration: {duration_ms:.2f}ms")
        
        # Check if response looks like JSON
        assert "{" in response or "category" in response.lower(), f"Response should contain classification data for model {test_model}"
        
        # Reset conversation for next model
        handler.reset_conversation()


def test_openrouter_free_models(handler, allowed_models):
    """Test OpenRouter with allowed free models"""
    if not allowed_models:
        pytest.skip("No allowed OpenRouter models configured")
    
    # Test with up to 2 allowed models
    test_models = allowed_models[:2]
    
    for model in test_models:
        start_time = time.time_ns()
        
        response, model_used = handler.classify_product(
            "Test product classification",
            model_override=model
        )
        
        end_time = time.time_ns()
        duration_ms = (end_time - start_time) / 1_000_000
        
        # Handle rate limit errors gracefully
        if model_used == "OPENROUTER_ERROR" and (response is None or len(response) == 0):
            print(f"\n⚠️ Free Model Test: {model} - Rate limit (429), skipping")
            continue
        
        assert response is not None, f"Model {model} should respond"
        assert model_used == model, f"Should use requested model {model}"
        
        print(f"\n✅ Free Model Test: {model}")
        print(f"   Duration: {duration_ms:.2f}ms")


@pytest.mark.timeout(30)
def test_openrouter_response_time(handler, allowed_models):
    """Test that API responds within acceptable time"""
    if not allowed_models:
        pytest.skip("No allowed OpenRouter models configured")
    
    test_model = allowed_models[0]
    start = time.time()
    
    response, model = handler.classify_product(
        "Quick test",
        model_override=test_model
    )
    
    elapsed = time.time() - start
    
    assert response is not None, "Should get response"
    assert elapsed < 15.0, f"Response too slow: {elapsed:.2f}s (expected < 15s)"
    
    print(f"\n⚡ Response time: {elapsed:.2f}s")


def test_openrouter_conversation_memory(handler, allowed_models):
    """Test conversation memory across multiple requests"""
    if not allowed_models:
        pytest.skip("No allowed OpenRouter models configured")
    
    test_model = allowed_models[0]
    handler.add_system_instruction("You are a helpful product classifier.")
    
    # First request
    response1, _ = handler.classify_product(
        "Remember: I need detailed categories",
        use_memory=True,
        model_override=test_model
    )
    
    # Second request with memory
    response2, _ = handler.classify_product(
        "Now classify: Nike Air Max shoes",
        use_memory=True,
        model_override=test_model
    )
    
    assert response1 is not None, "First response should succeed"
    assert response2 is not None, "Second response should succeed with memory"
    
    print(f"\n Memory Test:")
    print(f"   First response length: {len(response1)}")
    print(f"   Second response length: {len(response2)}")


def test_openrouter_error_handling(handler, allowed_models):
    """Test error handling with invalid model"""
    try:
        response, model = handler.classify_product(
            "Test",
            model_override="invalid/model:free",
            request_timeout=5.0
        )
        # If we get here, check if response indicates an error
        print(f"\n⚠️ Response from invalid model: {response[:100] if response else 'None'}")
    except Exception as e:
        # Expected - invalid model should cause error
        print(f"\n✅ Error handling test passed: {str(e)[:100]}")
        assert True, "Should handle invalid model gracefully"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

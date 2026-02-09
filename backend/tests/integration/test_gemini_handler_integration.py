"""
Integration tests for Gemini handler - Tests real API calls
Requires GEMINI_API_KEY environment variable
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
    import google.generativeai
except ImportError:
    from unittest.mock import MagicMock
    sys.modules['google'] = MagicMock()
    sys.modules['google.generativeai'] = MagicMock()

from services.ai_handlers.gemini_handler import GeminiHandler


@pytest.fixture
def allowed_models():
    """Load allowed models from config"""
    config_path = os.path.join(script_dir, '..', 'backend', 'secure', 'allowed_models.json')
    try:
        with open(config_path, 'r') as f:
            models = json.load(f)
            return models.get('gemini', [])
    except Exception as e:
        pytest.skip(f"Could not load allowed_models.json: {e}")


@pytest.fixture
def api_key():
    """Get API key from environment"""
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        pytest.skip("GEMINI_API_KEY not set - skipping integration test")
    return key


@pytest.fixture
def handler(api_key):
    """Create handler with real API key"""
    return GeminiHandler(api_key=api_key)


def test_gemini_availability(handler):
    """Test that Gemini handler is available"""
    assert handler.is_available(), "Gemini handler should be available with valid API key"


def test_gemini_real_classification(handler, allowed_models):
    """Test real product classification with Gemini API for each allowed model"""
    if not allowed_models:
        pytest.skip("No allowed Gemini models configured")
    
    for test_model in allowed_models:
        print(f"\n🧪 Testing Gemini model: {test_model}")
        
        # Start timing
        start_time = time.time_ns()
        
        # Test product data
        test_product = {
            "name": "Fresh Milk 1L",
            "price": 3.50,
            "store": "Cargills"
        }
        
        # System prompt
        system_prompt = """You are a product classifier. Classify products into categories.
Return JSON: {"category": "Dairy", "sub_category": "Milk", "brand": "Anchor"}"""
        
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
        assert "gemini" in model_used.lower(), f"Expected Gemini model, got {model_used}"
        
        # Print metrics
        print(f"   ✅ Model {test_model} passed")
        print(f"   Response length: {len(response)} chars")
        print(f"   Duration: {duration_ms:.2f}ms")
        
        # Check if response looks like JSON
        assert "{" in response or "category" in response.lower(), f"Response should contain classification data for model {test_model}"
        
        # Reset conversation for next model
        handler.reset_conversation()


@pytest.mark.timeout(30)
def test_gemini_response_time(handler, allowed_models):
    """Test that API responds within acceptable time"""
    if not allowed_models:
        pytest.skip("No allowed Gemini models configured")
    
    test_model = allowed_models[0]
    start = time.time()
    
    response, model = handler.classify_product(
        "Quick test product",
        model_override=test_model
    )
    
    elapsed = time.time() - start
    
    assert response is not None, "Should get response"
    assert elapsed < 15.0, f"Response too slow: {elapsed:.2f}s (expected < 15s)"
    
    print(f"\n⚡ Response time: {elapsed:.2f}s")


def test_gemini_conversation_memory(handler, allowed_models):
    """Test conversation memory across multiple requests"""
    if not allowed_models:
        pytest.skip("No allowed Gemini models configured")
    
    test_model = allowed_models[0]
    
    # First request with system instruction
    handler.add_system_instruction("You are a helpful product classifier.")
    
    response1, _ = handler.classify_product(
        "Remember: I prefer detailed classifications",
        use_memory=True,
        model_override=test_model
    )
    
    # Second request should have memory
    response2, _ = handler.classify_product(
        "Now classify: Apple iPhone 15",
        use_memory=True,
        model_override=test_model
    )
    
    assert response1 is not None, "First response should succeed"
    assert response2 is not None, "Second response should succeed with memory"
    
    print(f"\n🧠 Memory Test:")
    print(f"   First response length: {len(response1)}")
    print(f"   Second response length: {len(response2)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

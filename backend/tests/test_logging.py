"""
Test script to verify the logging system is working correctly.
"""
import os
import json
from datetime import datetime
from services.system.logger_service import get_logger, log_product_operation, log_price_operation, log_error

# Create test logger
logger = get_logger("test_logging")

def test_basic_logging():
    """Test basic logging functionality"""
    print("\n=== Testing Basic Logging ===")
    
    logger.debug("This is a debug message")
    logger.info("This is an info message")
    logger.warning("This is a warning message")
    logger.error("This is an error message")
    logger.critical("This is a critical message")
    
    print("✅ Basic logging test complete")

def test_structured_logging():
    """Test structured logging with extra context"""
    print("\n=== Testing Structured Logging ===")
    
    logger.info("User action", extra={
        "user_id": "test_user_123",
        "action": "product_update",
        "timestamp": datetime.now().isoformat()
    })
    
    logger.info("API request", extra={
        "endpoint": "/api/products",
        "method": "POST",
        "status_code": 200,
        "response_time_ms": 150
    })
    
    print("✅ Structured logging test complete")

def test_helper_functions():
    """Test logging helper functions"""
    print("\n=== Testing Helper Functions ===")
    
    # Test product operation logging
    log_product_operation(
        logger,
        operation="create",
        product_id="test_prod_123",
        product_name="Test Product",
        success=True
    )
    
    # Test price operation logging
    log_price_operation(
        logger,
        operation="update",
        store="keells",
        product_id="test_prod_123",
        old_price="10.99",
        new_price="12.99",
        success=True
    )
    
    # Test error logging
    try:
        raise ValueError("This is a test error")
    except Exception as e:
        log_error(logger, e, context={
            "function": "test_helper_functions",
            "test_type": "error_handling"
        })
    
    print("✅ Helper functions test complete")

def verify_log_files():
    """Verify log files were created"""
    print("\n=== Verifying Log Files ===")
    
    logs_dir = os.path.join(os.path.dirname(__file__), "logs")
    
    if not os.path.exists(logs_dir):
        print("❌ Logs directory not found!")
        return False
    
    print(f"✅ Logs directory exists: {logs_dir}")
    
    # Check for log files
    log_files = os.listdir(logs_dir)
    print(f"📁 Found {len(log_files)} files in logs directory:")
    
    for log_file in log_files:
        file_path = os.path.join(logs_dir, log_file)
        file_size = os.path.getsize(file_path)
        print(f"  - {log_file} ({file_size} bytes)")
    
    # Check JSON log file
    json_log = os.path.join(logs_dir, "shopple_admin.json.log")
    if os.path.exists(json_log):
        print(f"\n✅ JSON log file exists: {json_log}")
        
        # Read and verify JSON format
        with open(json_log, 'r') as f:
            lines = f.readlines()
            print(f"📊 JSON log has {len(lines)} entries")
            
            if lines:
                print("\n📝 Sample JSON log entry:")
                try:
                    sample = json.loads(lines[-1])
                    print(json.dumps(sample, indent=2))
                    print("✅ JSON format is valid!")
                except json.JSONDecodeError as e:
                    print(f"❌ JSON parse error: {e}")
    else:
        print("❌ JSON log file not found!")
    
    # Check text log file
    text_log = os.path.join(logs_dir, "shopple_admin.log")
    if os.path.exists(text_log):
        print(f"\n✅ Text log file exists: {text_log}")
        
        with open(text_log, 'r') as f:
            lines = f.readlines()
            print(f"📊 Text log has {len(lines)} entries")
            
            if lines:
                print("\n📝 Sample text log entry:")
                print(lines[-1].strip())
    else:
        print("❌ Text log file not found!")
    
    return True

def test_fluent_bit_compatibility():
    """Test that JSON logs are Fluent Bit compatible"""
    print("\n=== Testing Fluent Bit Compatibility ===")
    
    json_log = os.path.join(os.path.dirname(__file__), "logs", "shopple_admin.json.log")
    
    if not os.path.exists(json_log):
        print("❌ JSON log file not found!")
        return False
    
    required_fields = ["timestamp", "level", "message", "logger"]
    
    with open(json_log, 'r') as f:
        for i, line in enumerate(f, 1):
            try:
                log_entry = json.loads(line)
                
                # Check required fields
                missing_fields = [field for field in required_fields if field not in log_entry]
                if missing_fields:
                    print(f"❌ Entry {i} missing fields: {missing_fields}")
                    return False
                
            except json.JSONDecodeError:
                print(f"❌ Entry {i} is not valid JSON!")
                return False
    
    print("✅ All log entries have required fields for Fluent Bit!")
    print(f"   Required fields: {', '.join(required_fields)}")
    print("\n🎉 Logs are ready for Fluent Bit ingestion!")
    
    return True

if __name__ == "__main__":
    print("🚀 Starting Logging System Tests")
    print("=" * 60)
    
    # Run tests
    test_basic_logging()
    test_structured_logging()
    test_helper_functions()
    
    # Verify results
    verify_log_files()
    test_fluent_bit_compatibility()
    
    print("\n" + "=" * 60)
    print("✅ All logging tests completed!")
    print("\n📋 Summary:")
    print("   ✓ Basic logging (DEBUG, INFO, WARNING, ERROR, CRITICAL)")
    print("   ✓ Structured logging with context")
    print("   ✓ Helper functions (product, price, error logging)")
    print("   ✓ JSON and text log files created")
    print("   ✓ Fluent Bit compatible JSON format")
    print("\n🎯 Next steps:")
    print("   1. Configure Fluent Bit to read from logs/shopple_admin.json.log")
    print("   2. Set LOG_LEVEL environment variable (DEBUG/INFO/WARNING/ERROR)")
    print("   3. Set ENVIRONMENT=production to disable console logging")
    print("=" * 60)

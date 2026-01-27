# Backend Tests

This directory contains automated test suites for backend services.

## Test Files

### `test_product_image_service.py`

**Purpose**: Automated testing for Product Image Service (Firebase Storage integration)

**What it tests**:
- Image download from external URLs
- Upload to Firebase Storage
- Image updates with cleanup
- Image deletion
- Error handling for invalid URLs

**How to run locally**:
```powershell
cd backend/tests
python test_product_image_service.py
```

**Output**:
- Console output with detailed test results
- JSON file: `test_output/images/test_results_summary.json`

**CI/CD Integration**:
- Runs automatically via GitHub Actions
- Workflow: `.github/workflows/image-service-tests.yml`
- Results sent to Slack channel: `#image-service-tests`

## Test Output

All test results are saved to:
```
backend/test_output/
├── images/
│   └── test_results_summary.json
```

**Sample output structure**:
```json
{
  "summary": {
    "total_tests": 5,
    "passed": 5,
    "failed": 0,
    "duration": 12.45,
    "timestamp": "2025-11-05T10:30:00"
  },
  "tests": [
    {
      "name": "Test 1: Process New Product Image",
      "status": "passed",
      "duration": 2.34,
      "message": "Image uploaded successfully",
      "data": {
        "product_id": "test_keells_rice_redkekulu_1kg",
        "firebase_url": "https://..."
      }
    }
  ],
  "images": {
    "original": "https://firebasestorage.googleapis.com/...",
    "updated": "https://firebasestorage.googleapis.com/..."
  }
}
```

## Prerequisites

### Local Testing

1. **Python Dependencies**:
   ```powershell
   pip install -r backend/requirements.txt
   ```

2. **Firebase Configuration**:
   - Service account key: `backend/secure/firebase-service-account.json`
   - Environment variable: `FIREBASE_STORAGE_BUCKET=shopple-7a67b.firebasestorage.app`

3. **Environment Setup**:
   ```powershell
   # Set environment variable
   $env:FIREBASE_STORAGE_BUCKET = "shopple-7a67b.firebasestorage.app"
   
   # Run tests
   cd backend/tests
   python test_product_image_service.py
   ```

### CI/CD (GitHub Actions)

Required GitHub secrets:
- `FIREBASE_SERVICE_ACCOUNT_BASE64`: Base64-encoded service account JSON
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket name
- `SLACK_WEBHOOK_IMAGE_TESTS`: Slack webhook for notifications

See `doc/IMAGE_SERVICE_TEST_AUTOMATION_GUIDE.md` for complete setup instructions.

## Test Cleanup

**Important**: Test images use the prefix `test_` and are automatically cleaned up:

- **Local testing**: Manual cleanup required (delete from Firebase console)
- **CI/CD**: Automatic cleanup after Slack notification is sent

## Adding New Tests

To add a new test to the suite:

1. **Add test method** to `ImageServiceTestRunner` class:
   ```python
   def test_6_your_new_test(self):
       """Test 6: Your test description"""
       # Your test logic here
       return {
           'success': True/False,
           'message': 'Success message',
           'data': {...},
           'error': 'Error message if failed'
       }
   ```

2. **Call test in `run_all_tests()`**:
   ```python
   def run_all_tests(self):
       # ... existing tests ...
       self.run_test("Test 6: Your New Test", self.test_6_your_new_test)
   ```

3. **Run locally** to verify:
   ```powershell
   python test_product_image_service.py
   ```

4. **Commit and push** to trigger CI/CD workflow

## Monitoring

### Local Testing
- Watch console output for real-time results
- Check `test_output/images/test_results_summary.json` for details

### CI/CD Testing
- **GitHub Actions**: Monitor workflow execution in Actions tab
- **Slack**: Receive notifications in `#image-service-tests` channel
- **Artifacts**: Download test results from workflow artifacts

## Troubleshooting

### Tests Failing Locally

**Issue**: Cannot connect to Firebase
```
Solution: Check firebase-service-account.json exists and is valid
```

**Issue**: Image download fails
```
Solution: Check internet connection and source URL accessibility
```

### Tests Failing in CI/CD

**Issue**: Firebase authentication error
```
Solution: Verify FIREBASE_SERVICE_ACCOUNT_BASE64 secret is correct
```

**Issue**: Storage bucket not found
```
Solution: Verify FIREBASE_STORAGE_BUCKET secret matches your bucket
```

## Best Practices

1. **Always use `test_` prefix** for test product IDs
2. **Clean up test data** after local testing
3. **Check test results** before merging PRs
4. **Monitor Slack notifications** for CI/CD failures
5. **Update tests** when service code changes

## Related Documentation

- **Full Setup Guide**: `doc/IMAGE_SERVICE_TEST_AUTOMATION_GUIDE.md`
- **Image Service Docs**: `doc/FIREBASE_IMAGE_STORAGE_INTEGRATION.md`
- **Deployment Guide**: `doc/FIREBASE_IMAGE_STORAGE_DEPLOYMENT.md`

---

**Last Updated**: 2025-11-05  
**Maintained By**: Development Team

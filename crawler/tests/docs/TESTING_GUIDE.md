# Automated Testing Setup for Crawler

## 🎯 Overview

This project uses **GitHub Actions** for automated testing with the following features:

- ✅ Runs tests automatically on every push/PR
- ✅ Tests on multiple Python versions (3.11, 3.12)
- ✅ Daily scheduled tests (2 AM UTC) to catch website changes
- ✅ Manual trigger support
- ✅ Test artifacts uploaded for debugging
- ✅ Code quality checks (Black, isort, Flake8)

## 🚀 Quick Start

### 1. Install Testing Dependencies

```bash
cd crawler
pip install -r requirements-dev.txt
```

### 2. Run Tests Locally

#### Using Pytest (Recommended for CI/CD)
```bash
cd crawler/tests
pytest test_keells_beverages_pytest.py -v
```

#### Using Interactive Test Script
```bash
cd crawler/tests
python test_keells_beverages.py
```

## 📋 Test Structure

```
crawler/
├── tests/
│   ├── conftest.py                      # Pytest configuration
│   ├── test_keells_beverages.py         # Interactive test script
│   ├── test_keells_beverages_pytest.py  # Pytest-compatible tests
│   └── README.md                        # Test documentation
├── requirements.txt                     # Production dependencies
└── requirements-dev.txt                 # Development/testing dependencies
```

## 🧪 Test Suites

### 1. Crawler Initialization Test
Validates that the crawler can be imported and initialized.

### 2. Product Model Validation Test
Tests the Product Pydantic model with valid/invalid data.

### 3. Full Crawler Execution Test
- Runs the complete crawler
- Validates output file creation
- Checks product count limits
- Validates product structure

### 4. Output File Content Test
Ensures all products have required fields and valid data.

### 5. Price Format Validation Test
Verifies prices are correctly formatted:
- ✅ No "/ Unit" text
- ✅ Contains "Rs" currency
- ✅ No crossed-out prices

## 🔄 GitHub Actions Workflow

### Triggers

1. **Push to main/dev branches** (only crawler changes)
2. **Pull requests to main** (only crawler changes)
3. **Manual dispatch** (via GitHub Actions UI)
4. **Daily schedule** at 2 AM UTC

### Jobs

#### 1. Test Keells Crawler
- Matrix testing: Python 3.11 & 3.12
- Installs system dependencies (browser libraries)
- Installs Python dependencies
- Installs Playwright browsers
- Runs pytest tests with coverage
- Uploads test artifacts (JSON output, logs)

#### 2. Test Crawler Manager Integration
- Tests crawler manager imports
- Tests file manager imports
- Validates module compatibility

#### 3. Lint and Format Checks
- Black (code formatter)
- isort (import sorting)
- Flake8 (linting)

#### 4. Notifications
- Reports overall test status
- Fails if any critical tests fail

## 📊 Viewing Test Results

### On GitHub

1. Go to **Actions** tab
2. Select **Crawler Tests** workflow
3. View test results, logs, and artifacts

### Locally

```bash
# Run with verbose output
pytest -v

# Run with coverage report
pytest --cov=keells --cov-report=html

# Run specific test
pytest test_keells_beverages_pytest.py::TestKeellsBeveragesCrawler::test_crawler_execution -v

# Run with stdout (print statements)
pytest -s
```

## 🐛 Debugging Failed Tests

### Check Test Logs
```bash
# View detailed traceback
pytest --tb=long

# Stop at first failure
pytest -x

# Run last failed tests only
pytest --lf
```

### Check Output Artifacts
- Navigate to GitHub Actions run
- Download artifacts from "Summary" section
- Inspect JSON output files

### Local Debugging
```bash
# Run crawler directly
cd crawler/keells
python keells_beverages_crawler.py

# Check output
cat ../output/keells/beverages/keells_beverages.json
```

## 🔧 Configuration

### Environment Variables

Set in GitHub repository secrets or local `.env`:

```env
MAX_ITEMS=10              # Limit products for testing (default: 10)
```

### Pytest Configuration

Create `crawler/tests/pytest.ini`:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
asyncio_mode = auto
```

## 📈 Test Coverage

Generate coverage reports:

```bash
cd crawler/tests
pytest --cov=keells --cov-report=html --cov-report=term

# Open coverage report
# Windows
start htmlcov/index.html

# Linux/Mac
open htmlcov/index.html
```

## 🚨 Adding New Tests

### 1. Create Test File
```python
# crawler/tests/test_new_crawler.py
import pytest
from my_crawler import main

class TestNewCrawler:
    @pytest.mark.asyncio
    async def test_crawler(self):
        result = await main()
        assert result is not None
```

### 2. Update GitHub Actions
Add new test job in `.github/workflows/crawler-tests.yml`

### 3. Run Tests
```bash
pytest tests/test_new_crawler.py -v
```

## 🎯 Best Practices

1. **Keep tests fast** - Use MAX_ITEMS=10 for CI/CD
2. **Test edge cases** - Empty results, network errors, etc.
3. **Use fixtures** - Share setup code between tests
4. **Async tests** - Use `@pytest.mark.asyncio` for async functions
5. **Assert messages** - Provide clear failure messages
6. **Clean up** - Remove test artifacts after tests

## 🔐 Security

- ❌ Never commit API keys to `.env`
- ✅ Use GitHub Secrets for sensitive data
- ✅ Use `.gitignore` for local config files

## 📚 Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright Documentation](https://playwright.dev/python/)
- [Crawl4AI Documentation](https://crawl4ai.com/)

## 🤝 Contributing

When adding crawler tests:
1. Write pytest-compatible tests
2. Ensure tests pass locally
3. Update this documentation
4. Submit PR with test results

## 📞 Support

For issues with automated testing:
1. Check GitHub Actions logs
2. Run tests locally for debugging
3. Review test documentation
4. Check crawler code changes

---

**Last Updated:** November 2, 2025

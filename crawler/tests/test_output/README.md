# Test Output Folder

This folder contains outputs from **test runs only**.

## Purpose

- **Isolated Testing**: Test outputs are kept separate from production data
- **Clean Development**: Test results don't pollute the main `crawler/output` folder
- **Safe Experimentation**: Run tests without affecting real crawler outputs

## Structure

```
test_output/
├── keells/
│   ├── beverages/
│   │   └── keells_beverages.json    (test crawl results)
│   └── ...
└── cargills/
    └── ...
```

## Git Ignore

This folder is included in `.gitignore` to prevent test outputs from being committed to the repository.

## Production vs Test Outputs

| Aspect | Production | Test |
|--------|-----------|------|
| Folder | `crawler/output/` | `crawler/tests/test_output/` |
| Usage | Real crawler runs | Test suite runs |
| Git Tracked | ✅ Yes | ❌ No (gitignored) |
| Item Limit | Unlimited (or env var) | 50 items max (by default) |

## How It Works

When tests are run with `test_mode=True`, the crawler automatically saves outputs here instead of the production folder:

```python
# Production run
await main()  # Saves to crawler/output/

# Test run
await main(test_mode=True)  # Saves to crawler/tests/test_output/
```

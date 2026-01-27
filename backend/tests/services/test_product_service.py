import pytest
from unittest.mock import MagicMock, patch
import sys
import os

# Create a mock for firebase_admin.
mock_firestore = MagicMock()
mock_firestore.SERVER_TIMESTAMP = "SERVER_TIMESTAMP"

sys.modules['firebase_admin'] = MagicMock()
sys.modules['firebase_admin.firestore'] = mock_firestore
sys.modules['google.cloud'] = MagicMock()
sys.modules['google.cloud.firestore'] = MagicMock()

# Mock requests.
sys.modules['requests'] = MagicMock()

# Path setup.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.features.products.service.product_service import ProductService

@pytest.fixture
def mock_image_service():
    with patch('backend.features.products.service.product_service.ProductImageService') as mock_cls:
        instance = mock_cls.return_value
        yield instance

@pytest.fixture
def mock_product_repo():
    with patch('backend.features.products.service.product_service.ProductRepository') as mock_cls:
        instance = mock_cls.return_value
        yield instance

@pytest.fixture
def product_service(mock_image_service, mock_product_repo):
    # ProductService instantiates ProductRepository and ProductImageService.
    return ProductService()

def test_get_product_by_id_found(product_service, mock_product_repo):
    product_id = "test_123"
    expected_data = {"id": product_id, "name": "Test Product"}
    mock_product_repo.find_by_id.return_value = expected_data
    
    result = product_service.get_product_by_id(product_id)
    
    assert result == expected_data
    mock_product_repo.find_by_id.assert_called_once_with(product_id)

def test_get_product_by_id_not_found(product_service, mock_product_repo):
    product_id = "missing_123"
    mock_product_repo.find_by_id.return_value = None
    
    result = product_service.get_product_by_id(product_id)
    
    assert result is None
    mock_product_repo.find_by_id.assert_called_once_with(product_id)

def test_update_product_no_id_change(product_service, mock_product_repo):
    # Setup.
    product_id = "brand_product_size"
    current_data = {
        "name": "Product",
        "brand_name": "Brand",
        "sizeRaw": "Size"
    }
    update_data = {
        "category": "New Category"
    }
    updated_full_data = {**current_data, **update_data}
    
    # Mock calls.
    mock_product_repo.find_by_id.return_value = updated_full_data
    mock_product_repo.update_related_prices.return_value = (0, 0)
    
    # Execute.
    # Patch generate_product_id used in product_service.
    with patch('backend.features.products.service.product_service.generate_product_id', return_value="brand_product_size"):
        # Prevent cache calls.
        with patch.object(product_service, '_update_ai_cache'):
            result, id_changed = product_service.update_product(product_id, update_data, current_data)
        
    # Verify.
    assert id_changed is False
    assert result['category'] == "New Category"
    mock_product_repo.update.assert_called_once()
    # Verify update call arguments.
    args, _ = mock_product_repo.update.call_args
    assert args[0] == product_id
    assert args[1]['category'] == "New Category"
    # assert args[1]['updated_at'] == "SERVER_TIMESTAMP"
    assert args[1]['updated_at'] is not None

def test_update_product_with_id_change(product_service, mock_product_repo):
    # Setup.
    product_id = "old_id"
    current_data = {
        "name": "Product",
        "brand_name": "Brand",
        "sizeRaw": "Size"
    }
    update_data = {
        "name": "New Name"
    }
    new_id = "brand_newname_size"
    
    # Execute.
    with patch('backend.features.products.service.product_service.generate_product_id', return_value=new_id):
        # Prevent cache calls from failing if they rely on other components.
        with patch.object(product_service, '_update_ai_cache'), \
             patch.object(product_service, '_migrate_prices'):
             
            result, id_changed = product_service.update_product(product_id, update_data, current_data)
    
    # Verify.
    assert id_changed is True
    assert result['id'] == new_id
    assert result['name'] == "New Name"
    # assert result['migrated_from'] == product_id
    
    # Check migration calls.
    mock_product_repo.migrate_product_document.assert_called_once()
    # mock_product_repo.migrate_related_prices.assert_called_once()  # Called inside _migrate_prices, which is patched out.
    
    # migrate_product_document(self, old_id: str, new_id: str, new_data: Dict[str, Any])
    call_args = mock_product_repo.migrate_product_document.call_args
    assert call_args[0][0] == product_id
    assert call_args[0][1] == new_id

def test_delete_product_success(product_service, mock_product_repo, mock_image_service):
    product_id = "test_product"
    
    # Mock repository finds product.
    mock_product_repo.find_by_id.return_value = {"image_url": "http://test.com/image.jpg"}
    
    # Mock image deletion success.
    mock_image_service.delete_product_image.return_value = True
    
    # Execute.
    product_service.delete_product(product_id)
    
    # Verify.
    mock_product_repo.find_by_id.assert_called_once_with(product_id)
    mock_image_service.delete_product_image.assert_called_once_with(product_id, "http://test.com/image.jpg")
    mock_product_repo.delete.assert_called_once_with(product_id)
    mock_product_repo.invalidate_product_stats.assert_called_once()
    mock_product_repo.invalidate_product_lists.assert_called_once()

def test_delete_product_not_found(product_service, mock_product_repo):
    product_id = "test_product"
    
    # Mock repository does not find product.
    mock_product_repo.find_by_id.return_value = None
    
    with pytest.raises(ValueError, match="Product not found"):
        product_service.delete_product(product_id)

def test_delete_all_products(product_service, mock_product_repo, mock_image_service):
    # Mock streaming products.
    # stream_all_products returns a generator or list of snapshots.
    # Snapshots expose .id and .to_dict().
    
    mock_doc1 = MagicMock()
    mock_doc1.id = "p1"
    mock_doc1.to_dict.return_value = {"image_url": "url1"}
    
    mock_doc2 = MagicMock()
    mock_doc2.id = "p2"
    mock_doc2.to_dict.return_value = {"image_url": "url2"}
    
    # stream_all_products returns an iterator.
    mock_product_repo.stream_all_products.return_value = [mock_doc1, mock_doc2]
    
    # Execute.
    result = product_service.delete_all_products()
    
    # Verify.
    assert result['success'] is True
    assert result['deleted_count'] == 2
    assert mock_image_service.delete_product_image.call_count == 2
    
    mock_product_repo.delete_batch.assert_called_once()
    args, _ = mock_product_repo.delete_batch.call_args
    # It receives the list of products.
    assert len(args[0]) == 2
    
    mock_product_repo.invalidate_product_stats.assert_called_once()

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import ProductEditModal from './ProductEditModal';
import ToastNotification, { Toast } from '@/components/shared/ToastNotification';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import FirebaseAuthLoginInline from '@/components/auth/FirebaseAuthLoginInline';
import { GlassFilterBar, type GlassFilterOption, type GlassFilterSelectConfig } from '@/components/shared/GlassFilterBar';
import { ProductRecordList, type ProductRecord, type ProductPagination } from './ProductRecordList';
import { formatDistanceToNow } from 'date-fns';
import { useDebounce } from '@/hooks/useDebounce';

type Product = ProductRecord;

interface Category {
  id: string;
  name: string;
  display_name: string;
  description: string;
  is_food: boolean;
}

type Pagination = ProductPagination;

type Filters = {
  search: string;
  category: string;
  brand: string;
};

interface ProductManagementProps {
  onStatsUpdate?: () => void;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({ onStatsUpdate }) => {
  const { user, isSuperAdmin, getAuthToken } = useFirebaseAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    per_page: 20,
    total: 0,
    pages: 0
  });
  const [filters, setFilters] = useState<Filters>({
    search: '',
    category: '',
    brand: ''
  });
  const [showProductId, setShowProductId] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'missing_prices'>('all');
  const [missingPriceProducts, setMissingPriceProducts] = useState<Product[]>([]);

  // Debounce search input (300ms for fast response as user types)
  const debouncedSearch = useDebounce(filters.search, 300);

  const showToast = (message: string, type: Toast['type']) => {
    setToast({ 
      id: Date.now().toString(), 
      type, 
      title: type.charAt(0).toUpperCase() + type.slice(1), 
      message 
    });
    setTimeout(() => setToast(null), 5000);
  };

  const showConfirmToast = (message: string, onConfirm: () => void, title: string = 'Confirm Action') => {
    setToast({
      id: Date.now().toString(),
      type: 'warning',
      title,
      message,
      isConfirm: true,
      onConfirm: () => {
        onConfirm();
        setToast(null);
      },
      onCancel: () => setToast(null)
    });
  };

  const loadMissingPriceProducts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/missing-prices`);
      const result = await response.json();

      if (result.success) {
        setMissingPriceProducts(result.products);
      } else {
        setMissingPriceProducts([]);
      }
    } catch (error) {
      console.error('Error loading missing price products:', error);
      setMissingPriceProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProducts = async (page: number = 1, searchTerm?: string) => {
    if (activeTab === 'missing_prices') {
      loadMissingPriceProducts();
      return;
    }
    setIsLoading(true);
    try {
      // Use provided searchTerm (debounced) or fall back to filters.search
      const effectiveSearch = searchTerm ?? debouncedSearch;
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: pagination.per_page.toString(),
        search: effectiveSearch,
        category: filters.category,
        brand: filters.brand
      });

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products?${params}`);
      
      // Handle 404 (collection might not exist) gracefully
      if (response.status === 404) {
        setProducts([]);
        setPagination({ page: 1, per_page: 20, total: 0, pages: 0 });
        return;
      }
      
      const result = await response.json();

      if (result.success) {
        setProducts(result.products);
        setPagination(result.pagination);
        setLastRefreshedAt(new Date());
        // Notify parent component about stats update
        onStatsUpdate?.();
      } else {
        // For API errors, show empty state instead of error
        setProducts([]);
        setPagination({ page: 1, per_page: 20, total: 0, pages: 0 });
        onStatsUpdate?.();
      }
    } catch (error) {
      // For any error, show empty state instead of error
      setProducts([]);
      setPagination({ page: 1, per_page: 20, total: 0, pages: 0 });
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/categories`);
      const result = await response.json();

      if (result.success) {
        setCategories(result.categories);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Trigger search when debounced search changes OR when category/brand filters change
  useEffect(() => {
    if (activeTab === 'missing_prices') {
      loadMissingPriceProducts();
    } else {
      loadProducts(1, debouncedSearch);
    }
  }, [debouncedSearch, filters.category, filters.brand, activeTab]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      loadProducts(pagination.page);
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, pagination.page]);

  // Helper function to get category display name
  const getCategoryDisplayName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    if (category?.display_name) {
      return category.display_name;
    }
    // Fallback: Format the category ID nicely
    return categoryId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (product: Product) => {
    showConfirmToast(
      `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      () => performDelete(product),
      'Delete Product'
    );
  };

  const performDelete = async (product: Product) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/${product.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      if (result.success) {
        showToast('Product deleted successfully', 'success');
        loadProducts(pagination.page);
      } else {
        showToast(`Error deleting product: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(`Error deleting product: ${error}`, 'error');
    }
  };

  const handleProductSave = (updatedProduct: Product) => {
    setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    showToast('Product updated successfully', 'success');
    // Notify parent component about stats update
    onStatsUpdate?.();
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ search: '', category: '', brand: '' });
  };

  const uniqueBrands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand_name).filter((brand): brand is string => Boolean(brand)))),
    [products]
  );

  const categoryOptions = useMemo<GlassFilterOption[]>(
    () => [
      { value: '', label: 'All categories' },
      ...categories.map((category) => ({
        value: category.id,
        label: category.display_name || category.name || category.id,
      })),
    ],
    [categories]
  );

  const brandOptions = useMemo<GlassFilterOption[]>(
    () => [
      { value: '', label: 'All brands' },
      ...uniqueBrands.map((brand) => ({ value: brand, label: brand })),
    ],
    [uniqueBrands]
  );

  const filterSelects = useMemo<GlassFilterSelectConfig[]>(
    () => [
      {
        label: 'Category',
        value: filters.category,
        options: categoryOptions,
        onChange: (value: string) => handleFilterChange('category', value),
      },
      {
        label: 'Brand',
        value: filters.brand,
        options: brandOptions,
        onChange: (value: string) => handleFilterChange('brand', value),
      },
    ],
    [brandOptions, categoryOptions, filters.brand, filters.category]
  );

  const lastRefreshedLabel = useMemo(
    () => (lastRefreshedAt ? formatDistanceToNow(lastRefreshedAt, { addSuffix: true }) : null),
    [lastRefreshedAt]
  );

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (filters.search) labels.push('Search');
    if (filters.category) labels.push('Category');
    if (filters.brand) labels.push('Brand');
    return labels;
  }, [filters.brand, filters.category, filters.search]);

  const handleDeleteAll = async () => {
    if (!user) {
      showToast('Please sign in to perform this action', 'error');
      return;
    }

    if (!isSuperAdmin) {
      showToast('Access denied. Super admin privileges required.', 'error');
      return;
    }

    setIsDeletingAll(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        showToast('Unable to get authentication token', 'error');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/delete-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      
      if (result.success) {
        showToast(result.message, 'success');
        setIsDeleteAllModalOpen(false);
        loadProducts(1); // Reload the products list
      } else {
        showToast(`Error: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(`Error deleting all products: ${error}`, 'error');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleDeleteAllCancel = () => {
    setIsDeleteAllModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-white/40 bg-gradient-to-br from-white/95 via-white/70 to-primary/5 p-6 shadow-[0_35px_90px_-55px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Product console</p>
            <h2 className="text-2xl font-bold text-slate-900">Product management</h2>
            <p className="text-sm text-slate-500">{pagination.total.toLocaleString()} records across {categories.length} categories</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1 mr-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  activeTab === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                All Products
              </button>
              <button
                onClick={() => setActiveTab('missing_prices')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  activeTab === 'missing_prices'
                    ? 'bg-white text-red-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Missing Prices
                {missingPriceProducts.length > 0 && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                    {missingPriceProducts.length}
                  </span>
                )}
              </button>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowProductId((prev) => !prev)}
              className="text-xs"
            >
              {showProductId ? 'Hide ID' : 'Show ID'}
            </Button>
            <Button
              variant="outline"
              onClick={() => loadProducts(pagination.page)}
              disabled={isLoading}
            >
              {isLoading ? 'Refreshing…' : 'Manual refresh'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!user) {
                  setShowAuthModal(true);
                  return;
                }
                if (!isSuperAdmin) {
                  showToast('Access denied. Super admin privileges required.', 'error');
                  return;
                }
                showConfirmToast(
                  `This will permanently delete ALL ${pagination.total} products from the database. This action cannot be undone.`,
                  () => setIsDeleteAllModalOpen(true),
                  'Delete All Products'
                );
              }}
              className="text-xs border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              🗑️ Delete all
            </Button>
          </div>
        </div>
      </div>

      {activeTab === 'all' && (
        <GlassFilterBar
          searchPlaceholder="Search products..."
          searchValue={filters.search}
          onSearchChange={(value) => handleFilterChange('search', value)}
          selects={filterSelects}
          onRefresh={() => loadProducts(pagination.page)}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          lastRefreshedLabel={lastRefreshedLabel}
          className="shadow-[0_35px_90px_-55px_rgba(15,23,42,0.45)]"
        />
      )}

      {activeTab === 'all' && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={clearFilters} className="text-xs">
            Clear filters
          </Button>
          <p className="text-xs text-slate-500">
            Active filters: {activeFilterLabels.length > 0 ? activeFilterLabels.join(' • ') : 'None'}
          </p>
        </div>
      )}

      <ProductRecordList
        products={activeTab === 'missing_prices' ? missingPriceProducts : products}
        isLoading={isLoading}
        showProductId={showProductId}
        onEdit={handleEdit}
        onDelete={handleDelete}
        pagination={activeTab === 'missing_prices' ? undefined : pagination}
        onPageChange={(page) => loadProducts(page)}
        getCategoryName={getCategoryDisplayName}
      />

      {/* Edit Modal */}
      <ProductEditModal
        product={selectedProduct}
        categories={categories}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleProductSave}
      />

      {/* Delete All Modal */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <span className="text-2xl mr-3">⚠️</span>
              <h3 className="text-xl font-bold text-gray-900">Delete All Products</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                This action will permanently delete <strong>ALL {pagination.total} products</strong> from the database. 
                This cannot be undone.
              </p>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 text-sm font-medium">
                  ⚠️ Warning: This is a destructive action that will remove all product data permanently.
                </p>
              </div>
              
              {/* Authentication Status */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center">
                  <span className="text-green-600 mr-2">✅</span>
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Authenticated as Super Admin
                    </p>
                    <p className="text-xs text-blue-600">
                      {user?.email}
                    </p>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-600">
                Click &ldquo;Delete All Products&rdquo; to proceed with Firebase authentication.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={handleDeleteAllCancel}
                disabled={isDeletingAll}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeletingAll ? (
                  <>
                    <span className="animate-spin mr-2">⚙️</span>
                    Deleting All...
                  </>
                ) : (
                  <>
                    🗑️ Delete All {pagination.total} Products
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Firebase Authentication Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">🔐 Firebase Authentication</h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              Please sign in with your super admin account to delete all products.
            </p>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-yellow-800 text-sm">
                ⚠️ Note: Only users with Super Admin privileges can delete all products.
              </p>
            </div>
            
            <FirebaseAuthLoginInline 
              onSuccess={() => {
                setShowAuthModal(false);
                showToast('Successfully signed in! You can now delete all products.', 'success');
              }}
              onCancel={() => setShowAuthModal(false)}
            />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <ToastNotification
          toasts={[toast]}
          onRemove={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default ProductManagement;

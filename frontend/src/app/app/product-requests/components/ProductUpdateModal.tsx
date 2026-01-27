import { useCallback, useEffect, useState, useRef } from 'react';
import { CloseCircle, Gallery, TickCircle, Clock } from 'iconsax-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '@/lib/api';
import { useGlobalToast } from '@/contexts/ToastContext';

const ImageEditor = dynamic(() => import('@/components/shared/ImageEditor'), {
  ssr: false,
});

type ProductUpdateData = {
  id: string;
  name: string;
  brand_name: string;
  category: string;
  sizeRaw: string;
  image_url: string;
  variety?: string;
};

type ProductUpdateModalProps = {
  productId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function ProductUpdateModal({ productId, onClose, onSuccess }: ProductUpdateModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<ProductUpdateData | null>(null);
  const [formData, setFormData] = useState<Partial<ProductUpdateData>>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<{id: string; display_name: string}>>([]);
  const [imageSource, setImageSource] = useState<'url' | 'upload'>('url');
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string>('');
  const [showImageConfirm, setShowImageConfirm] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string>('');
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { success, error: showError } = useGlobalToast();

  // Helper to get category display name
  const getCategoryDisplayName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    return category?.display_name || categoryId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const fetchProduct = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}`);
      if (!response.ok) throw new Error('Failed to fetch product');
      const data = await response.json();
      if (data.success && data.product) {
        setProduct(data.product);
        setFormData(data.product);
        setImagePreview(data.product.image_url);
      }
    } catch (err: any) {
      showError('Failed to load product', err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [productId, showError]);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/categories`);
      if (!response.ok) throw new Error('Failed to fetch categories');
      const data = await response.json();
      if (data.categories) {
        setCategories(data.categories.map((c: any) => ({ id: c.id, display_name: c.display_name || c.name })));
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  useEffect(() => {
    fetchProduct();
    fetchCategories();
  }, [fetchProduct, fetchCategories]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageError('Please select a valid image file');
      return;
    }

    setIsLoadingImage(true);
    setImageError('');

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('product_id', productId);
      // Send old image URL so backend can delete it from Firebase
      if (product?.image_url) {
        formData.append('old_image_url', product.image_url);
      }

      const response = await fetch(`${API_BASE_URL}/api/products/upload-image`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success && result.image_url) {
        setTempImageUrl(result.image_url);
        setImagePreview(result.image_url);
        setShowImageConfirm(true);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      setImageError(error.message || 'Failed to upload image');
    } finally {
      setIsLoadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImageUrlDownload = async (url: string) => {
    if (!url) return;

    setIsLoadingImage(true);
    setImageError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/download-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, product_id: productId }),
      });

      const result = await response.json();
      if (result.success && result.image_url) {
        setTempImageUrl(result.image_url);
        setImagePreview(result.image_url);
        setShowImageConfirm(true);
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error: any) {
      setImageError(error.message || 'Failed to download image');
    } finally {
      setIsLoadingImage(false);
    }
  };

  const confirmImage = () => {
    if (tempImageUrl) {
      setFormData((prev) => ({ ...prev, image_url: tempImageUrl }));
      setShowImageConfirm(false);
      setTempImageUrl('');
    }
  };

  const rejectImage = () => {
    setImagePreview(formData.image_url || null);
    setTempImageUrl('');
    setShowImageConfirm(false);
  };

  const openImageEditor = () => {
    if (imagePreview) {
      setImageToEdit(imagePreview);
      setShowImageEditor(true);
    }
  };

  const handleImageEditorSave = async (editedImageUrl: string, editedImageBlob: Blob) => {
    setIsLoadingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', editedImageBlob, 'edited-image.png');
      formData.append('product_id', productId);
      // Send old image URL so backend can delete it from Firebase
      if (product?.image_url) {
        formData.append('old_image_url', product.image_url);
      }

      const response = await fetch(`${API_BASE_URL}/api/products/upload-image`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (result.success && result.image_url) {
        setFormData((prev) => ({ ...prev, image_url: result.image_url }));
        setImagePreview(result.image_url);
        setShowImageEditor(false);
        setImageToEdit('');
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      setImageError(error.message || 'Failed to save edited image');
    } finally {
      setIsLoadingImage(false);
    }
  };

  const handleImageEditorCancel = () => {
    setShowImageEditor(false);
    setImageToEdit('');
  };

  const handleSubmit = useCallback(async () => {
    if (!product) return;
    
    try {
      setSaving(true);
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update product');
      }
      
      const result = await response.json();
      if (result.success) {
        success('Product updated', 'Product details have been updated successfully');
        onSuccess();
        onClose();
      } else {
        throw new Error(result.error || 'Update failed');
      }
    } catch (err: any) {
      showError('Update failed', err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }, [product, productId, formData, onSuccess, onClose, success, showError]);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl"
        >
          <div className="flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-primary/5 to-blue-50 px-6 py-4">
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-xl font-bold text-gray-900">Update Product</h2>
              <p className="text-sm text-gray-500">Modify product details and image</p>
            </motion.div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition-colors hover:bg-white hover:text-gray-600"
            >
              <CloseCircle size={24} />
            </motion.button>
          </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-auto p-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Image Section */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Product Image</label>
              
              {/* Image Source Toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImageSource('url')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    imageSource === 'url'
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  URL
                </button>
                <button
                  type="button"
                  onClick={() => setImageSource('upload')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    imageSource === 'upload'
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Upload File
                </button>
              </div>

              {/* Image Preview */}
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border-2 border-gray-200 bg-gray-50">
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt={formData.name || 'Product'}
                    fill
                    className="object-contain p-2"
                    sizes="400px"
                    unoptimized
                    onError={() => setImagePreview(null)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Gallery size={48} className="text-gray-300" />
                  </div>
                )}
              </div>

              {/* URL Input */}
              {imageSource === 'url' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={tempImageUrl || formData.image_url || ''}
                      onChange={(e) => setTempImageUrl(e.target.value)}
                      placeholder="Enter image URL"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => tempImageUrl && handleImageUrlDownload(tempImageUrl)}
                      disabled={isLoadingImage || !tempImageUrl}
                      className="whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:bg-primary/50"
                    >
                      {isLoadingImage ? 'Loading...' : 'Download'}
                    </button>
                  </div>
                </div>
              )}

              {/* File Upload */}
              {imageSource === 'upload' && (
                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoadingImage}
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:border-primary hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isLoadingImage ? 'Uploading...' : ' Choose Image File'}
                  </button>
                </div>
              )}

              {/* Error Message */}
              {imageError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                  <p className="text-xs text-red-600">{imageError}</p>
                </div>
              )}

              {/* Edit Image Button */}
              {imagePreview && (
                <button
                  type="button"
                  onClick={openImageEditor}
                  disabled={isLoadingImage}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                   Edit Image
                </button>
              )}

              {/* Confirmation Buttons */}
              {showImageConfirm && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="mb-2 text-xs font-medium text-blue-900">Confirm this image?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={confirmImage}
                      className="flex-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                    >
                      ✓ Confirm
                    </button>
                    <button
                      type="button"
                      onClick={rejectImage}
                      className="flex-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      ✗ Reject
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Product Name *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Brand</label>
                <input
                  type="text"
                  value={formData.brand_name || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, brand_name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Category *</label>
                <select
                  value={formData.category || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  required
                >
                  <option value="">Select category...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.display_name}
                    </option>
                  ))}
                </select>
                {formData.category && (
                  <p className="mt-1 text-xs text-gray-600">
                    Selected: <span className="font-medium text-primary">{getCategoryDisplayName(formData.category)}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Size</label>
                <input
                  type="text"
                  value={formData.sizeRaw || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sizeRaw: e.target.value }))}
                  placeholder="e.g., 500ml, 1kg, 250g"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Variety</label>
                <input
                  type="text"
                  value={formData.variety || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, variety: e.target.value }))}
                  placeholder="e.g., Chocolate, Vanilla"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <Clock size={20} className="mt-0.5 flex-shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900">
                  <strong>Smart ID Management:</strong> Automatic Migration
                </p>
                <p className="text-xs text-amber-800">
                  • If brand/name/size changes → Product ID regenerates automatically<br />
                  • <strong>ALL</strong> price history records migrate to new ID instantly<br />
                  • <strong>ALL</strong> current prices update across all stores<br />
                  • <strong>Zero</strong> duplicate indexes or abandoned records<br />
                  • Historical price graphs work seamlessly with new ID<br />
                  • If only variety/category/image changes → ID stays the same
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.name || !formData.category}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Updating...
              </>
            ) : (
              <>
                <TickCircle size={16} />
                Update Product
              </>
            )}
          </button>
        </div>
        </motion.div>

        {/* Image Editor Modal */}
        {showImageEditor && imageToEdit && (
          <ImageEditor
            imageUrl={imageToEdit}
            onSave={handleImageEditorSave}
            onCancel={handleImageEditorCancel}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

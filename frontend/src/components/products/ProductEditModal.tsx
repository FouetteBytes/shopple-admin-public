'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { API_BASE_URL } from '@/lib/api';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const ImageEditor = dynamic(() => import('@/components/shared/ImageEditor'), {
  ssr: false,
});

interface Product {
  id: string;
  name: string;
  brand_name: string;
  category: string;
  variety: string;
  size: string | number;
  sizeUnit?: string;
  sizeRaw?: string;
  image_url: string;
  original_name: string;
  is_active: boolean;
  created_at: any;
  updated_at: any;
  price?: string;
  description?: string;
}

interface Category {
  id: string;
  name: string;
  display_name: string;
  description: string;
  is_food: boolean;
}

interface ProductEditModalProps {
  product: Product | null;
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product) => void;
}

const ProductEditModal: React.FC<ProductEditModalProps> = ({
  product,
  categories,
  isOpen,
  onClose,
  onSave
}) => {
  // Debug: Check API_BASE_URL
  console.log(' [ProductEditModal] Component loaded, API_BASE_URL:', API_BASE_URL);
  
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showEditProductId, setShowEditProductId] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageSource, setImageSource] = useState<'url' | 'upload'>('url');
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string>('');
  const [showImageConfirm, setShowImageConfirm] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string>('');
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get category display name
  const getCategoryDisplayName = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    return category?.display_name || categoryId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  useEffect(() => {
    if (product) {
      setFormData({
        id: product.id,
        name: product.name,
        brand_name: product.brand_name,
        category: product.category,
        variety: product.variety,
        size: product.size,
        sizeUnit: product.sizeUnit,
        sizeRaw: product.sizeRaw,
        image_url: product.image_url,
        original_name: product.original_name,
        is_active: product.is_active
      });
      setImagePreview(product.image_url || '');
      setTempImageUrl('');
      setShowImageConfirm(false);
      setImageError('');
    }
  }, [product, categories]);

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
      const uploadFormData = new FormData();
      uploadFormData.append('image', file);
      uploadFormData.append('product_id', product?.id || '');
      // Send old image URL so backend can delete it from Firebase
      if (product?.image_url) {
        uploadFormData.append('old_image_url', product.image_url);
      }

      const response = await fetch(`${API_BASE_URL}/api/products/upload-image`, {
        method: 'POST',
        body: uploadFormData,
      });

      const result = await response.json();
      if (result.success && result.image_url) {
        setTempImageUrl(result.image_url);
        setImagePreview(result.image_url);
        setShowImageConfirm(true);
      } else {
        setImageError(result.error || 'Failed to upload image');
      }
    } catch (error) {
      setImageError('Failed to upload image');
      console.error('Image upload error:', error);
    } finally {
      setIsLoadingImage(false);
    }
  };

  const handleImageUrlDownload = async (url: string) => {
    if (!url.trim()) return;

    setIsLoadingImage(true);
    setImageError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/download-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: url,
          product_id: product?.id || '',
        }),
      });

      const result = await response.json();
      if (result.success && result.image_url) {
        setTempImageUrl(result.image_url);
        setImagePreview(result.image_url);
        setShowImageConfirm(true);
      } else {
        setImageError(result.error || 'Failed to download image');
      }
    } catch (error) {
      setImageError('Failed to download image');
      console.error('Image download error:', error);
    } finally {
      setIsLoadingImage(false);
    }
  };

  const confirmImage = () => {
    setFormData({ ...formData, image_url: tempImageUrl });
    setShowImageConfirm(false);
    setImageError('');
  };

  const rejectImage = () => {
    setTempImageUrl('');
    setImagePreview(formData.image_url || '');
    setShowImageConfirm(false);
    setImageError('');
  };

  const openImageEditor = () => {
    const urlToEdit = tempImageUrl || imagePreview || formData.image_url || '';
    if (urlToEdit) {
      setImageToEdit(urlToEdit);
      setShowImageEditor(true);
    }
  };

  const handleImageEditorSave = async (editedImageUrl: string, editedImageBlob: Blob) => {
    console.log(' [ProductEditModal] Starting image editor save');
    console.log(' [ProductEditModal] Blob details:', {
      size: editedImageBlob.size,
      type: editedImageBlob.type,
      productId: product?.id
    });
    
    setIsLoadingImage(true);
    setImageError('');

    try {
      // Upload the edited image
      const formData = new FormData();
      formData.append('image', editedImageBlob, 'edited-image.png');
      formData.append('product_id', product?.id || '');
      // Send old image URL so backend can delete it from Firebase
      if (product?.image_url) {
        formData.append('old_image_url', product.image_url);
        console.log(' [ProductEditModal] Old image URL to delete:', product.image_url);
      }

      console.log(' [ProductEditModal] Sending upload request to:', `${API_BASE_URL}/api/products/upload-image`);
      const response = await fetch(`${API_BASE_URL}/api/products/upload-image`, {
        method: 'POST',
        body: formData,
      });

      console.log(' [ProductEditModal] Response status:', response.status);
      
      const result = await response.json();
      console.log(' [ProductEditModal] Response data:', result);
      
      if (result.success && result.image_url) {
        console.log('✅ [ProductEditModal] Image uploaded successfully:', result.image_url);
        setTempImageUrl(result.image_url);
        setImagePreview(result.image_url);
        setShowImageConfirm(true);
        setShowImageEditor(false);
      } else {
        const errorMsg = result.error || 'Failed to upload edited image';
        console.error('❌ [ProductEditModal] Upload failed:', errorMsg);
        setImageError(errorMsg);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to upload edited image';
      console.error('❌ [ProductEditModal] Error during upload:', error);
      console.error('❌ [ProductEditModal] Error details:', {
        message: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
      setImageError(errorMsg);
      throw error; // Re-throw so ImageEditor can catch it
    } finally {
      setIsLoadingImage(false);
      console.log(' [ProductEditModal] Upload process ended');
    }
  };

  const handleImageEditorCancel = () => {
    setShowImageEditor(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    setIsLoading(true);
    try {
  const response = await fetch(`${API_BASE_URL}/api/products/${product.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (result.success) {
        // Sync the edited product to cache
        try {
          // Map Product fields to cache format
          const cacheProduct = {
            product_name: formData.name || formData.original_name || '',
            product_type: formData.category || '',
            brand_name: formData.brand_name || '',
            variety: formData.variety || '',
            size: formData.sizeRaw || formData.size || '',
            price: formData.price || product?.price || '',
            image_url: formData.image_url || '',
            original_name: formData.original_name || formData.name || '',
            description: formData.description || product?.description || ''
          };
          
          const cacheResponse = await fetch(`${API_BASE_URL}/api/cache/save-edited`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              products: [cacheProduct]
            }),
          });
          
          const cacheResult = await cacheResponse.json();
          if (cacheResult.success) {
            console.log('✅ Cache updated with edited product:', cacheResult);
          } else {
            console.warn('⚠️ Failed to update cache:', cacheResult.error || cacheResult);
          }
        } catch (cacheError) {
          console.warn('⚠️ Cache update failed:', cacheError);
        }
        
        onSave(result.product);
        onClose();
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error updating product:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[36px] border border-white/25 bg-gradient-to-br from-white/95 via-slate-50/80 to-primary/5 p-6 shadow-[0_55px_140px_-60px_rgba(15,23,42,0.65)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Product editor</p>
            <h2 className="text-2xl font-bold text-slate-900">{product?.name || 'Edit product'}</h2>
            <p className="text-sm text-slate-500">Update catalog metadata, imagery, and availability</p>
          </div>
          <IconButton
            onClick={onClose}
            variant="outline"
            className="self-end rounded-full border-white/60 bg-white/80 text-slate-700"
          >
            <span className="text-lg">×</span>
          </IconButton>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Product ID Field - Read-only with warning */}
          <div className="rounded-[28px] border border-amber-200/60 bg-amber-50/70 p-4 shadow-inner shadow-amber-200/40">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-amber-800">
                Product ID (advanced)
              </label>
              <button
                type="button"
                onClick={() => setShowEditProductId(!showEditProductId)}
                className="text-xs font-semibold text-amber-700 underline"
              >
                {showEditProductId ? 'Lock' : 'Edit'}
              </button>
            </div>

            {showEditProductId ? (
              <input
                type="text"
                value={formData.id || product?.id || ''}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                className="mt-3 w-full rounded-2xl border border-amber-200 bg-white/80 px-3 py-2 text-sm font-mono text-slate-700 focus:border-amber-500 focus:outline-none"
                placeholder="Enter product ID"
              />
            ) : (
              <div className="mt-3 font-mono text-sm text-amber-900">
                {product?.id}
              </div>
            )}

            <p className="mt-2 text-xs text-amber-700">
              ⚠️ Changing the ID can break price history and linked references. Proceed only if you know the impact.
            </p>
          </div>

          {/* Product Image Section - Moved to top for visibility */}
          <div className="space-y-3 rounded-[30px] border border-white/40 bg-white/85 p-5 shadow-inner">
            <label className="block text-sm font-semibold text-slate-700">
              Product Image
            </label>

            {/* Image Source Toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImageSource('url')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  imageSource === 'url'
                    ? 'bg-primary text-white shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                URL
              </button>
              <button
                type="button"
                onClick={() => setImageSource('upload')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  imageSource === 'upload'
                    ? 'bg-primary text-white shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Upload File
              </button>
            </div>

            {/* URL Input */}
            {imageSource === 'url' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={tempImageUrl || formData.image_url || ''}
                    onChange={(e) => setTempImageUrl(e.target.value)}
                    className="flex-1 rounded-2xl border border-white/60 bg-white/80 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary focus:outline-none"
                    placeholder="Enter image URL"
                  />
                  <Button
                    type="button"
                    onClick={() => tempImageUrl && handleImageUrlDownload(tempImageUrl)}
                    disabled={isLoadingImage || !tempImageUrl}
                    className="whitespace-nowrap"
                  >
                    {isLoadingImage ? 'Loading...' : 'Download'}
                  </Button>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoadingImage}
                  className="w-full"
                >
                  {isLoadingImage ? 'Uploading...' : 'Choose Image File'}
                </Button>
              </div>
            )}

            {/* Error Message */}
            {imageError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3">
                <p className="text-xs font-semibold text-rose-600">{imageError}</p>
              </div>
            )}

            {/* Image Preview */}
            {imagePreview && (
              <div className="space-y-2">
                <div className="relative h-48 w-full overflow-hidden rounded-3xl border border-white/40 bg-white/80">
                  <Image
                    src={imagePreview}
                    alt="Product preview"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>

                {/* Edit Image Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={openImageEditor}
                  className="w-full"
                  disabled={isLoadingImage}
                >
                   Edit Image
                </Button>

                {/* Confirmation Buttons */}
                {showImageConfirm && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-900">
                    <span className="flex-1 text-xs font-semibold">Confirm this image?</span>
                    <Button type="button" size="sm" onClick={confirmImage} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                      ✓ Confirm
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={rejectImage}>
                      ✗ Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand Name
              </label>
              <input
                type="text"
                value={formData.brand_name || ''}
                onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave empty for unbranded products"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <div className="space-y-1">
                <select
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.display_name}
                    </option>
                  ))}
                </select>
                {formData.category && (
                  <p className="text-xs text-gray-600">
                    Selected: <span className="font-medium text-blue-600">{getCategoryDisplayName(formData.category)}</span>
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Variety
              </label>
              <input
                type="text"
                value={formData.variety || ''}
                onChange={(e) => setFormData({ ...formData, variety: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Size *
              </label>
              <input
                type="text"
                value={formData.sizeRaw || formData.size || ''}
                onChange={(e) => setFormData({ ...formData, sizeRaw: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 200g, 1.5L, 250ml"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={formData.is_active ? 'true' : 'false'}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Original Name
            </label>
            <input
              type="text"
              value={formData.original_name || ''}
              onChange={(e) => setFormData({ ...formData, original_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>

      {/* Image Editor Modal */}
      {showImageEditor && imageToEdit && (
        <ImageEditor
          imageUrl={imageToEdit}
          onSave={handleImageEditorSave}
          onCancel={handleImageEditorCancel}
        />
      )}
    </div>
  );
};

export default ProductEditModal;

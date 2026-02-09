'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ToastNotification, { Toast } from '@/components/shared/ToastNotification';
import ProductReviewModal from './ProductReviewModal';
import DuplicateDetectionProgress from './DuplicateDetectionProgress';
import { classificationAPI } from '@/lib/api';
import type { ClassificationCloudFile } from '@/types/classification';
import { formatDateTime, fromDatetimeLocalInput, toDatetimeLocalInput } from '@/utils/datetime';
import { formatFileSize } from '@/utils/files';

interface ProductUploadStats {
  total: number;
  processed: number;
  created: number;
  duplicates: number;
  fuzzy_duplicates: number;
  errors: number;
  error_details: Array<{
    product: string;
    error: string;
  }>;
  duplicate_details: Array<{
    new_product: string;
    new_id: string;
    existing_product: string;
    existing_id: string;
    similarity_score: number;
    match_reasons: string[];
    duplicate_type: string;
  }>;
  pending_products?: Array<{
    product_id: string;
    product_name: string;
    brand_name: string;
    category: string;
    variety: string;
    size: string | number;
    sizeUnit?: string;
    sizeRaw?: string;
    image_url: string;
    is_new: boolean;
    confidence_score?: number;
  }>;
}

interface ProductStats {
  total_products: number;
  categories: Record<string, number>;
  brands: Record<string, number>;
  has_brand: number;
  no_brand: number;
}

interface PendingProduct {
  product_id: string;
  product_name: string;
  brand_name: string;
  category: string;
  variety: string;
  size: string | number;
  sizeUnit?: string;
  sizeRaw?: string;
  image_url: string;
  is_new: boolean;
  confidence_score?: number;
  selected?: boolean;
}

interface ProductReviewData {
  new_products: Array<{
    product_id: string;
    product_name: string;
    brand_name: string;
    category: string;
    variety: string;
    size: string | number;
    sizeUnit?: string;
    sizeRaw?: string;
    image_url: string;
    original_name?: string;
    confidence_score?: number;
    selected?: boolean;
  }>;
  duplicate_matches: Array<{
    new_product: {
      product_id: string;
      product_name: string;
      brand_name: string;
      category: string;
      variety: string;
      size: string | number;
      sizeUnit?: string;
      sizeRaw?: string;
      image_url: string;
      original_name?: string;
    };
    existing_product: {
      product_id: string;
      product_name: string;
      brand_name: string;
      category: string;
      variety: string;
      size: string | number;
      sizeUnit?: string;
      sizeRaw?: string;
      image_url: string;
      original_name?: string;
    };
    similarity_score: number;
    match_reasons: string[];
    duplicate_type: 'exact' | 'fuzzy' | 'brand_variety';
    match_details: {
      name_similarity: number;
      brand_similarity: number;
      size_similarity: number;
      normalized_name_match: boolean;
      token_overlap: number;
    };
  }>;
  invalid_entries?: Array<{
    index: number;
    content: any;
    issues: string[];
    suggested_fixes: string[];
  }>;
  stats: {
    total: number;
    valid_count?: number;
    new_count: number;
    duplicate_count: number;
    invalid_count?: number;
    processed: number;
  };
}

interface ProductUploaderProps {
  onDatabaseChanged?: () => void | Promise<void>;
}

interface MetadataEditorState {
  cloudPath: string;
  filename: string;
  supermarket: string;
  customName: string;
  classificationDate: string;
}

export const ProductUploader: React.FC<ProductUploaderProps> = ({ onDatabaseChanged }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState<ProductUploadStats | null>(null);
  const [productStats, setProductStats] = useState<ProductStats | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [reviewData, setReviewData] = useState<ProductReviewData | null>(null);
  const [originalUpload, setOriginalUpload] = useState<any | null>(null);
  const [activeSource, setActiveSource] = useState<'upload' | 'cloud'>('upload');
  const [cloudFiles, setCloudFiles] = useState<ClassificationCloudFile[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudActionKey, setCloudActionKey] = useState<string | null>(null);
  const [metadataEditor, setMetadataEditor] = useState<MetadataEditorState | null>(null);
  const isCloudActionBusy = (action: string, path: string) => cloudActionKey === `${action}:${path}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Duplicate detection progress
  const [showDetectionProgress, setShowDetectionProgress] = useState(false);
  const [detectionTotalProducts, setDetectionTotalProducts] = useState(0);
  const [detectionStats, setDetectionStats] = useState({
    total: 0,
    processed: 0,
    duplicates: 0,
    newProducts: 0,
    tier1Matches: 0,
    tier2Matches: 0,
    tier3Matches: 0
  });
  const [detectionLogs, setDetectionLogs] = useState<string[]>([]);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string, type: Toast['type']) => {
    setToast({ 
      id: Date.now().toString(), 
      type, 
      title: type.charAt(0).toUpperCase() + type.slice(1), 
      message 
    });
    setTimeout(() => setToast(null), 5000);
  };

  const tabButtonClass = (isActive: boolean) =>
    `px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
    }`;

  const loadCloudFiles = useCallback(async () => {
    setCloudLoading(true);
    setCloudError(null);
    try {
      const response = await classificationAPI.listCloudResults();
      if (response?.success) {
        setCloudFiles(response.files || []);
      } else {
        setCloudError(response?.error || 'Failed to load cloud files');
        setCloudFiles(response?.files || []);
      }
    } catch (error: any) {
      setCloudError(error?.message || 'Failed to load cloud files');
      setCloudFiles([]);
    } finally {
      setCloudLoading(false);
      setCloudLoaded(true);
    }
  }, []);

  const loadProductStats = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/stats`);
      if (response.ok) {
        const stats = await response.json();
        setProductStats(stats);
      }
    } catch (error) {
      console.error('Error loading product stats:', error);
    }
  }, []);

  useEffect(() => {
    loadProductStats();
    const id = setInterval(() => {
      loadProductStats();
    }, 60_000);
    return () => clearInterval(id);
  }, [loadProductStats]);

  useEffect(() => {
    if (activeSource === 'cloud' && !cloudLoaded && !cloudLoading) {
      loadCloudFiles();
    }
  }, [activeSource, cloudLoaded, cloudLoading, loadCloudFiles]);

  useEffect(() => {
    const handler = () => {
      setCloudLoaded(false);
      if (activeSource === 'cloud') {
        loadCloudFiles();
      }
    };
    window.addEventListener('classification-cloud-updated', handler);
    return () => window.removeEventListener('classification-cloud-updated', handler);
  }, [activeSource, loadCloudFiles]);

  // Cleanup progress interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  const processParsedUpload = async (data: any) => {
    let products: any[];

    if (Array.isArray(data)) {
      products = data;
      setOriginalUpload(data);
    } else if (data?.results && Array.isArray(data.results)) {
      products = data.results;
      setOriginalUpload(data);
    } else {
      throw new Error('JSON file must contain an array of products or have a "results" field with products');
    }

    // Show progress modal
    setDetectionTotalProducts(products.length);
    setDetectionStats({
      total: products.length,
      processed: 0,
      duplicates: 0,
      newProducts: 0,
      tier1Matches: 0,
      tier2Matches: 0,
      tier3Matches: 0
    });
    setDetectionLogs([]);
    setShowDetectionProgress(true);

    try {
      // Use fetch with streaming for POST request (EventSource doesn't support POST)
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/preview-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let previewData: any = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'init') {
              setDetectionLogs(prev => [...prev, `� Starting analysis of ${data.total} products...`]);
            } else if (data.type === 'log') {
              setDetectionLogs(prev => [...prev, data.message].slice(-100)); // Keep last 15 logs
            } else if (data.type === 'progress') {
              console.log('📊 Progress update received:', data.stats);
              setDetectionStats({
                total: data.stats.total,
                processed: data.stats.processed,
                duplicates: data.stats.duplicates,
                newProducts: data.stats.new_products,
                tier1Matches: data.stats.tier1_matches || 0,
                tier2Matches: data.stats.tier2_matches || 0,
                tier3Matches: data.stats.tier3_matches || 0
              });
            } else if (data.type === 'complete') {
              console.log('✅ Detection Complete! Final stats:', data.stats);
              setDetectionLogs(prev => [
                ...prev,
                `✅ Detection Complete!`,
                `📊 Total: ${data.stats.total} | Duplicates: ${data.stats.duplicates} | New: ${data.stats.new_products}`,
                `🎯 Tiers: Perfect=${data.stats.tier1_matches} | Near=${data.stats.tier2_matches} | Fuzzy=${data.stats.tier3_matches}`
              ]);
              
              // Update final stats with tier data
              const finalStats = {
                total: data.stats.total,
                processed: data.stats.processed,
                duplicates: data.stats.duplicates,
                newProducts: data.stats.new_products,
                tier1Matches: data.stats.tier1_matches || 0,
                tier2Matches: data.stats.tier2_matches || 0,
                tier3Matches: data.stats.tier3_matches || 0
              };
              console.log('📊 Setting final detection stats:', finalStats);
              setDetectionStats(finalStats);
              
              // Now get full preview data from regular endpoint
              const previewResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/preview`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ products }),
              });

              if (previewResponse.ok) {
                const previewResult = await previewResponse.json();
                if (previewResult.success) {
                  setReviewData(previewResult.preview_data);
                  setUploadStats({
                    total: previewResult.preview_data.stats.total,
                    processed: previewResult.preview_data.stats.total,
                    created: 0,
                    duplicates: previewResult.preview_data.stats.duplicate_count,
                    fuzzy_duplicates: 0,
                    errors: 0,
                    error_details: [],
                    duplicate_details: [],
                    pending_products: previewResult.preview_data.new_products,
                  });

                  // Wait to show completed state, then open review modal
                  setTimeout(() => {
                    setShowDetectionProgress(false); // Close detection modal
                    setShowConfirmation(true); // Open review modal
                  }, 1500);
                }
              }
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          }
        }
      }
    } catch (error) {
      setShowDetectionProgress(false);
      throw error;
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      showToast('Please select a JSON file', 'error');
      return;
    }

    setIsUploading(true);
    setUploadStats(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      await processParsedUpload(data);
    } catch (error) {
      console.error('Upload error:', error);
      showToast(error instanceof Error ? error.message : 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadCloudFile = async (file: ClassificationCloudFile) => {
    const actionKey = `load:${file.cloud_path}`;
    setCloudActionKey(actionKey);
    setUploadStats(null);

    try {
      const response = await classificationAPI.downloadCloudResult(file.cloud_path);
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to download cloud file');
      }

      let payload = response.data;
      if (!payload && response.raw) {
        try {
          payload = JSON.parse(response.raw);
        } catch (parseError) {
          throw new Error('Cloud file content is not valid JSON');
        }
      }

      if (!payload) {
        throw new Error('Cloud file is empty');
      }

      await processParsedUpload(payload);
      showToast(`Loaded ${file.filename} from cloud`, 'success');
      setActiveSource('upload');
    } catch (error) {
      console.error('Cloud load error:', error);
      showToast(error instanceof Error ? error.message : 'Failed to load cloud file', 'error');
    } finally {
      setCloudActionKey((current) => (current === actionKey ? null : current));
    }
  };

  const handleReviewConfirm = async (selectedProducts: string[], duplicateDecisions: Record<string, 'skip' | 'create_anyway' | 'update_existing'>) => {
    setIsConfirming(true);

    try {
      // Prepare products for creation
      const productsToCreate: any[] = [];
      
      // Add selected new products
      if (reviewData) {
        reviewData.new_products
          .filter(p => selectedProducts.includes(p.product_id))
          .forEach(p => productsToCreate.push(p));
        
        // Add duplicate products marked as 'create_anyway' or 'update_existing'
        reviewData.duplicate_matches
          .filter(match => duplicateDecisions[match.new_product.product_id] === 'create_anyway' || duplicateDecisions[match.new_product.product_id] === 'update_existing')
          .forEach(match => productsToCreate.push({
            ...match.new_product,
            decision: duplicateDecisions[match.new_product.product_id]
          }));
      }

      if (productsToCreate.length === 0) {
        showToast('No products selected for creation', 'error');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          products: productsToCreate,
          duplicate_decisions: duplicateDecisions
        }),
      });

      if (!response.ok) {
        throw new Error(`Confirmation failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        showToast(result.message, 'success');
        setShowConfirmation(false);
        setReviewData(null);
        setPendingProducts([]);
        
        // Update upload stats
        if (uploadStats) {
          setUploadStats({
            ...uploadStats,
            created: result.stats.created,
            errors: uploadStats.errors + result.stats.errors,
            error_details: [...uploadStats.error_details, ...result.stats.error_details]
          });
        }
        
        // Refresh product stats locally and notify parent
        loadProductStats();
        if (onDatabaseChanged) {
          try { await onDatabaseChanged(); } catch {}
        }
      } else {
        throw new Error(result.error || 'Confirmation failed');
      }
    } catch (error) {
      console.error('Confirmation error:', error);
      showToast(error instanceof Error ? error.message : 'Confirmation failed', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const toggleProductSelection = (index: number) => {
    setPendingProducts(prev => 
      prev.map((product, i) => 
        i === index ? { ...product, selected: !product.selected } : product
      )
    );
  };

  const selectAllProducts = () => {
    setPendingProducts(prev => prev.map(product => ({ ...product, selected: true })));
  };

  const deselectAllProducts = () => {
    setPendingProducts(prev => prev.map(product => ({ ...product, selected: false })));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const selectedFile = input.files && input.files[0] ? input.files[0] : null;
    try {
      if (selectedFile) {
        await handleFileUpload(selectedFile);
      }
    } finally {
      // Always reset the input value so selecting the same file again triggers onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      } else {
        // Fallback in case ref is unavailable
        input.value = '';
      }
    }
  };

  const handleDownloadCloudFile = async (file: ClassificationCloudFile) => {
    const actionKey = `download:${file.cloud_path}`;
    setCloudActionKey(actionKey);
    try {
      const response = await classificationAPI.downloadCloudResult(file.cloud_path);
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to download cloud file');
      }

      const rawContent = response.raw || JSON.stringify(response.data, null, 2);
      const blob = new Blob([
        typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2)
      ], { type: 'application/json' });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = response.filename || file.filename || 'classification-results.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      showToast(`Downloaded ${response.filename || file.filename}`, 'success');
    } catch (error: any) {
      console.error('Cloud download error:', error);
      showToast(error?.message || 'Failed to download cloud file', 'error');
    } finally {
      setCloudActionKey((current) => (current === actionKey ? null : current));
    }
  };

  const handleDeleteCloudFile = async (file: ClassificationCloudFile) => {
    const confirmed = window.confirm(`Delete ${file.filename}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    const actionKey = `delete:${file.cloud_path}`;
    setCloudActionKey(actionKey);
    try {
      const response = await classificationAPI.deleteCloudResult(file.cloud_path);
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to delete cloud file');
      }

      showToast(`${file.filename} deleted`, 'success');
      setCloudFiles((prev) => prev.filter((item) => item.cloud_path !== file.cloud_path));
      window.dispatchEvent(new CustomEvent('classification-cloud-updated'));
    } catch (error: any) {
      console.error('Cloud delete error:', error);
      showToast(error?.message || 'Failed to delete cloud file', 'error');
    } finally {
      setCloudActionKey((current) => (current === actionKey ? null : current));
    }
  };

  const openMetadataEditor = (file: ClassificationCloudFile) => {
    setMetadataEditor({
      cloudPath: file.cloud_path,
      filename: (file.filename || '').replace(/\.json$/i, ''),
      supermarket: file.supermarket || file.metadata?.display_supermarket || file.metadata?.supermarket || '',
      customName: file.custom_name || file.metadata?.custom_name || '',
      classificationDate: toDatetimeLocalInput(file.classification_date || file.metadata?.classification_date || ''),
    });
  };

  const updateMetadataField = (field: keyof MetadataEditorState, value: string) => {
    setMetadataEditor((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleMetadataSave = async () => {
    if (!metadataEditor) {
      return;
    }

    const actionKey = `update:${metadataEditor.cloudPath}`;
    setCloudActionKey(actionKey);

    try {
      const supermarket = metadataEditor.supermarket.trim();
      const customName = metadataEditor.customName.trim();
      const fileName = metadataEditor.filename.trim();

      const updates: Record<string, any> = {
        supermarket,
        custom_name: customName,
      };

      const isoDate = fromDatetimeLocalInput(metadataEditor.classificationDate);
      if (isoDate) {
        updates.classification_date = isoDate;
      } else {
        updates.classification_date = '';
      }

      if (fileName) {
        updates.filename = fileName;
      }

      const response = await classificationAPI.updateCloudMetadata(metadataEditor.cloudPath, updates);
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to update metadata');
      }

      showToast('Cloud metadata updated', 'success');
      setMetadataEditor(null);
      setCloudLoaded(false);
      loadCloudFiles();
      window.dispatchEvent(new CustomEvent('classification-cloud-updated'));
    } catch (error: any) {
      console.error('Metadata update error:', error);
      showToast(error?.message || 'Failed to update metadata', 'error');
    } finally {
      setCloudActionKey((current) => (current === actionKey ? null : current));
    }
  };

  const formatCategoryName = (categoryId: string) => {
    return categoryId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleConfirmUpload = async () => {
    setIsConfirming(true);

    try {
      // Send pending products to the server for final creation.
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products: pendingProducts }),
      });

      if (!response.ok) {
        throw new Error(`Confirmation failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        showToast(result.message, 'success');
        setShowConfirmation(false);
        setPendingProducts([]);
        
        // Update upload stats
        if (uploadStats) {
          setUploadStats({
            ...uploadStats,
            created: result.stats.created,
            errors: uploadStats.errors + result.stats.errors,
            error_details: [...uploadStats.error_details, ...result.stats.error_details]
          });
        }
        
        // Refresh product stats locally and notify parent
        loadProductStats();
        if (onDatabaseChanged) {
          try { await onDatabaseChanged(); } catch {}
        }
      } else {
        throw new Error(result.error || 'Confirmation failed');
      }
    } catch (error) {
      console.error('Confirmation error:', error);
      showToast(error instanceof Error ? error.message : 'Confirmation failed', 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
           Products Collection Manager
        </h2>
        <p className="text-gray-600">
          Upload AI-classified product data to create products in the database.
          Each product will reference categories and be ready for price tracking.
        </p>
      </div>

      {/* Current Stats moved to top cards on Products page */}

      {/* Data Source Selection */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={tabButtonClass(activeSource === 'upload')}
          onClick={() => setActiveSource('upload')}
        >
          Upload JSON
        </button>
        <button
          type="button"
          className={tabButtonClass(activeSource === 'cloud')}
          onClick={() => setActiveSource('cloud')}
        >
          Cloud Saved Files
        </button>
      </div>

      {activeSource === 'upload' && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div className="space-y-6">
              {/* Modern animated loader */}
              <div className="relative w-20 h-20 mx-auto">
                {/* Outer ring */}
                <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                {/* Spinning arc */}
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-500 animate-spin"></div>
                {/* Inner pulsing circle */}
                <div className="absolute inset-3 rounded-full bg-blue-500 animate-pulse opacity-20"></div>
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
              </div>
              
              {/* Animated text */}
              <div className="space-y-2">
                <p className="text-lg font-semibold text-gray-900 animate-pulse">Processing Products...</p>
                <p className="text-gray-600">Checking for duplicates and validating data</p>
              </div>
              
              {/* Progress indicators */}
              <div className="flex justify-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-4xl">📁</div>
              <div>
                <p className="text-lg font-medium text-gray-900 mb-2">
                  Drop AI-classified JSON file here or click to browse
                </p>
                <p className="text-gray-600 mb-4">
                  Upload your AI-classified products data to add to the products collection
                </p>
                <button
                  onClick={() => {
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    fileInputRef.current?.click();
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Choose File
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {activeSource === 'cloud' && (
        <div className="border rounded-lg bg-gray-50 p-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Saved Classification Files</h3>
              <p className="text-sm text-gray-600">Select a cloud export from the classifier to stage products without a local download.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCloudLoaded(false);
                  loadCloudFiles();
                }}
                className="px-3 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={cloudLoading}
              >
                {cloudLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {cloudError && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {cloudError}
            </div>
          )}

          {cloudLoading ? (
            <div className="py-10 text-center text-gray-600">Loading cloud files...</div>
          ) : cloudFiles.length === 0 ? (
            <div className="py-10 text-center text-gray-600">
              No classification files have been saved yet. Use the classifier download menu to save results to the cloud.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">File</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Classification Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Uploaded</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Size</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cloudFiles.map((file) => (
                    <tr key={file.cloud_path}>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-gray-900">{file.filename}</div>
                        <div className="text-xs text-gray-500">
                          {(file.supermarket || '-') + (file.custom_name ? ` • ${file.custom_name}` : '')}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-gray-700">
                        {file.classification_date ? formatDateTime(file.classification_date) : '-'}
                      </td>
                      <td className="px-3 py-3 align-top text-gray-700">
                        {file.upload_time || file.updated
                          ? formatDateTime(file.upload_time || file.updated)
                          : '-'}
                      </td>
                      <td className="px-3 py-3 align-top text-gray-700">
                        {typeof file.size === 'number' ? formatFileSize(file.size) : '-'}
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleLoadCloudFile(file)}
                            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isCloudActionBusy('load', file.cloud_path) || isUploading || isConfirming}
                          >
                            {isCloudActionBusy('load', file.cloud_path) ? (
                              <span className="flex items-center gap-2">
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></span>
                                Loading…
                              </span>
                            ) : (
                              'Load & Review'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadCloudFile(file)}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isCloudActionBusy('download', file.cloud_path)}
                          >
                            {isCloudActionBusy('download', file.cloud_path) ? 'Downloading…' : 'Download'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openMetadataEditor(file)}
                            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isCloudActionBusy('update', file.cloud_path)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCloudFile(file)}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isCloudActionBusy('delete', file.cloud_path)}
                          >
                            {isCloudActionBusy('delete', file.cloud_path) ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {metadataEditor && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-amber-900">Edit Metadata</h4>
                  <p className="text-xs text-amber-700">
                    Update labels or move this file to another supermarket folder. Saving will refresh the cloud list.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMetadataEditor(null)}
                  className="text-xs font-semibold uppercase tracking-wide text-amber-700 hover:text-amber-900"
                >
                  Cancel
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">Filename</label>
                  <input
                    type="text"
                    value={metadataEditor.filename}
                    onChange={(e) => updateMetadataField('filename', e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                    placeholder="classification_keells_20250314"
                  />
                  <p className="mt-1 text-xs text-amber-700">.json extension is added automatically.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">Supermarket</label>
                  <input
                    type="text"
                    value={metadataEditor.supermarket}
                    onChange={(e) => updateMetadataField('supermarket', e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                    placeholder="e.g. Keells"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">Custom Label</label>
                  <input
                    type="text"
                    value={metadataEditor.customName}
                    onChange={(e) => updateMetadataField('customName', e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">Classification Date</label>
                  <input
                    type="datetime-local"
                    value={metadataEditor.classificationDate}
                    onChange={(e) => updateMetadataField('classificationDate', e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMetadataEditor(null)}
                  className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleMetadataSave}
                  disabled={isCloudActionBusy('update', metadataEditor.cloudPath)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                    isCloudActionBusy('update', metadataEditor.cloudPath)
                      ? 'cursor-not-allowed bg-amber-300'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                >
                  {isCloudActionBusy('update', metadataEditor.cloudPath) ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Upload Results */}
      {uploadStats && (
        <div className="mt-6 p-4 bg-green-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">✅ Upload Results</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-xl font-bold text-blue-600">{uploadStats.total}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-green-600">{uploadStats.created}</div>
              <div className="text-sm text-gray-600">Created</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-yellow-600">{uploadStats.duplicates}</div>
              <div className="text-sm text-gray-600">Duplicates</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-orange-600">{uploadStats.fuzzy_duplicates || 0}</div>
              <div className="text-sm text-gray-600">Fuzzy Matches</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-red-600">{uploadStats.errors}</div>
              <div className="text-sm text-gray-600">Errors</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-purple-600">
                {Math.round((uploadStats.created / uploadStats.total) * 100)}%
              </div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
          </div>

          {/* Duplicate Details */}
          {uploadStats.duplicates > 0 && uploadStats.duplicate_details && uploadStats.duplicate_details.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-900 mb-2">🔍 Intelligent Duplicate Detection Results:</h4>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {uploadStats.duplicate_details.slice(0, 10).map((dup, index) => (
                  <div key={index} className="text-sm bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                    <div className="font-medium text-gray-900">
                      {dup.new_product} 
                      <span className={`ml-2 px-2 py-1 rounded text-xs ${
                        dup.duplicate_type === 'exact' ? 'bg-red-100 text-red-800' :
                        dup.duplicate_type === 'near_exact' ? 'bg-orange-100 text-orange-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {dup.duplicate_type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-gray-600 mt-1">
                      Matches: <span className="font-medium">{dup.existing_product}</span>
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      Score: {(dup.similarity_score * 100).toFixed(1)}% • 
                      Reasons: {dup.match_reasons.join(', ')}
                    </div>
                  </div>
                ))}
                {uploadStats.duplicate_details.length > 10 && (
                  <div className="text-sm text-gray-600 text-center py-2">
                    ... and {uploadStats.duplicate_details.length - 10} more duplicates
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Details */}
          {uploadStats.errors > 0 && uploadStats.error_details.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-900 mb-2">❌ Errors:</h4>
              {uploadStats.created > 0 && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="text-sm text-blue-800">
                    <strong>ℹ️ Note:</strong> {uploadStats.created} products were successfully created despite the errors below. 
                    Errors are typically caused by invalid/empty entries in the JSON file.
                  </div>
                </div>
              )}
              <div className="max-h-32 overflow-y-auto space-y-1">
                {uploadStats.error_details.map((error, index) => (
                  <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                    <strong>{error.product || 'Invalid Entry'}:</strong> {error.error}
                  </div>
                ))}
              </div>
              {uploadStats.error_details.some(e => e.error.includes('Invalid category')) && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                  💡 <strong>Tip:</strong> &ldquo;Invalid category&rdquo; errors are usually caused by empty entries in the JSON file. 
                  Make sure all entries have valid product_type, product_name, and other required fields.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pending Products Confirmation */}
      {pendingProducts.length > 0 && (
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">⏳ New Products Pending Confirmation</h3>
          <div className="space-y-2">
            {pendingProducts.map((product) => (
              <div key={product.product_id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{product.product_name}</div>
                  <div className="text-sm text-gray-600">
                    {product.brand_name} • {formatCategoryName(product.category)} • {product.sizeRaw || product.size} • {product.variety}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <img src={product.image_url} alt={product.product_name} className="h-16 rounded" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowConfirmation(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Confirm & Upload New Products
            </button>
            <button
              onClick={() => setPendingProducts([])}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Discard All
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Detection Progress Modal */}
      <DuplicateDetectionProgress
        isOpen={showDetectionProgress}
        onClose={() => setShowDetectionProgress(false)}
        totalProducts={detectionTotalProducts}
        currentProgress={detectionStats}
        allowDismiss={true}
        logs={detectionLogs}
        onComplete={(stats: {
          total: number;
          processed: number;
          duplicates: number;
          newProducts: number;
          tier1Matches: number;
          tier2Matches: number;
          tier3Matches: number;
        }) => {
          console.log('Detection complete:', stats);
          setDetectionStats(stats);
        }}
      />

      {/* Product Review Modal */}
      {showConfirmation && reviewData && (
        <ProductReviewModal
          isOpen={showConfirmation}
          onClose={() => {
            setShowConfirmation(false);
            setReviewData(null);
            setOriginalUpload(null);
          }}
          reviewData={reviewData}
          originalUpload={originalUpload}
          onConfirm={handleReviewConfirm}
          isProcessing={isConfirming}
          onReviewDataChange={(data) => setReviewData(data)}
        />
      )}

      {/* Database Structure section removed as per request */}

      {/* Toast Notification */}
      {toast && (
        <ToastNotification
          toasts={[toast]}
          onRemove={() => setToast(null)}
        />
      )}

      {/* Secondary guarded modal mount removed to avoid duplicate instances */}
    </div>
  );
};

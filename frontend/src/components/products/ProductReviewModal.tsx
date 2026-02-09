'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, 
  Check, 
  AlertTriangle, 
  Eye,
  EyeOff,
  RefreshCw,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import AdvancedDuplicateFilters, { DuplicateFilterOptions } from './AdvancedDuplicateFilters';

// API Base URL for image proxy
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Get a proxied URL for external images to avoid CORS issues.
 * Firebase Storage URLs and data URLs pass through directly.
 */
function getProxiedImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return '';
  
  // Allow data URLs and blob URLs to pass through
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return imageUrl;
  }
  
  // Firebase Storage URLs are safe - pass through directly
  if (imageUrl.includes('firebasestorage.googleapis.com') || imageUrl.includes('storage.googleapis.com')) {
    return imageUrl;
  }
  
  try {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const resolvedUrl = new URL(imageUrl, currentOrigin || undefined);
    
    // Same-origin images don't need proxy
    if (currentOrigin && resolvedUrl.origin === currentOrigin) {
      return imageUrl;
    }
    
    // External images need to be proxied to avoid CORS issues
    return `${API_BASE_URL}/api/products/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  } catch {
    // If URL parsing fails, return original (will likely fail to load)
    return imageUrl;
  }
}

interface DuplicateMatch {
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
    syncedFromDb?: boolean;
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
}

interface NewProduct {
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
}

interface ProductReviewData {
  new_products: NewProduct[];
  duplicate_matches: DuplicateMatch[];
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

interface ProductReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  reviewData: ProductReviewData;
  originalUpload?: any;
  onConfirm: (selectedProducts: string[], duplicateDecisions: Record<string, 'skip' | 'create_anyway' | 'update_existing'>) => void;
  isProcessing?: boolean;
  // Optional: bubble up edits to review data (e.g., syncing JSON fields from DB)
  onReviewDataChange?: (data: ProductReviewData) => void;
}

export const ProductReviewModal: React.FC<ProductReviewModalProps> = ({
  isOpen,
  onClose,
  reviewData,
  originalUpload,
  onConfirm,
  isProcessing = false,
  onReviewDataChange
}) => {
  const [activeTab, setActiveTab] = useState<'new' | 'duplicates' | 'invalid'>('new');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [duplicateDecisions, setDuplicateDecisions] = useState<Record<string, 'skip' | 'create_anyway' | 'update_existing'>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [expandedDuplicates, setExpandedDuplicates] = useState<Set<string>>(new Set());
  const [showMatchDetails, setShowMatchDetails] = useState<Set<string>>(new Set());
  const [imageUpdateStatus, setImageUpdateStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  
  // Advanced filtering for duplicates
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [matchTypeFilter, setMatchTypeFilter] = useState<'all' | 'exact' | 'fuzzy' | 'brand_variety'>('all');
  const [differenceFilter, setDifferenceFilter] = useState<'all' | 'name' | 'brand' | 'size' | 'variety'>('all');

  // Helper function to format category display names
  const formatCategoryName = (categoryId: string): string => {
    if (!categoryId) return 'N/A';
    // Format the category ID nicely (e.g., "dairy_products" -> "Dairy Products")
    return categoryId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Helper to build the unified JSON array used for downloads/auto-save
  const buildUpdatedItems = (data: ProductReviewData) => {
    return [
      ...(data.new_products || []).map(p => ({
        product_name: p.product_name,
        brand_name: p.brand_name,
        size: p.size,
        sizeUnit: p.sizeUnit,
        sizeRaw: p.sizeRaw,
        category: p.category,
        variety: p.variety,
        image_url: p.image_url,
        original_name: p.original_name,
      })),
      ...(data.duplicate_matches || []).map(m => ({
        product_name: m.new_product.product_name,
        brand_name: m.new_product.brand_name,
        size: m.new_product.size,
        sizeUnit: m.new_product.sizeUnit,
        sizeRaw: m.new_product.sizeRaw,
        category: m.new_product.category,
        variety: m.new_product.variety,
        image_url: m.new_product.image_url,
        original_name: m.new_product.original_name,
        _matched_existing_id: m.existing_product.product_id,
      }))
    ];
  };

  // Live Save removed per request

  // Live Save removed per request

  // Merge only selected fields into the original wrapper's results
  const mergeIntoWrapper = (baseDoc: any, updatedItems: any[]) => {
    try {
      const updatedByKey = new Map<string, any>();
      for (const item of updatedItems) {
        if (item && typeof item === 'object') {
          const keyName = item.original_name || item.product_name;
          if (keyName) {
            updatedByKey.set(String(keyName), item);
          }
        }
      }
  const allowed = ['product_name', 'brand_name', 'size', 'sizeUnit', 'sizeRaw'];
      const newResults = (baseDoc.results || []).map((res: any) => {
        if (!res || typeof res !== 'object') return res;
        const key = (res.original_name || res.product_name) ? String(res.original_name || res.product_name) : null;
        if (!key || !updatedByKey.has(key)) return res;
        const updates = updatedByKey.get(key);
        const merged = { ...res };
        for (const field of allowed) {
          if (updates[field] !== undefined) {
            merged[field] = updates[field];
          }
        }
        return merged;
      });
      return { ...baseDoc, results: newResults };
    } catch (e) {
      console.warn('Wrapper merge failed, falling back to flat save:', e);
      return baseDoc;
    }
  };

  // --- Helpers: Sync JSON fields from DB for duplicates ---
  const applyDbDetailsToDuplicate = (productId: string) => {
    if (!reviewData) return;
    const updated: ProductReviewData = {
      ...reviewData,
      duplicate_matches: (reviewData.duplicate_matches || []).map(m => {
        if (m.new_product.product_id !== productId) return m;
        const db = m.existing_product;
        return {
          ...m,
          new_product: {
            ...m.new_product,
            product_name: db.product_name,
            brand_name: db.brand_name,
            size: (db.sizeRaw ?? db.size),
            sizeUnit: db.sizeUnit ?? m.new_product.sizeUnit,
            sizeRaw: db.sizeRaw ?? m.new_product.sizeRaw,
            syncedFromDb: true,
          }
        };
      })
    };
    onReviewDataChange?.(updated);
    // Live Save removed
  };

  const applyDbDetailsToAllVisible = () => {
    if (!reviewData) return;
    const visibleIds = new Set(filteredDuplicates.map(m => m.new_product.product_id));
    const updated: ProductReviewData = {
      ...reviewData,
      duplicate_matches: (reviewData.duplicate_matches || []).map(m => {
        if (!visibleIds.has(m.new_product.product_id)) return m;
        const db = m.existing_product;
        return {
          ...m,
          new_product: {
            ...m.new_product,
            product_name: db.product_name,
            brand_name: db.brand_name,
            size: (db.sizeRaw ?? db.size),
            sizeUnit: db.sizeUnit ?? m.new_product.sizeUnit,
            sizeRaw: db.sizeRaw ?? m.new_product.sizeRaw,
            syncedFromDb: true,
          }
        };
      })
    };
    onReviewDataChange?.(updated);
    // Live Save removed
  };

  // Update only the DB image URL to the new image from JSON for a given duplicate
  const updateDbImageOnly = async (productId: string) => {
    if (!reviewData) return;
    const match = (reviewData.duplicate_matches || []).find(m => m.new_product.product_id === productId);
    if (!match) return;
    const existingId = match.existing_product.product_id;
    const newUrl = match.new_product.image_url;
    const currentUrl = match.existing_product.image_url;
    if (!newUrl || newUrl === currentUrl) return;

    try {
      setImageUpdateStatus(prev => ({ ...prev, [productId]: 'loading' }));
      const resp = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/products/${encodeURIComponent(existingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: newUrl })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // Reflect the change in UI
      const updated: ProductReviewData = {
        ...reviewData,
        duplicate_matches: (reviewData.duplicate_matches || []).map(m =>
          m.new_product.product_id === productId
            ? { ...m, existing_product: { ...m.existing_product, image_url: newUrl } }
            : m
        )
      };
      onReviewDataChange?.(updated);
      setImageUpdateStatus(prev => ({ ...prev, [productId]: 'success' }));
      setTimeout(() => setImageUpdateStatus(prev => ({ ...prev, [productId]: 'idle' })), 1800);
    } catch (e) {
      setImageUpdateStatus(prev => ({ ...prev, [productId]: 'error' }));
    }
  };

  const canUpdateImage = (match: DuplicateMatch) => {
    const newUrl = match.new_product.image_url;
    const currentUrl = match.existing_product.image_url;
    return Boolean(newUrl && newUrl !== currentUrl);
  };

  const downloadUpdatedJson = () => {
    if (!reviewData) return;
    // Build map of edits by original_name using allowed fields only
  const allowed = ['product_name', 'brand_name', 'size', 'sizeUnit', 'sizeRaw'] as const;
    const updates = new Map<string, any>();
    const items = buildUpdatedItems(reviewData);
    for (const it of items) {
      if (!it) continue;
      const keyName = it.original_name || it.product_name;
      if (!keyName) continue;
      const partial: any = {};
      const rec = it as Record<string, any>;
      for (const k of allowed) if (rec[k] !== undefined) partial[k] = rec[k];
      updates.set(String(keyName), partial);
    }

    let output: any;
    // If we have the original upload, preserve its structure and field names exactly
    if (originalUpload) {
      if (Array.isArray(originalUpload)) {
        output = originalUpload.map((entry: any) => {
          if (entry && typeof entry === 'object') {
            const key = entry.original_name || entry.product_name;
            if (key && updates.has(String(key))) {
              const u = updates.get(String(key));
              // Apply only allowed fields using original field names
              const merged = { ...entry };
              if (u.product_name !== undefined) merged.product_name = u.product_name;
              if (u.brand_name !== undefined) merged.brand_name = u.brand_name ?? null; // keep nulls if original used nulls
              if (u.sizeRaw !== undefined) merged.size = u.sizeRaw; else if (u.size !== undefined) merged.size = u.size;
              // Note: do not touch product_type here; it's part of original and must remain as-is
              return merged;
            }
          }
          return entry;
        });
      } else if (originalUpload.results && Array.isArray(originalUpload.results)) {
        // Wrapper shape: preserve metadata, update only results entries
        output = { ...originalUpload, results: originalUpload.results.map((entry: any) => {
          if (entry && typeof entry === 'object') {
            const key = entry.original_name || entry.product_name;
            if (key && updates.has(String(key))) {
              const u = updates.get(String(key));
              const merged = { ...entry };
              if (u.product_name !== undefined) merged.product_name = u.product_name;
              if (u.brand_name !== undefined) merged.brand_name = u.brand_name ?? null;
              if (u.sizeRaw !== undefined) merged.size = u.sizeRaw; else if (u.size !== undefined) merged.size = u.size;
              // product_type remains unchanged; do NOT convert to internal category ids
              return merged;
            }
          }
          return entry;
        }) };
      } else {
        // Unknown shape, fall back to safest: do nothing but allow export of original
        output = originalUpload;
      }
    } else {
      // No original captured; as a fallback, export flat items but DO NOT rename fields like category/product_type.
      // Since original fields aren't known, we keep only fields present in items and avoid adding internal-only fields.
      output = items.map((it: any) => {
        const o: any = { ...it };
        // Ensure we don't inject DB category ids in place of product_type
        if (o.category && !('product_type' in o)) delete o.category;
        return o;
      });
    }

    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classification_updated.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Initialize once; then preserve decisions across reviewData edits
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!reviewData) return;

    if (!initializedRef.current) {
      // First mount with data: select all new by default; duplicates default to 'skip'
      const allNewIds = new Set((reviewData.new_products || []).map(p => p.product_id));
      setSelectedProducts(allNewIds);

      const initialDecisions: Record<string, 'skip' | 'create_anyway' | 'update_existing'> = {};
      (reviewData.duplicate_matches || []).forEach(match => {
        initialDecisions[match.new_product.product_id] = 'skip';
      });
      setDuplicateDecisions(initialDecisions);

      // Auto-switch to invalid tab if only invalid entries exist
      if (reviewData.invalid_entries && reviewData.invalid_entries.length > 0 &&
          (!reviewData.new_products || reviewData.new_products.length === 0) &&
          (!reviewData.duplicate_matches || reviewData.duplicate_matches.length === 0)) {
        setActiveTab('invalid');
      }

      initializedRef.current = true;
      return;
    }

    // Subsequent updates: preserve user choices
    setSelectedProducts(prev => {
      const currentIds = new Set((reviewData.new_products || []).map(p => p.product_id));
      const next = new Set<string>();
      prev.forEach(id => { if (currentIds.has(id)) next.add(id); });
      return next;
    });

    setDuplicateDecisions(prev => {
      const next: Record<string, 'skip' | 'create_anyway' | 'update_existing'> = {};
      (reviewData.duplicate_matches || []).forEach(match => {
        const id = match.new_product.product_id;
        next[id] = prev[id] ?? 'skip';
      });
      return next;
    });

    // If dataset temporarily becomes only invalids, keep UX consistent
    if (reviewData.invalid_entries && reviewData.invalid_entries.length > 0 &&
        (!reviewData.new_products || reviewData.new_products.length === 0) &&
        (!reviewData.duplicate_matches || reviewData.duplicate_matches.length === 0)) {
      setActiveTab('invalid');
    }
  }, [reviewData]);

  // Get unique categories and brands for filtering
  const categories = React.useMemo(() => {
    const cats = new Set<string>();
    reviewData?.new_products?.forEach(p => p.category && cats.add(p.category));
    reviewData?.duplicate_matches?.forEach(m => {
      m.new_product.category && cats.add(m.new_product.category);
      m.existing_product.category && cats.add(m.existing_product.category);
    });
    return Array.from(cats).sort();
  }, [reviewData]);

  const brands = React.useMemo(() => {
    const brands = new Set<string>();
    reviewData?.new_products?.forEach(p => p.brand_name && brands.add(p.brand_name));
    reviewData?.duplicate_matches?.forEach(m => {
      m.new_product.brand_name && brands.add(m.new_product.brand_name);
      m.existing_product.brand_name && brands.add(m.existing_product.brand_name);
    });
    return Array.from(brands).sort();
  }, [reviewData]);

  // Calculate a more accurate overall match score based on individual similarities
  const calculateOverallMatch = React.useCallback((match: DuplicateMatch) => {
    // Safely access match_details with fallback
    const details = match.match_details || {};
    
    // Use the actual individual similarity scores from the backend
    const nameScore = details.name_similarity ?? 0;
    const brandScore = details.brand_similarity ?? 0;
    const sizeScore = details.size_similarity ?? 0;
    const tokenScore = (details.token_overlap ?? 0) / 100; // Convert percentage to decimal
    
    // Simple average of all available scores (equal weighting)
    const scores = [nameScore, brandScore, sizeScore, tokenScore];
    const validScores = scores.filter(score => score >= 0); // Only count valid scores
    
    if (validScores.length === 0) {
      return match.similarity_score || 0; // Fallback to original if no individual scores
    }
    
    // Calculate the average of individual scores
    const calculatedScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
    
    // Use the calculated score directly since it's based on real backend data
    return calculatedScore;
  }, []);

  // Filter functions
  const filteredNewProducts = React.useMemo(() => {
    return reviewData?.new_products?.filter(product => {
      const matchesSearch = !searchTerm || 
        product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.original_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      const matchesBrand = brandFilter === 'all' || product.brand_name === brandFilter;
      
      return matchesSearch && matchesCategory && matchesBrand;
    }) || [];
  }, [reviewData?.new_products, searchTerm, categoryFilter, brandFilter]);

  const filteredDuplicates = React.useMemo(() => {
    return reviewData?.duplicate_matches?.filter(match => {
      const matchesSearch = !searchTerm || 
        match.new_product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        match.existing_product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        match.new_product.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        match.existing_product.brand_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || 
        match.new_product.category === categoryFilter ||
        match.existing_product.category === categoryFilter;
      
      const matchesBrand = brandFilter === 'all' || 
        match.new_product.brand_name === brandFilter ||
        match.existing_product.brand_name === brandFilter;
      
      // Advanced filters
      const matchesScore = scoreFilter === 'all' || 
        (scoreFilter === 'high' && match.similarity_score >= 0.9) ||
        (scoreFilter === 'medium' && match.similarity_score >= 0.75 && match.similarity_score < 0.9) ||
        (scoreFilter === 'low' && match.similarity_score < 0.75);
      
      const matchesType = matchTypeFilter === 'all' || match.duplicate_type === matchTypeFilter;
      
      const hasDifference = (type: string) => {
        switch(type) {
          case 'name': return match.new_product.product_name.toLowerCase() !== match.existing_product.product_name.toLowerCase();
          case 'brand': return (match.new_product.brand_name || '').toLowerCase() !== (match.existing_product.brand_name || '').toLowerCase();
          case 'size': return String(match.new_product.size || '').toLowerCase() !== String(match.existing_product.size || '').toLowerCase();
          case 'variety': return (match.new_product.variety || '').toLowerCase() !== (match.existing_product.variety || '').toLowerCase();
          default: return true;
        }
      };
      const matchesDifference = differenceFilter === 'all' || hasDifference(differenceFilter);
      
      return matchesSearch && matchesCategory && matchesBrand && matchesScore && matchesType && matchesDifference;
    }) || [];
  }, [reviewData?.duplicate_matches, searchTerm, categoryFilter, brandFilter, scoreFilter, matchTypeFilter, differenceFilter]);

  const handleSelectAll = (type: 'new' | 'duplicates') => {
    if (type === 'new') {
      const allVisible = new Set(filteredNewProducts.map(p => p.product_id));
      const currentSelected = new Set(selectedProducts);
      
      // Check if all visible are selected
      const allVisibleSelected = filteredNewProducts.every(p => currentSelected.has(p.product_id));
      
      if (allVisibleSelected) {
        // Deselect all visible
        filteredNewProducts.forEach(p => currentSelected.delete(p.product_id));
      } else {
        // Select all visible
        filteredNewProducts.forEach(p => currentSelected.add(p.product_id));
      }
      
      setSelectedProducts(currentSelected);
    }
  };

  const handleProductToggle = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleDuplicateDecision = (productId: string, decision: 'skip' | 'create_anyway' | 'update_existing') => {
    setDuplicateDecisions(prev => ({
      ...prev,
      [productId]: decision
    }));
  };

  const toggleExpandDuplicate = (productId: string) => {
    const newExpanded = new Set(expandedDuplicates);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedDuplicates(newExpanded);
  };

  const toggleMatchDetails = (productId: string) => {
    const newShowDetails = new Set(showMatchDetails);
    if (newShowDetails.has(productId)) {
      newShowDetails.delete(productId);
    } else {
      newShowDetails.add(productId);
    }
    setShowMatchDetails(newShowDetails);
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 0.95) return 'text-red-600 bg-red-50';
    if (score >= 0.85) return 'text-orange-600 bg-orange-50';
    if (score >= 0.75) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getDuplicateTypeColor = (type: string) => {
    switch (type) {
      case 'exact': return 'bg-red-100 text-red-800';
      case 'fuzzy': return 'bg-orange-100 text-orange-800';
      case 'brand_variety': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleConfirm = () => {
    const finalSelectedProducts = Array.from(selectedProducts);
    onConfirm(finalSelectedProducts, duplicateDecisions);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 animate-fadeIn">
  {/* Live Save removed */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-[98vw] w-full max-h-[98vh] flex flex-col overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Eye className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Product Review & Confirmation</h2>
              <p className="text-sm text-gray-600 mt-1">
                Review {reviewData?.stats?.total || 0} products before adding to collection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Stats Overview - Compact Version */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">Total Products</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{reviewData?.stats?.total || 0}</p>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <RefreshCw className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">New Products</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{reviewData?.stats?.new_count || 0}</p>
                </div>
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">Potential Duplicates</p>
                  <p className="text-xl font-bold text-orange-600 mt-1">{reviewData?.stats?.duplicate_count || 0}</p>
                </div>
                <div className="p-2 bg-orange-100 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600">Selected</p>
                  <p className="text-xl font-bold text-blue-600 mt-1">{selectedProducts.size}</p>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Check className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white">
          <button
            onClick={() => setActiveTab('new')}
            className={`px-8 py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'new'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            New Products ({reviewData?.stats?.new_count || 0})
          </button>
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`px-8 py-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'duplicates'
                ? 'border-orange-500 text-orange-600 bg-orange-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Potential Duplicates ({reviewData?.stats?.duplicate_count || 0})
          </button>
          {reviewData?.invalid_entries && reviewData.invalid_entries.length > 0 && (
            <button
              onClick={() => setActiveTab('invalid')}
              className={`px-8 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'invalid'
                  ? 'border-red-500 text-red-600 bg-red-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              Invalid Entries ({reviewData?.stats?.invalid_count || 0})
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center space-x-2 min-w-80">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-48"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-48"
            >
              <option value="all">All Brands</option>
              {brands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
            {activeTab === 'new' && (
              <button
                onClick={() => handleSelectAll('new')}
                className="px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
              >
                Toggle All Visible
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-white">
          {activeTab === 'new' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-semibold text-gray-900">New Products to Create</h3>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => handleSelectAll('new')}
                    className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                  >
                    {filteredNewProducts.every(p => selectedProducts.has(p.product_id)) ? 'Deselect All' : 'Select All'}
                  </button>
                  <p className="text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg">
                    {filteredNewProducts.length} of {reviewData?.new_products?.length || 0} products shown
                  </p>
                </div>
              </div>

              {/* Enhanced Table View for New Products */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={filteredNewProducts.length > 0 && filteredNewProducts.every(p => selectedProducts.has(p.product_id))}
                            onChange={() => handleSelectAll('new')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product Details
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Classification
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          AI Confidence
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredNewProducts.map((product, index) => (
                        <tr 
                          key={product.product_id} 
                          className={`hover:bg-gray-50 ${selectedProducts.has(product.product_id) ? 'bg-blue-50 border-l-4 border-l-blue-500' : (index % 2 === 0 ? 'bg-white' : 'bg-gray-50')}`}
                        >
                          {/* Selection Column */}
                          <td className="px-4 py-2 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.product_id)}
                              onChange={() => handleProductToggle(product.product_id)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </td>

                          {/* Product Details Column */}
                          <td className="px-4 py-2">
                            <div className="flex items-start space-x-3">
                              {product.image_url && (
                                <img
                                  src={getProxiedImageUrl(product.image_url)}
                                  alt={product.product_name}
                                  className="w-16 h-16 object-cover rounded border flex-shrink-0"
                                  onError={(e) => {
                                    // Fallback to inline SVG placeholder if the image fails to load
                                    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
                                      <rect width='64' height='64' fill='%23f3f4f6'/>
                                      <g fill='%239ca3af'>
                                        <circle cx='20' cy='24' r='6'/>
                                        <path d='M8 50l12-12 10 10 8-8 18 18H8z' />
                                      </g>
                                    </svg>`;
                                    const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = url;
                                  }}
                                />
                              )}
                              {!product.image_url && (
                                <div className="w-16 h-16 rounded border flex-shrink-0 bg-gray-100 flex items-center justify-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 64 64">
                                    <rect width="64" height="64" fill="#f3f4f6"></rect>
                                    <g fill="#9ca3af">
                                      <circle cx="22" cy="24" r="7"></circle>
                                      <path d="M10 52l14-14 11 11 9-9 20 20H10z"></path>
                                    </g>
                                  </svg>
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                                  {product.product_name}
                                </h4>
                                {product.original_name && product.original_name !== product.product_name && (
                                  <p className="text-xs text-gray-500 mb-1 bg-gray-100 px-2 py-0.5 rounded line-clamp-2">
                                    Original: {product.original_name}
                                  </p>
                                )}
                                <div className="space-y-0.5 text-xs text-gray-600">
                                  <div><span className="font-medium text-gray-700">ID:</span> <span className="font-mono bg-gray-50 px-1 rounded">{product.product_id}</span></div>
                                  {product.variety && (
                                    <div><span className="font-medium text-gray-700">Variety:</span> {product.variety}</div>
                                  )}
                                  {product.sizeUnit && (
                                    <div><span className="font-medium text-gray-700">Unit:</span> {product.sizeUnit}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Classification Column */}
                          <td className="px-4 py-2">
                            <div className="space-y-1">
                              {product.brand_name && (
                                <div className="flex items-center">
                                  <span className="w-14 text-xs text-gray-500 font-medium">Brand:</span>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded font-medium">
                                    {product.brand_name}
                                  </span>
                                </div>
                              )}
                              {product.category && (
                                <div className="flex items-center">
                                  <span className="w-14 text-xs text-gray-500 font-medium">Category:</span>
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded font-medium">
                                    {product.category}
                                  </span>
                                </div>
                              )}
                              {product.variety && (
                                <div className="flex items-center">
                                  <span className="w-14 text-xs text-gray-500 font-medium">Variety:</span>
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded font-medium">
                                    {product.variety}
                                  </span>
                                </div>
                              )}
                              {product.sizeRaw && (
                                <div className="flex items-center">
                                  <span className="w-14 text-xs text-gray-500 font-medium">Size:</span>
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded font-medium">
                                    {product.sizeRaw}
                                  </span>
                                </div>
                              )}
                              {product.size && !product.sizeRaw && (
                                <div className="flex items-center">
                                  <span className="w-14 text-xs text-gray-500 font-medium">Size:</span>
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-800 text-xs rounded font-medium">
                                    {product.size}
                                  </span>
                                </div>
                              )}
                              {product.sizeUnit && (
                                <div className="flex items-center">
                                  <span className="w-14 text-xs text-gray-500 font-medium">Unit:</span>
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded font-medium">
                                    {product.sizeUnit}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* AI Confidence Column */}
                          <td className="px-4 py-2 whitespace-nowrap text-center">
                            {product.confidence_score ? (
                              <div className="space-y-1">
                                <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  product.confidence_score >= 0.9 ? 'bg-green-100 text-green-800' :
                                  product.confidence_score >= 0.7 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {(product.confidence_score * 100).toFixed(0)}%
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                  <div 
                                    className={`h-1.5 rounded-full ${
                                      product.confidence_score >= 0.9 ? 'bg-green-500' :
                                      product.confidence_score >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${(product.confidence_score * 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">N/A</span>
                            )}
                          </td>

                          {/* Actions Column */}
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleProductToggle(product.product_id)}
                                className={`px-3 py-1 text-xs rounded font-medium transition-all ${
                                  selectedProducts.has(product.product_id)
                                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {selectedProducts.has(product.product_id) ? (
                                  <>
                                    <CheckCircle className="h-3 w-3 inline mr-1" />
                                    Selected
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="h-3 w-3 inline mr-1" />
                                    Excluded
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredNewProducts.length === 0 && (
                  <div className="text-center py-12">
                    <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 mb-2">No new products found</p>
                    <p className="text-sm text-gray-400">All products appear to be duplicates or invalid.</p>
                  </div>
                )}
              </div>

              {/* Selection Summary */}
              {filteredNewProducts.length > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Selection Summary</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-green-600">
                        {selectedProducts.size}
                      </p>
                      <p className="text-sm text-gray-600">Products selected for creation</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-gray-600">
                        {filteredNewProducts.length - selectedProducts.size}
                      </p>
                      <p className="text-sm text-gray-600">Products excluded</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'duplicates' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-semibold text-gray-900">Potential Duplicate Products</h3>
                <p className="text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-lg">
                  {filteredDuplicates.length} of {reviewData?.duplicate_matches?.length || 0} duplicates shown
                </p>
              </div>

              {/* Advanced Filters - Single Row */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Similarity Score Filter */}
                  <div className="group relative">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Score Range</label>
                    <select
                      value={scoreFilter}
                      onChange={(e) => setScoreFilter(e.target.value as any)}
                      className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                    >
                      <option value="all">All Scores</option>
                      <option value="high">🟢 High (≥90%)</option>
                      <option value="medium">🟡 Medium (75-90%)</option>
                      <option value="low">🔴 Low (&lt;75%)</option>
                    </select>
                  </div>

                  {/* Match Type Filter */}
                  <div className="group relative">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Match Type</label>
                    <select
                      value={matchTypeFilter}
                      onChange={(e) => setMatchTypeFilter(e.target.value as any)}
                      className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                    >
                      <option value="all">All Types</option>
                      <option value="exact">⭐ Exact Match</option>
                      <option value="fuzzy">🔍 Fuzzy Match</option>
                      <option value="brand_variety">🏷️ Brand/Variety</option>
                    </select>
                  </div>

                  {/* Difference Filter */}
                  <div className="group relative">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Key Differences</label>
                    <select
                      value={differenceFilter}
                      onChange={(e) => setDifferenceFilter(e.target.value as any)}
                      className="pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                    >
                      <option value="all">All Differences</option>
                      <option value="name">📝 Name Differs</option>
                      <option value="brand">🏢 Brand Differs</option>
                      <option value="size">📏 Size Differs</option>
                      <option value="variety">🎨 Variety Differs</option>
                    </select>
                  </div>

                  {/* Reset Filters */}
                  {(scoreFilter !== 'all' || matchTypeFilter !== 'all' || differenceFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setScoreFilter('all');
                        setMatchTypeFilter('all');
                        setDifferenceFilter('all');
                      }}
                      className="ml-auto px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-all hover:shadow-sm flex items-center gap-2"
                    >
                      <RefreshCw size={14} />
                      Reset Filters
                    </button>
                  )}

                  {/* Active Filter Count Badge */}
                  {(scoreFilter !== 'all' || matchTypeFilter !== 'all' || differenceFilter !== 'all') && (
                    <div className="ml-auto flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-semibold animate-pulse">
                      <Filter size={14} />
                      {[scoreFilter !== 'all', matchTypeFilter !== 'all', differenceFilter !== 'all'].filter(Boolean).length} Active
                    </div>
                  )}
                </div>
              </div>

              {/* Bulk Actions */}
              <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const updates = { ...duplicateDecisions };
                        filteredDuplicates.forEach(match => {
                          updates[match.new_product.product_id] = 'skip';
                        });
                        setDuplicateDecisions(updates);
                      }}
                      className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                    >
                      Skip All Visible
                    </button>
                    <button
                      onClick={() => {
                        const updates = { ...duplicateDecisions };
                        filteredDuplicates.forEach(match => {
                          updates[match.new_product.product_id] = 'create_anyway';
                        });
                        setDuplicateDecisions(updates);
                      }}
                      className="px-4 py-2 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors font-medium"
                    >
                      Create All Anyway
                    </button>
                    <button
                      onClick={applyDbDetailsToAllVisible}
                      className="px-4 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                      title="Update all visible duplicates' JSON (name/brand/size) to match existing DB details"
                    >
                      Use DB Details (All Visible)
                    </button>
                  </div>
                  <div className="text-xs text-gray-600 bg-green-50 border border-green-200 rounded px-3 py-2">
                    <span className="font-medium"> Info:</span> Match scores calculated as average of individual similarity metrics
                  </div>
              </div>

              {/* Enhanced Table View */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Match Info
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          New Product
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Existing Product
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Key Differences
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredDuplicates.map((match, index) => (
                        <React.Fragment key={match.new_product.product_id}>
                          <tr className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            {/* Match Info Column */}
                            <td className="px-4 py-2 whitespace-nowrap">
                              <div className="space-y-1">
                                <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSimilarityColor(calculateOverallMatch(match))}`}>
                                  {(calculateOverallMatch(match) * 100).toFixed(1)}% Match
                                  {calculateOverallMatch(match) >= 0.99 && (
                                    <span className="ml-1 px-1 py-0.5 bg-red-600 text-white rounded text-xs font-bold">
                                      EXACT
                                    </span>
                                  )}
                                </div>
                                {/* Only show duplicate type if it's not already showing as EXACT */}
                                {calculateOverallMatch(match) < 0.99 && (
                                  <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getDuplicateTypeColor(match.duplicate_type)}`}>
                                    {match.duplicate_type.replace('_', ' ').toUpperCase()}
                                  </div>
                                )}
                                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border">
                                  <div className="space-y-0.5">
                                    <div><span className="font-medium">Name:</span> {((match.match_details?.name_similarity ?? 0) * 100).toFixed(1)}%</div>
                                    <div><span className="font-medium">Brand:</span> {((match.match_details?.brand_similarity ?? 0) * 100).toFixed(1)}%</div>
                                    <div><span className="font-medium">Size:</span> {((match.match_details?.size_similarity ?? 0) * 100).toFixed(1)}%</div>
                                    <div><span className="font-medium">Tokens:</span> {(match.match_details?.token_overlap ?? 0).toFixed(1)}%</div>
                                  </div>
                                  <div className="mt-1 pt-1 border-t border-gray-200">
                                    <div className="text-xs font-medium text-blue-600">
                                      📊 Average Match: {(calculateOverallMatch(match) * 100).toFixed(1)}%
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => toggleMatchDetails(match.new_product.product_id)}
                                  className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                                >
                                  {showMatchDetails.has(match.new_product.product_id) ? 'Hide Analysis' : 'Show Analysis'}
                                </button>
                              </div>
                            </td>

                            {/* New Product Column */}
                            <td className="px-4 py-2">
                              <div className="flex items-start space-x-3">
                                {match.new_product.image_url && (
                                  <img
                                    src={getProxiedImageUrl(match.new_product.image_url)}
                                    alt={match.new_product.product_name}
                                    className="w-16 h-16 object-cover rounded border flex-shrink-0"
                                    onError={(e) => {
                                      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
                                        <rect width='64' height='64' fill='%23f3f4f6'/>
                                        <g fill='%239ca3af'>
                                          <circle cx='20' cy='24' r='6'/>
                                          <path d='M8 50l12-12 10 10 8-8 18 18H8z' />
                                        </g>
                                      </svg>`;
                                      const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
                                      e.currentTarget.onerror = null;
                                      e.currentTarget.src = url;
                                    }}
                                  />
                                )}
                                {!match.new_product.image_url && (
                                  <div className="w-16 h-16 rounded border flex-shrink-0 bg-gray-100 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 64 64">
                                      <rect width="64" height="64" fill="#f3f4f6"></rect>
                                      <g fill="#9ca3af">
                                        <circle cx="22" cy="24" r="7"></circle>
                                        <path d="M10 52l14-14 11 11 9-9 20 20H10z"></path>
                                      </g>
                                    </svg>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2 flex items-center gap-2">
                                    <span>{match.new_product.product_name}</span>
                                    {match.new_product.syncedFromDb && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Values synced from existing DB product">
                                        Synced from DB
                                      </span>
                                    )}
                                  </h4>
                                  {match.new_product.original_name && match.new_product.original_name !== match.new_product.product_name && (
                                    <p className="text-xs text-gray-500 mb-1 bg-gray-100 px-2 py-0.5 rounded line-clamp-2">
                                      Original: {match.new_product.original_name}
                                    </p>
                                  )}
                                  <div className="space-y-0.5 text-xs text-gray-600">
                                    <div><span className="font-medium text-gray-700">Brand:</span> {match.new_product.brand_name || 'N/A'}</div>
                                    <div><span className="font-medium text-gray-700">Size:</span> {match.new_product.sizeRaw || match.new_product.size || 'N/A'}</div>
                                    <div><span className="font-medium text-gray-700">Category:</span> {formatCategoryName(match.new_product.category)}</div>
                                    {match.new_product.variety && (
                                      <div><span className="font-medium text-gray-700">Variety:</span> {match.new_product.variety}</div>
                                    )}
                                    <div><span className="font-medium text-gray-700">ID:</span> <span className="font-mono bg-gray-50 px-1 rounded">{match.new_product.product_id}</span></div>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Existing Product Column */}
                            <td className="px-4 py-2">
                              <div className="flex items-start space-x-3">
                                {match.existing_product.image_url && (
                                  <div className={`relative rounded ${
                                    imageUpdateStatus[match.new_product.product_id] === 'success'
                                      ? 'ring-2 ring-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.25)]'
                                      : ''
                                  } transition-all duration-700 flex-shrink-0`}
                                  >
                                    <img
                                      src={getProxiedImageUrl(match.existing_product.image_url)}
                                      alt={match.existing_product.product_name}
                                      className="w-16 h-16 object-cover rounded border"
                                      onError={(e) => {
                                        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
                                          <rect width='64' height='64' fill='%23f3f4f6'/>
                                          <g fill='%239ca3af'>
                                            <circle cx='20' cy='24' r='6'/>
                                            <path d='M8 50l12-12 10 10 8-8 18 18H8z' />
                                          </g>
                                        </svg>`;
                                        const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
                                        (e.currentTarget as HTMLImageElement).onerror = null;
                                        (e.currentTarget as HTMLImageElement).src = url;
                                      }}
                                    />
                                  </div>
                                )}
                                {!match.existing_product.image_url && (
                                  <div className="w-16 h-16 rounded border flex-shrink-0 bg-gray-100 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 64 64">
                                      <rect width="64" height="64" fill="#f3f4f6"></rect>
                                      <g fill="#9ca3af">
                                        <circle cx="22" cy="24" r="7"></circle>
                                        <path d="M10 52l14-14 11 11 9-9 20 20H10z"></path>
                                      </g>
                                    </svg>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2 flex items-center gap-2">
                                    <span>{match.existing_product.product_name}</span>
                                    {imageUpdateStatus[match.new_product.product_id] === 'success' && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Image URL updated in DB">
                                        Image updated
                                      </span>
                                    )}
                                  </h4>
                                  {match.existing_product.original_name && match.existing_product.original_name !== match.existing_product.product_name && (
                                    <p className="text-xs text-gray-500 mb-1 bg-gray-100 px-2 py-0.5 rounded line-clamp-2">
                                      Original: {match.existing_product.original_name}
                                    </p>
                                  )}
                                  <div className="space-y-0.5 text-xs text-gray-600">
                                    <div><span className="font-medium text-gray-700">Brand:</span> {match.existing_product.brand_name || 'N/A'}</div>
                                    <div><span className="font-medium text-gray-700">Size:</span> {match.existing_product.sizeRaw || match.existing_product.size || 'N/A'}</div>
                                    <div><span className="font-medium text-gray-700">Category:</span> {formatCategoryName(match.existing_product.category)}</div>
                                    {match.existing_product.variety && (
                                      <div><span className="font-medium text-gray-700">Variety:</span> {match.existing_product.variety}</div>
                                    )}
                                    <div><span className="font-medium text-gray-700">ID:</span> <span className="font-mono bg-gray-50 px-1 rounded">{match.existing_product.product_id}</span></div>
                                  </div>
                                  <button
                                    className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline flex items-center"
                                    onClick={() => window.open(`/products/${match.existing_product.product_id}`, '_blank')}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View in DB
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Key Differences Column */}
                            <td className="px-4 py-2">
                              <div className="space-y-1 text-xs">
                                {match.new_product.product_name !== match.existing_product.product_name && (
                                  <div className="bg-yellow-100 border border-yellow-200 rounded p-1">
                                    <span className="text-yellow-800 font-medium">📝 Name differs</span>
                                    <div className="text-xs text-yellow-700 mt-0.5">
                                      <div><strong>New:</strong> {match.new_product.product_name.substring(0, 30)}{match.new_product.product_name.length > 30 ? '...' : ''}</div>
                                      <div><strong>Existing:</strong> {match.existing_product.product_name.substring(0, 30)}{match.existing_product.product_name.length > 30 ? '...' : ''}</div>
                                    </div>
                                  </div>
                                )}
                                {match.new_product.brand_name !== match.existing_product.brand_name && (
                                  <div className="bg-blue-100 border border-blue-200 rounded p-1">
                                    <span className="text-blue-800 font-medium">🏷️ Brand differs</span>
                                    <div className="text-xs text-blue-700 mt-0.5">
                                      <div><strong>New:</strong> {match.new_product.brand_name || 'N/A'}</div>
                                      <div><strong>Existing:</strong> {match.existing_product.brand_name || 'N/A'}</div>
                                    </div>
                                  </div>
                                )}
                                {(match.new_product.sizeRaw || match.new_product.size) !== (match.existing_product.sizeRaw || match.existing_product.size) && (
                                  <div className="bg-purple-100 border border-purple-200 rounded p-1">
                                    <span className="text-purple-800 font-medium">📏 Size differs</span>
                                    <div className="text-xs text-purple-700 mt-0.5">
                                      <div><strong>New:</strong> {match.new_product.sizeRaw || match.new_product.size || 'N/A'}</div>
                                      <div><strong>Existing:</strong> {match.existing_product.sizeRaw || match.existing_product.size || 'N/A'}</div>
                                    </div>
                                  </div>
                                )}
                                {match.new_product.category !== match.existing_product.category && (
                                  <div className="bg-green-100 border border-green-200 rounded p-1">
                                    <span className="text-green-800 font-medium">📂 Category differs</span>
                                    <div className="text-xs text-green-700 mt-0.5">
                                      <div><strong>New:</strong> {formatCategoryName(match.new_product.category)}</div>
                                      <div><strong>Existing:</strong> {formatCategoryName(match.existing_product.category)}</div>
                                    </div>
                                  </div>
                                )}
                                {match.match_reasons.length > 0 && (
                                  <div className="bg-gray-100 border border-gray-200 rounded p-1">
                                    <span className="text-gray-800 font-medium text-xs">🔍 Match Reasons:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {match.match_reasons.slice(0, 3).map((reason: string, idx: number) => (
                                        <span key={idx} className="px-1 py-0.5 bg-gray-200 text-gray-700 text-xs rounded">
                                          {reason.replace('Exact normalized name match', 'Exact').replace('Brand and variety match', 'Brand+variety')}
                                        </span>
                                      ))}
                                      {match.match_reasons.length > 3 && (
                                        <span className="text-gray-500 text-xs">+{match.match_reasons.length - 3}</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Action Column */}
                            <td className="px-4 py-2 whitespace-nowrap">
                              <div className="flex flex-col space-y-1">
                                <button
                                  onClick={() => handleDuplicateDecision(match.new_product.product_id, 'skip')}
                                  className={`px-3 py-1.5 text-xs rounded border font-medium transition-all ${
                                    duplicateDecisions[match.new_product.product_id] === 'skip'
                                      ? 'bg-gray-700 text-white border-gray-700 shadow-sm'
                                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                  }`}
                                  title="Skip this duplicate - won't create the new product"
                                >
                                  <XCircle className="h-3 w-3 inline mr-1" />
                                  Skip New
                                </button>
                                <button
                                  onClick={() => handleDuplicateDecision(match.new_product.product_id, 'create_anyway')}
                                  className={`px-3 py-1.5 text-xs rounded border font-medium transition-all ${
                                    duplicateDecisions[match.new_product.product_id] === 'create_anyway'
                                      ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                                      : 'bg-white text-orange-700 border-orange-300 hover:bg-orange-50'
                                  }`}
                                  title="Create the new product despite being a duplicate"
                                >
                                  <CheckCircle className="h-3 w-3 inline mr-1" />
                                  Create Anyway
                                </button>
                                <button
                                  onClick={() => handleDuplicateDecision(match.new_product.product_id, 'update_existing')}
                                  className={`px-3 py-1.5 text-xs rounded border font-medium transition-all ${
                                    duplicateDecisions[match.new_product.product_id] === 'update_existing'
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                      : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                                  }`}
                                  title="Update the existing product with new information"
                                >
                                  <RefreshCw className="h-3 w-3 inline mr-1" />
                                  Update Existing
                                </button>
                                <button
                                  onClick={() => applyDbDetailsToDuplicate(match.new_product.product_id)}
                                  className="px-3 py-1.5 text-xs rounded border font-medium transition-all bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                                  title="Sync this duplicate's JSON fields (name/brand/size) from the existing database product"
                                >
                                  Use DB Details (JSON)
                                </button>
                                <button
                                  onClick={() => updateDbImageOnly(match.new_product.product_id)}
                                  disabled={!canUpdateImage(match) || imageUpdateStatus[match.new_product.product_id] === 'loading'}
                                  className={`px-3 py-1.5 text-xs rounded border font-medium transition-all inline-flex items-center ${
                                    canUpdateImage(match)
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                  }`}
                                  title="Update only the database image URL to use the new image from this JSON"
                                >
                                  {imageUpdateStatus[match.new_product.product_id] === 'loading' && (
                                    <RefreshCw className="h-3 w-3 inline mr-1 animate-spin" />
                                  )}
                                  {imageUpdateStatus[match.new_product.product_id] === 'success' && (
                                    <CheckCircle className="h-3 w-3 inline mr-1" />
                                  )}
                                  Update DB Image Only
                                </button>
                                {imageUpdateStatus[match.new_product.product_id] === 'error' && (
                                  <span className="text-xs text-red-600">Failed to update image</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expandable Match Details Row */}
                          {showMatchDetails.has(match.new_product.product_id) && (
                            <tr className="bg-blue-50">
                              <td colSpan={5} className="px-4 py-3">
                                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                                  <h5 className="text-sm font-semibold text-gray-900 mb-2">Detailed Matching Analysis</h5>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                    <div className="bg-white p-2 rounded text-center">
                                      <p className="text-gray-600 text-xs mb-1">Name Similarity</p>
                                      <p className="text-sm font-bold text-blue-600">{((match.match_details?.name_similarity ?? 0) * 100).toFixed(1)}%</p>
                                    </div>
                                    <div className="bg-white p-2 rounded text-center">
                                      <p className="text-gray-600 text-xs mb-1">Brand Similarity</p>
                                      <p className="text-sm font-bold text-green-600">{((match.match_details?.brand_similarity ?? 0) * 100).toFixed(1)}%</p>
                                    </div>
                                    <div className="bg-white p-2 rounded text-center">
                                      <p className="text-gray-600 text-xs mb-1">Size Similarity</p>
                                      <p className="text-sm font-bold text-purple-600">{((match.match_details?.size_similarity ?? 0) * 100).toFixed(1)}%</p>
                                    </div>
                                    <div className="bg-white p-2 rounded text-center">
                                      <p className="text-gray-600 text-xs mb-1">Token Overlap</p>
                                      <p className="text-sm font-bold text-orange-600">{(match.match_details?.token_overlap ?? 0).toFixed(1)}%</p>
                                    </div>
                                  </div>
                                  <div className="bg-white p-2 rounded">
                                    <p className="text-gray-600 text-xs mb-2">Match Reasons:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {match.match_reasons.map((reason: string, idx: number) => (
                                        <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                          {reason}
                                        </span>
                                      ))}
                                    </div>
                                    {match.match_details?.normalized_name_match && (
                                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                                        <span className="text-red-800 text-xs font-medium">⚠️ Normalized names match exactly</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {filteredDuplicates.length === 0 && (
                  <div className="text-center py-12">
                    <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 mb-2">No duplicate products found</p>
                    <p className="text-sm text-gray-400">All products appear to be unique.</p>
                  </div>
                )}
              </div>

              {/* Quick Action Summary */}
              {filteredDuplicates.length > 0 && (
                <div className="bg-gradient-to-r from-gray-50 to-blue-50 border border-gray-200 rounded-xl p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Quick Summary</h4>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-700">
                        {Object.values(duplicateDecisions).filter(d => d === 'skip').length}
                      </p>
                      <p className="text-sm text-gray-600">Will be skipped</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">
                        {Object.values(duplicateDecisions).filter(d => d === 'create_anyway').length}
                      </p>
                      <p className="text-sm text-gray-600">Will be created anyway</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {Object.values(duplicateDecisions).filter(d => d === 'update_existing').length}
                      </p>
                      <p className="text-sm text-gray-600">Will update existing</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'invalid' && reviewData?.invalid_entries && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-lg font-medium text-red-900 mb-2">❌ Invalid Entries Found</h3>
                <p className="text-sm text-red-700 mb-4">
                  The following entries have validation issues and cannot be processed. Please fix these issues and re-upload the corrected file.
                </p>
                
                <div className="space-y-4">
                  {reviewData.invalid_entries.map((entry, index) => (
                    <div key={index} className="bg-white border border-red-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="font-medium text-gray-900">
                          Entry #{entry.index + 1}
                        </h4>
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                          {entry.issues.length} issue{entry.issues.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      {/* Issues */}
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Issues Found:</h5>
                        <ul className="space-y-1">
                          {entry.issues.map((issue, issueIndex) => (
                            <li key={issueIndex} className="text-sm text-red-600 flex items-start">
                              <span className="text-red-400 mr-2">•</span>
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      {/* Suggested Fixes */}
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Suggested Fixes:</h5>
                        <ul className="space-y-1">
                          {entry.suggested_fixes.map((fix, fixIndex) => (
                            <li key={fixIndex} className="text-sm text-blue-600 flex items-start">
                              <span className="text-blue-400 mr-2">→</span>
                              {fix}
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      {/* Entry Content */}
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Entry Content:</h5>
                        <div className="bg-gray-50 p-3 rounded border text-xs font-mono overflow-x-auto">
                          <pre>{JSON.stringify(entry.content, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                  <h5 className="text-sm font-medium text-blue-900 mb-2">💡 How to Fix:</h5>
                  <ol className="text-sm text-blue-800 space-y-1">
                    <li>1. Download or edit your JSON file</li>
                    <li>2. Fix the issues listed above for each invalid entry</li>
                    <li>3. Remove empty entries (like <code>{'{}'}</code>) or entries with only status fields</li>
                    <li>4. Ensure all products have required fields: product_type, product_name</li>
                    <li>5. Re-upload the corrected file</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-sm text-gray-600 bg-white px-6 py-3 rounded-lg shadow-sm">
                <div className="flex items-center space-x-6">
                  <span className="font-medium">
                    {selectedProducts.size} new products selected
                  </span>
                  <span className="font-medium">
                    {Object.values(duplicateDecisions).filter(d => d === 'create_anyway').length} duplicates to create anyway
                  </span>
                </div>
              </div>
              {/* Live Save controls removed */}
            </div>
            <div className="flex space-x-4 mt-4 md:mt-0">
              <button
                onClick={downloadUpdatedJson}
                className="px-8 py-4 text-indigo-700 bg-white border-2 border-indigo-300 rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-all font-semibold"
                title="Download the updated classification JSON including any synced duplicate fields from the database"
              >
                Download Updated JSON
              </button>
              <button
                onClick={onClose}
                className="px-8 py-4 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all font-semibold"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isProcessing || (selectedProducts.size === 0 && Object.values(duplicateDecisions).filter(d => d !== 'skip').length === 0)}
                className="px-8 py-4 bg-blue-600 text-white border-2 border-blue-600 rounded-xl hover:bg-blue-700 hover:border-blue-700 disabled:bg-gray-300 disabled:border-gray-300 disabled:cursor-not-allowed transition-all flex items-center space-x-3 font-semibold shadow-lg"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    <span>Confirm & Create Products</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-slideIn {
          animation: slideIn 0.4s ease-out;
        }

        :global(.shimmer-effect) {
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default ProductReviewModal;
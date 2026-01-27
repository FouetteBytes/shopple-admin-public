import { useCallback, useEffect, useState } from 'react';
import { Calendar, Shop, Image as ImageIcon, Edit2 } from 'iconsax-react';
import Image from 'next/image';
import { searchCatalogue, type ProductCatalogueMatch } from '@/lib/productSearchApi';
import { useGlobalToast } from '@/contexts/ToastContext';
import { classNames, formatDate } from '../utils';
import { API_BASE_URL } from '@/lib/api';

type ProductWithPrices = ProductCatalogueMatch & {
  currentPrices?: Array<{
    supermarketId: string;
    price: number;
    lastUpdated: string;
  }>;
  lastPriceUpdate?: string;
};

type ProductDatabaseSearchProps = {
  taggedProductId?: string;
  productName: string;
  brand?: string;
  onUpdateProduct?: (productId: string) => void;
};

export function ProductDatabaseSearchEnhanced({ taggedProductId, productName, brand, onUpdateProduct }: ProductDatabaseSearchProps) {
  const [searchQuery, setSearchQuery] = useState(productName || '');
  const [searching, setSearching] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ProductWithPrices[]>([]);
  const { error: showError } = useGlobalToast();

  const fetchPriceData = useCallback(async (productId: string): Promise<ProductWithPrices['currentPrices']> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prices/current/${productId}`);
      if (!response.ok) throw new Error('Failed to fetch prices');
      const data = await response.json();
      if (data.success && data.prices) {
        return data.prices.sort((a: any, b: any) => a.price - b.price);
      }
      return [];
    } catch (err) {
      console.error('Failed to fetch price data:', err);
      return [];
    }
  }, []);

  const loadPricesForProduct = useCallback(async (productId: string) => {
    if (results.find(r => r.id === productId)?.currentPrices) return; // Already loaded
    
    setLoadingPrices(productId);
    try {
      const prices = await fetchPriceData(productId);
      const lastUpdate = prices && prices.length > 0 
        ? prices.reduce((latest, p) => 
            new Date(p.lastUpdated) > new Date(latest) ? p.lastUpdated : latest, 
            prices[0].lastUpdated
          )
        : undefined;
      
      setResults(prev => prev.map(r => 
        r.id === productId 
          ? { ...r, currentPrices: prices, lastPriceUpdate: lastUpdate }
          : r
      ));
    } catch (err) {
      console.error('Failed to load prices:', err);
    } finally {
      setLoadingPrices(null);
    }
  }, [results, fetchPriceData]);

  const toggleExpand = useCallback((productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
        // Load prices when expanding
        loadPricesForProduct(productId);
      }
      return next;
    });
  }, [loadPricesForProduct]);

  const executeSearch = useCallback(async (termRaw?: string) => {
    const term = (termRaw ?? '').trim();
    if (!term) return;
    setSearching(true);
    try {
      const matches = await searchCatalogue(term, { limit: 5, brand });
      
      // Show results immediately; defer price fetch until expansion.
      const enrichedMatches = matches.map(match => ({
        ...match,
        currentPrices: undefined,
        lastPriceUpdate: undefined,
      }));
      
      setResults(enrichedMatches);
    } catch (err: any) {
      showError('Product search failed', err?.message ?? String(err));
    } finally {
      setSearching(false);
    }
  }, [brand, showError]);

  // Keep input synced with incoming props
  useEffect(() => {
    if (productName) {
      setSearchQuery(productName);
    }
  }, [productName]);

  // Auto-trigger search when product name or tagged product changes
  useEffect(() => {
    const term = productName?.trim() || taggedProductId?.trim();
    if (!term) return;
    setSearchQuery(term);
    executeSearch(term);
  }, [productName, taggedProductId, executeSearch]);

  const showNoResults = results.length === 0 && searchQuery && !searching;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && executeSearch(searchQuery)}
          placeholder="Search product database..."
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => executeSearch(searchQuery)}
          disabled={searching || !searchQuery.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-primary/50"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {taggedProductId && (
        <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
          Tagged product ID: <span className="font-mono font-semibold">{taggedProductId}</span>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((product) => {
            const isExpanded = expandedProducts.has(product.id);
            return (
              <div
                key={product.id}
                className={classNames(
                  'rounded-xl border p-4 transition-all cursor-pointer',
                  product.id === taggedProductId
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-gray-200 bg-white hover:shadow-md'
                )}
                onClick={() => toggleExpand(product.id)}
              >
                <div className="flex gap-4">
                  {/* Product Image */}
                  <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.name || product.original_name || 'Product'}
                        fill
                        className="object-cover"
                        sizes="96px"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon size={32} className="text-gray-300" />
                      </div>
                    )}
                    {product.id === taggedProductId && (
                      <div className="absolute top-1 right-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                        TAGGED
                      </div>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900">
                          {product.name || product.original_name}
                        </h4>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          {product.brand_name && (
                            <span className="font-medium text-gray-700">{product.brand_name}</span>
                          )}
                          {product.brand_name && product.sizeRaw && <span>·</span>}
                          {product.sizeRaw && <span>{product.sizeRaw}</span>}
                          {(product.brand_name || product.sizeRaw) && product.category && <span>·</span>}
                          {product.category && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium">
                              {product.category}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {product.similarity !== undefined && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            {Math.round(product.similarity * 100)}% match
                          </span>
                        )}
                        {product.isDuplicate && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Duplicate
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable Price Section */}
                    {isExpanded && (
                      <>
                        {product.lastPriceUpdate && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar size={12} />
                            <span>Last updated: {formatDate(product.lastPriceUpdate)}</span>
                          </div>
                        )}

                        {loadingPrices === product.id ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
                            <span>Loading prices...</span>
                          </div>
                        ) : product.currentPrices && product.currentPrices.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs font-medium text-gray-600">
                              <Shop size={12} />
                              <span>
                                Available at {product.currentPrices.length} store
                                {product.currentPrices.length === 1 ? '' : 's'}:
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {product.currentPrices.map((priceInfo) => (
                                <div
                                  key={priceInfo.supermarketId}
                                  className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5"
                                >
                                  <div className="text-[10px] font-medium uppercase text-gray-500">
                                    {priceInfo.supermarketId}
                                  </div>
                                  <div className="text-sm font-bold text-gray-900">
                                    Rs {priceInfo.price.toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No price data available</p>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          {onUpdateProduct && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateProduct(product.id);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:border-primary hover:text-primary"
                            >
                              <Edit2 size={12} />
                              Update Product
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(product.id);
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Copy ID
                          </button>
                        </div>

                        <p className="text-[10px] font-mono text-gray-400">{product.id}</p>
                      </>
                    )}

                    {!isExpanded && (
                      <p className="text-xs text-gray-400 mt-1">Click to view prices and details</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNoResults && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-gray-600">No products found</p>
          <p className="text-xs text-gray-500">Try a different search term</p>
        </div>
      )}
    </div>
  );
}

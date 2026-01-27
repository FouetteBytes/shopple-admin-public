"use client"

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import PageNavbar, {
  PageNavbarLeftContent,
  PageNavbarRightContent,
  PageNavbarIconButton,
} from '@/components/layout/PageNavbar';
import PageContent from '@/components/layout/PageContent';
import {
  MoneyRecive,
  DocumentUpload,
  Chart,
  TrendUp,
  TrendDown,
  Shop,
  Calendar1,
  Refresh2,
  SearchNormal1,
  DirectNotification,
  Clock,
  Category2,
  Building4,
} from 'iconsax-react';
import { GlassStatCard } from '@/components/shared/GlassStatCard';
import { GlassFilterBar } from '@/components/shared/GlassFilterBar';
import { GlassSubTabs } from '@/components/shared/GlassSubTabs';
import ToastNotification, { Toast } from '@/components/shared/ToastNotification';
import { useToast } from '@/hooks/useToast';
import { API_BASE_URL } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHero } from '@/components/shared/PageHero';
import { Skeleton, CardSkeleton } from '@/components/shared/Skeleton';

// Dynamically import chart components without SSR.
const PriceHistoryChart = dynamic(
  () => import('@/components/pricing/PriceHistoryChart'),
  { ssr: false },
);
const PriceIntelligenceChart = dynamic(
  () => import('@/components/pricing/PriceIntelligenceChart'),
  { ssr: false },
);
const MiniPriceTrend = dynamic(
  () => import('@/components/pricing/MiniPriceTrend'),
  { ssr: false },
);
const PriceStatsChart = dynamic(
  () => import('@/components/pricing/PriceStatsChart'),
  { ssr: false },
);
const TestChart = dynamic(
  () => import('@/components/pricing/TestChart'),
  { ssr: false },
);
const DebugData = dynamic(
  () => import('@/components/shared/DebugData'),
  { ssr: false },
);

// Define interfaces for price data.
interface PriceStats {
  total_current_prices: number;
  total_history_documents: number;
  products_with_prices: number;
  supermarkets_with_data: number;
  active_supermarkets: string[];
  // Enhanced overview data.
  supermarket_stats?: { [key: string]: number };
  category_stats?: { [key: string]: { count: number; products: string[] } };
  brand_stats?: { [key: string]: { count: number; products: string[] } };
}

interface CurrentPrice {
  id: string;
  price: number;
  supermarketId: string;
  productId: string;
  lastUpdated: string;
}

interface SupermarketOption {
  id: string;
  name: string;
  active: boolean;
}

interface ProductComparison {
  product_id: string;
  product_name: string;
  current_prices: CurrentPrice[];
  cheapest_store: string;
  price_range: {
    min: number;
    max: number;
    difference: number;
  };
}

interface ProductHistory {
  id: string;
  name: string;
  brand_name: string;
  category: string;
  size: string;
  image_url: string;
}

interface PriceHistoryData {
  daily_prices: Array<{
    date: string;
    price: number;
  }>;
  monthly_stats: any;
  total_records: number;
}

interface PriceAnalysis {
  min_price: number;
  max_price: number;
  avg_price: number;
  price_range: number;
  total_data_points: number;
}

interface EnhancedProduct {
  id: string;
  name: string;
  brand_name: string;
  category: string;
  size: string;
  image_url: string;
  price_data: Array<{
    supermarket: string;
    price: number;
    lastUpdated: string;
  }>;
}

type StatCard = {
  key: string;
  label: string;
  description: string;
  value: string;
  accent: 'primary' | 'amber' | 'emerald' | 'rose' | 'blue';
  icon: React.ElementType;
};

// Price history component.
const PriceHistoryView: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [historyData, setHistoryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Use SWR to fetch available products.
  // This provides caching, revalidation, and better performance.
  const fetcher = (url: string) => fetch(url).then(r => r.json());
  
  const { data: productsData, error: productsError, mutate: refreshProducts } = useSWR(
    `${API_BASE_URL}/api/prices/overview/enhanced?per_page=1000`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Cache for 1 minute.
      keepPreviousData: true, // Keep showing old data while fetching new data.
    }
  );

  const availableProducts: EnhancedProduct[] = useMemo(() => {
    if (productsData && productsData.success) {
      return productsData.products;
    }
    return [];
  }, [productsData]);

  const fetchPriceHistory = async (productId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/prices/history/product/${productId}`);
      const data = await response.json();
      if (data.success) {
        console.log(' Price history data received:', data);
        console.log(' Price history structure:', data.price_history);
        setHistoryData(data);
      } else {
        console.error('Failed to fetch price history:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch price history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    fetchPriceHistory(productId);
  };

  const filteredProducts = availableProducts.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.brand_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className='space-y-6'>
      <div>
        <h3 className='text-lg font-semibold text-gray-900 mb-2'>Price History Analysis</h3>
        <p className='text-gray-600'>
          Track price changes over time for any product across all supermarkets.
        </p>
      </div>

      {/* Product selection (light theme). */}
      <div className='relative overflow-hidden rounded-[28px] border border-white/40 bg-white/85 p-6 shadow-[0_40px_80px_-40px_rgba(15,23,42,0.1)] backdrop-blur'>
        {/* Background gradients. */}
        <div className='absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl opacity-50 pointer-events-none'></div>
        <div className='absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl opacity-50 pointer-events-none'></div>

        {/* Header. */}
        <div className='relative z-10 flex items-center justify-between mb-8'>
          <div className='flex items-center gap-4'>
            <div className='h-12 w-12 bg-gradient-to-br from-primary to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25'>
              <SearchNormal1 size={24} className='text-white' variant="Bold" />
            </div>
            <div>
              <h2 className='text-gray-900 font-bold text-xl tracking-tight'>Product Analysis</h2>
              <p className='text-gray-500 text-sm font-medium'>Select a product to view detailed price history</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/50 border border-gray-200/50 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-medium text-gray-600">{availableProducts.length} Products Active</span>
             </div>
             <button 
                onClick={() => refreshProducts()}
                className='group flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 hover:text-primary transition-all duration-200 shadow-sm'
              >
                <Refresh2 size={18} className="group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-sm font-medium">Refresh</span>
              </button>
          </div>
        </div>

        <hr className='border-gray-100 mb-6' />

        <GlassFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search products by name, brand, or category..."
          selects={[]}
          onRefresh={() => refreshProducts()}
          autoRefresh={false}
          onAutoRefreshChange={() => {}}
          className="mb-6"
        />

        {/* Quick filter chips. */}
        <div className='relative z-10 flex flex-wrap gap-2 items-center mb-6'>
          <span className='text-sm text-gray-500 font-medium mr-2'>Quick filters:</span>
          {['beverages', 'dairy', 'snacks', 'household', 'fruits'].map((category) => (
            <button
              key={category}
              onClick={() => setSearchTerm(category)}
              className='px-4 py-1.5 text-xs font-medium border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-primary rounded-full transition-all hover:border-primary/50 hover:shadow-md'
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className='px-4 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-full hover:bg-red-100 transition-colors'
            >
              Clear Filter
            </button>
          )}
        </div>
        
        {/* Loading state for products. */}
        {availableProducts.length === 0 ? (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto custom-scrollbar'>
            {[...Array(6)].map((_, index) => (
              <div key={index} className='p-4 border border-gray-100 rounded-xl bg-white/50 animate-pulse'>
                <div className='flex items-center gap-3'>
                  <div className='w-12 h-12 bg-gray-200 rounded-lg'></div>
                  <div className='flex-1 space-y-2'>
                    <div className='h-4 bg-gray-200 rounded w-3/4'></div>
                    <div className='h-3 bg-gray-200 rounded w-1/2'></div>
                  </div>
                </div>
              </div>

            ))}
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto pr-2'>
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => handleProductSelect(product.id)}
                className={`group relative p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
                  selectedProduct === product.id 
                    ? 'border-primary bg-blue-50 shadow-sm ring-2 ring-primary/20' 
                    : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                {/* Selection indicator. */}
                {selectedProduct === product.id && (
                  <div className='absolute -top-2 -right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-sm'>
                    <span className='text-white text-xs'>✓</span>
                  </div>
                )}
                
                <div className='flex items-center gap-3'>
                  {/* Product image. */}
                  <div className='relative flex-shrink-0'>
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={product.name}
                        className='w-12 h-12 object-cover rounded-lg'
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className='w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center'>
                        <Shop size={16} className='text-gray-400' />
                      </div>
                    )}
                    {/* Price count badge. */}
                    <div className='absolute -bottom-1 -right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-medium'>
                      {product.price_data.length}
                    </div>
                  </div>
                  
                  {/* Product information. */}
                  <div className='flex-1 min-w-0'>
                    <p className='font-semibold text-gray-800 truncate text-sm mb-1'>
                      {product.name}
                    </p>
                    <p className='text-xs text-gray-500 truncate mb-1'>
                      {product.brand_name} {product.size && `• ${product.size}`}
                    </p>
                    <div className='flex items-center justify-between'>
                      <p className='text-xs text-green-600 font-medium'>
                        {product.price_data.length} store{product.price_data.length !== 1 ? 's' : ''}
                      </p>
                      {product.price_data.length > 0 && (
                        <p className='text-xs font-semibold text-gray-800'>
                          From Rs {Math.min(...product.price_data.map(p => p.price)).toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results state. */}
        {filteredProducts.length === 0 && searchTerm && availableProducts.length > 0 && (
          <div className='text-center py-12'>
            <div className='w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
              <SearchNormal1 size={24} className='text-gray-400' />
            </div>
            <h5 className='text-lg font-semibold text-gray-700 mb-2'>No products found</h5>
            <p className='text-sm text-gray-500 mb-4'>Try adjusting your search terms or use the quick filters above</p>
            <button
              onClick={() => setSearchTerm('')}
              className='px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm'
            >
              Clear Search
            </button>
          </div>
        )}
        
        {/* Product count summary. */}
        {availableProducts.length > 0 && (
          <div className='mt-6 flex items-center justify-between text-sm text-gray-600 bg-gray-50 rounded-lg p-4'>
            <div className='flex items-center gap-4'>
              <span>
                <strong className='text-gray-800'>{filteredProducts.length}</strong> of <strong className='text-gray-800'>{availableProducts.length}</strong> products shown
              </span>
              {searchTerm && (
                <span className='flex items-center gap-1'>
                  <span>Filtered by:</span>
                  <span className='bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium'>&ldquo;{searchTerm}&rdquo;</span>
                </span>
              )}
            </div>
            {selectedProduct && (
              <div className='flex items-center gap-2 text-green-600 font-medium'>
                <span className='w-2 h-2 bg-green-500 rounded-full'></span>
                Product selected
              </div>
            )}
          </div>
        )}
      </div>

      {/* Price history loading skeleton. */}
      {loading && (
        <div className='space-y-6 animate-pulse'>
          {/* Product info skeleton. */}
          <div className='border w-full p-6 rounded-2xl bg-white shadow-sm'>
            <div className='flex items-center justify-between mb-6'>
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 bg-gray-200 rounded-lg'></div>
                <div className='space-y-2'>
                  <div className='h-5 w-32 bg-gray-200 rounded'></div>
                  <div className='h-3 w-48 bg-gray-200 rounded'></div>
                </div>
              </div>
            </div>
            <hr className='bg-gray-200 my-4' />
            <div className='flex items-start gap-4 mb-6'>
              <div className='w-16 h-16 bg-gray-200 rounded-lg'></div>
              <div className='flex-1 space-y-3'>
                <div className='h-6 w-1/3 bg-gray-200 rounded'></div>
                <div className='flex gap-3'>
                  <div className='h-4 w-20 bg-gray-200 rounded'></div>
                  <div className='h-4 w-20 bg-gray-200 rounded'></div>
                </div>
              </div>
            </div>
            <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
              {[...Array(5)].map((_, i) => (
                <div key={i} className='h-24 bg-gray-100 rounded-xl border border-gray-200'></div>
              ))}
            </div>
          </div>

          {/* Current prices skeleton. */}
          <div className='border w-full p-6 rounded-2xl bg-white shadow-sm'>
            <div className='flex items-center justify-between mb-6'>
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 bg-gray-200 rounded-lg'></div>
                <div className='space-y-2'>
                  <div className='h-5 w-32 bg-gray-200 rounded'></div>
                  <div className='h-3 w-48 bg-gray-200 rounded'></div>
                </div>
              </div>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {[...Array(2)].map((_, i) => (
                <div key={i} className='h-32 bg-gray-100 rounded-xl border border-gray-200'></div>
              ))}
            </div>
          </div>

          {/* History chart skeleton. */}
          <div className='h-96 bg-white rounded-2xl border border-gray-200 shadow-sm p-6'>
            <div className='flex items-center gap-3 mb-8'>
              <div className='h-10 w-10 bg-gray-200 rounded-xl'></div>
              <div className='space-y-2'>
                <div className='h-6 w-48 bg-gray-200 rounded'></div>
                <div className='h-4 w-32 bg-gray-200 rounded'></div>
              </div>
            </div>
            <div className='space-y-4'>
              {[...Array(3)].map((_, i) => (
                <div key={i} className='h-48 bg-gray-100 rounded-2xl'></div>
              ))}
            </div>
          </div>
        </div>
      )}

      {historyData && !loading && (
        <div className='space-y-6'>
          {/* Product info header. */}
          <div className='border text-gray-500 w-full p-6 rounded-2xl bg-white shadow-sm'>
            {/* Header. */}
            <div className='flex items-center justify-between mb-6'>
              <div className='flex items-center text-sm gap-3'>
                <div className='h-10 w-10 bg-primary rounded-lg flex items-center justify-center'>
                  <Chart size={18} className='text-white' />
                </div>
                <div>
                  <p className='text-gray-800 font-semibold text-lg'>Price Analysis</p>
                  <p className='text-gray-500 text-sm'>Historical data and current pricing</p>
                </div>
              </div>
            </div>

            <hr className='bg-gray-200 my-4' />

            {/* Product details. */}
            <div className='flex items-start gap-4 mb-6'>
              <div className='relative flex-shrink-0'>
                {historyData.product.image_url ? (
                  <img 
                    src={historyData.product.image_url} 
                    alt={historyData.product.name}
                    className='w-16 h-16 object-cover rounded-lg shadow-sm'
                  />
                ) : (
                  <div className='w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center'>
                    <Shop size={20} className='text-gray-400' />
                  </div>
                )}
              </div>
              <div className='flex-1'>
                <h4 className='text-xl font-semibold text-gray-800 mb-2'>{historyData.product.name}</h4>
                <div className='flex flex-wrap items-center gap-3 mb-3'>
                  <span className='text-sm text-gray-600'>{historyData.product.brand_name}</span>
                  {historyData.product.size && (
                    <>
                      <span className='text-gray-400'>•</span>
                      <span className='text-sm text-gray-600'>{historyData.product.size}</span>
                    </>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  <Category2 size={14} className='text-gray-400' />
                  <span className='text-sm text-gray-600 capitalize'>{historyData.product.category}</span>
                </div>
              </div>
            </div>

            {/* Price analysis statistics. */}
            {historyData.price_analysis && (
              <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
                <div className='text-center p-4 bg-blue-50 rounded-xl border border-blue-100'>
                  <TrendDown size={20} className='text-blue-600 mx-auto mb-2' />
                  <p className='text-xs text-blue-600 font-medium mb-1'>Lowest Price</p>
                  <p className='text-lg font-bold text-blue-700'>Rs {historyData.price_analysis.min_price.toFixed(2)}</p>
                </div>
                <div className='text-center p-4 bg-red-50 rounded-xl border border-red-100'>
                  <TrendUp size={20} className='text-red-600 mx-auto mb-2' />
                  <p className='text-xs text-red-600 font-medium mb-1'>Highest Price</p>
                  <p className='text-lg font-bold text-red-700'>Rs {historyData.price_analysis.max_price.toFixed(2)}</p>
                </div>
                <div className='text-center p-4 bg-green-50 rounded-xl border border-green-100'>
                  <MoneyRecive size={20} className='text-green-600 mx-auto mb-2' />
                  <p className='text-xs text-green-600 font-medium mb-1'>Average Price</p>
                  <p className='text-lg font-bold text-green-700'>Rs {historyData.price_analysis.avg_price.toFixed(2)}</p>
                </div>
                <div className='text-center p-4 bg-purple-50 rounded-xl border border-purple-100'>
                  <Chart size={20} className='text-purple-600 mx-auto mb-2' />
                  <p className='text-xs text-purple-600 font-medium mb-1'>Price Range</p>
                  <p className='text-lg font-bold text-purple-700'>Rs {historyData.price_analysis.price_range.toFixed(2)}</p>
                </div>
                <div className='text-center p-4 bg-gray-50 rounded-xl border border-gray-200'>
                  <Calendar1 size={20} className='text-gray-600 mx-auto mb-2' />
                  <p className='text-xs text-gray-600 font-medium mb-1'>Data Points</p>
                  <p className='text-lg font-bold text-gray-700'>{historyData.price_analysis.total_data_points}</p>
                </div>
              </div>
            )}
          </div>

          {/* Current prices. */}
          <div className='border text-gray-500 w-full p-6 rounded-2xl bg-white shadow-sm'>
            {/* Header. */}
            <div className='flex items-center justify-between mb-6'>
              <div className='flex items-center gap-3'>
                <div className='h-10 w-10 bg-green-500 rounded-lg flex items-center justify-center'>
                  <MoneyRecive size={18} className='text-white' />
                </div>
                <div>
                  <p className='text-gray-800 font-semibold text-lg'>Current Prices</p>
                  <p className='text-gray-500 text-sm'>Live pricing across supermarkets</p>
                </div>
              </div>
              <div className='text-xs bg-green-100 text-green-700 px-3 py-2 rounded-lg font-medium border border-green-200'>
                {historyData.current_prices.length} stores
              </div>
            </div>

            <hr className='bg-gray-200 my-4' />

            {/* Current prices grid. */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {historyData.current_prices.map((price: any, index: number) => (
                <div key={price.id} className={`relative p-4 rounded-xl border transition-all hover:shadow-md ${
                  index === 0 
                    ? 'border-green-500 bg-green-50 ring-2 ring-green-200/50' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                  {/* Best price badge. */}
                  {index === 0 && (
                    <div className='absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium shadow-sm'>
                      Best Price
                    </div>
                  )}
                  
                  <div className='flex items-center justify-between mb-3'>
                    <div className='flex items-center gap-3'>
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        index === 0 ? 'bg-green-500' : 'bg-gray-100'
                      }`}>
                        <Building4 size={14} className={index === 0 ? 'text-white' : 'text-gray-500'} />
                      </div>
                      <span className='font-semibold text-gray-800 capitalize'>{price.supermarketId}</span>
                    </div>
                  </div>
                  
                  <div className={`text-2xl font-bold mb-2 ${
                    index === 0 ? 'text-green-700' : 'text-gray-800'
                  }`}>
                    Rs {price.price.toFixed(2)}
                  </div>
                  
                  <div className='flex items-center gap-2 text-xs text-gray-500'>
                    <Clock size={12} />
                    <span>Updated: {new Date(price.priceDate || price.lastUpdated).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price intelligence chart. */}
          {historyData && historyData.price_history && Object.keys(historyData.price_history).length > 0 && (
            <PriceIntelligenceChart 
              priceHistory={historyData.price_history}
              currentPrices={historyData.current_prices}
              productName={historyData.product.name}
              className="mb-6"
            />
          )}

          {/* Chart diagnostics for VChart debugging. */}
          <TestChart />

          {/* Price intelligence summary. */}
          {historyData && historyData.price_history && Object.keys(historyData.price_history).length > 0 && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                    <Chart size={20} className="text-white" />
                  </div>
                  <div>
                    <h5 className="text-lg font-bold text-indigo-900"> Quick Price Summary</h5>
                    <p className="text-indigo-700 text-sm">Key metrics at a glance</p>
                  </div>
                </div>
                <span className="text-xs text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full font-medium">
                  {Object.keys(historyData.price_history).length} stores tracked
                </span>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(historyData.price_history).map(([supermarket, data]: [string, any]) => {
                  const latestRecord = data.monthly_records?.[data.monthly_records.length - 1]?.monthly_stats;
                  
                  return (
                    <div key={supermarket} className="bg-white rounded-lg p-4 border border-indigo-200">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <Shop size={16} className="text-gray-600" />
                          <h6 className="font-bold text-gray-900 capitalize">{supermarket}</h6>
                        </div>
                        {latestRecord && (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            latestRecord.trend_direction === 'upward' ? 'bg-red-100 text-red-600' :
                            latestRecord.trend_direction === 'downward' ? 'bg-green-100 text-green-600' :
                            'bg-blue-100 text-blue-600'
                          }`}>
                            {latestRecord.trend_direction === 'upward' ? ' Rising' :
                             latestRecord.trend_direction === 'downward' ? ' Falling' : '➡️ Stable'}
                          </span>
                        )}
                      </div>
                      
                      {latestRecord ? (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Current Avg:</span>
                            <span className="font-bold text-gray-900">Rs {latestRecord.avg_price?.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Price Range:</span>
                            <span className="font-medium text-purple-600">Rs {latestRecord.price_range?.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Stability Score:</span>
                            <span className={`font-medium ${
                              latestRecord.price_stability_score >= 8 ? 'text-green-600' :
                              latestRecord.price_stability_score >= 6 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {latestRecord.price_stability_score?.toFixed(1)}/10
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Best Buy Day:</span>
                            <span className="font-medium text-blue-600 text-xs">
                              {latestRecord.best_buy_day ? new Date(latestRecord.best_buy_day).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">No detailed stats available</p>
                      )}
                      
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{data.total_records || 0} data points</span>
                          <span>{data.monthly_records?.length || 0} months</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Quick action recommendations. */}
              <div className="mt-4 p-3 bg-white rounded-lg border border-indigo-200">
                <h6 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <span></span> Smart Shopping Recommendations
                </h6>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600"> Best Value:</span>
                    <p className="font-medium text-green-600 capitalize">
                      {historyData.current_prices?.[0]?.supermarketId || 'Check current prices'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600"> Price Trend:</span>
                    <p className="font-medium text-blue-600">
                      {Object.values(historyData.price_history).some((data: any) => 
                        data.monthly_records?.[data.monthly_records.length - 1]?.monthly_stats?.trend_direction === 'upward'
                      ) ? 'Prices Rising' : 'Market Stable'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-600">⏰ Best Time:</span>
                    <p className="font-medium text-purple-600">Month-end periods</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Historical trends by supermarket. */}
          <div className='bg-gradient-to-br from-white to-gray-50 border-0 shadow-xl rounded-2xl p-8'>
            <div className='flex items-center gap-3 mb-8'>
              <div className='h-10 w-10 bg-gradient-to-br from-primary to-purple-600 rounded-xl flex items-center justify-center'>
                <Shop size={20} className="text-white" />
              </div>
              <div>
                <h5 className='text-2xl font-bold text-gray-900'>Market Intelligence</h5>
                <p className='text-gray-600 text-sm'>Monthly analytics and performance insights</p>
              </div>
            </div>
            
            {Object.keys(historyData.price_history).length > 0 ? (
              <div className='grid gap-8'>
                {Object.entries(historyData.price_history).map(([supermarket, data]: [string, any]) => (
                  <div key={supermarket} className='bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden'>
                    {/* Supermarket header. */}
                    <div className='bg-gradient-to-r from-gray-900 to-gray-700 p-6'>
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3'>
                          <div className='h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center'>
                            <Shop size={24} className="text-white" />
                          </div>
                          <div>
                            <h6 className='text-xl font-bold text-white capitalize'>{supermarket}</h6>
                            <p className='text-gray-300 text-sm'>{data.total_records} data points tracked</p>
                          </div>
                        </div>
                        <div className='text-right'>
                          <div className='text-white/80 text-xs uppercase tracking-wide'>Market Leader</div>
                          <div className='text-2xl font-bold text-white'>#{Object.keys(historyData.price_history).indexOf(supermarket) + 1}</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Monthly performance cards. */}
                    {data.monthly_records && data.monthly_records.length > 0 && (
                      <div className='p-6'>
                        <div className='flex items-center gap-2 mb-6'>
                          <div className='h-2 w-2 bg-blue-500 rounded-full'></div>
                          <h4 className='text-lg font-bold text-gray-900'>Monthly Performance Insights</h4>
                        </div>
                        
                        <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6'>
                          {data.monthly_records.map((record: any, idx: number) => (
                            <div key={idx} className='group hover:shadow-2xl transition-all duration-300 bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 border border-gray-100 hover:border-blue-200'>
                              {/* Month header. */}
                              <div className='flex justify-between items-center mb-6'>
                                <div>
                                  <h4 className='text-xl font-bold text-gray-900'>{record.month}</h4>
                                  <p className='text-gray-500 text-sm'>Performance Overview</p>
                                </div>
                                <div className='bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-3 py-2 rounded-full font-semibold'>
                                  {record.monthly_stats?.days_with_data || 0} Days
                                </div>
                              </div>
                              
                              {record.monthly_stats && (
                                <div className='space-y-4'>
                                  {/* Key metrics grid. */}
                                  <div className='grid grid-cols-2 gap-4'>
                                    <div className='bg-white rounded-xl p-4 border border-gray-100'>
                                      <div className='text-xs text-gray-500 uppercase tracking-wide mb-1'>Avg Price</div>
                                      <div className='text-2xl font-bold text-gray-900'>Rs {record.monthly_stats.avg_price?.toFixed(2)}</div>
                                    </div>
                                    <div className='bg-white rounded-xl p-4 border border-gray-100'>
                                      <div className='text-xs text-gray-500 uppercase tracking-wide mb-1'>Range</div>
                                      <div className='text-2xl font-bold text-gray-900'>Rs {record.monthly_stats.price_range?.toFixed(2)}</div>
                                    </div>
                                  </div>
                                  
                                  {/* Volatility and trend. */}
                                  <div className='bg-white rounded-xl p-4 border border-gray-100'>
                                    <div className='flex justify-between items-center mb-2'>
                                      <span className='text-xs text-gray-500 uppercase tracking-wide'>Market Volatility</span>
                                      <span className='text-lg font-bold text-orange-600'>{record.monthly_stats.price_volatility?.toFixed(1)}%</span>
                                    </div>
                                    <div className='w-full bg-gray-200 rounded-full h-2'>
                                      <div className='bg-gradient-to-r from-orange-400 to-red-500 h-2 rounded-full transition-all duration-500' 
                                           style={{width: `${Math.min(record.monthly_stats.price_volatility, 100)}%`}}></div>
                                    </div>
                                  </div>
                                  
                                  {/* Trend direction. */}
                                  <div className='bg-white rounded-xl p-4 border border-gray-100'>
                                    <div className='flex justify-between items-center'>
                                      <span className='text-xs text-gray-500 uppercase tracking-wide'>Price Trend</span>
                                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${
                                        record.monthly_stats.trend_direction === 'up' 
                                          ? 'bg-red-100 text-red-700' 
                                          : record.monthly_stats.trend_direction === 'down' 
                                          ? 'bg-green-100 text-green-700' 
                                          : 'bg-gray-100 text-gray-700'
                                      }`}>
                                        {record.monthly_stats.trend_direction === 'up' ? '' : 
                                         record.monthly_stats.trend_direction === 'down' ? '' : '➡️'}
                                        <span className='capitalize'>{record.monthly_stats.trend_direction}</span>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Best buy day. */}
                                  <div className='bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200'>
                                    <div className='flex items-center gap-2 mb-1'>
                                      <span className='text-green-600'></span>
                                      <span className='text-xs text-green-700 uppercase tracking-wide font-semibold'>Best Buy Day</span>
                                    </div>
                                    <div className='text-green-900 font-bold'>
                                      {record.monthly_stats.best_buy_day ? 
                                        new Date(record.monthly_stats.best_buy_day).toLocaleDateString('en-US', {
                                          weekday: 'short',
                                          month: 'short', 
                                          day: 'numeric'
                                        }) : 'Not Available'}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Recent price activity. */}
                    <div className='px-6 pb-6'>
                      <div className='flex items-center gap-2 mb-4'>
                        <div className='h-2 w-2 bg-purple-500 rounded-full'></div>
                        <h4 className='text-lg font-bold text-gray-900'>Recent Price Activity</h4>
                        <span className='text-sm text-gray-500'>Last 10 updates</span>
                      </div>
                      
                      <div className='bg-white rounded-2xl p-4 border border-gray-100'>
                        <div className='grid grid-cols-2 md:grid-cols-5 gap-3'>
                          {data.daily_prices.slice(-10).map((entry: any, idx: number) => (
                            <div key={idx} className='text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl hover:shadow-md transition-all duration-200 group'>
                              <div className='text-xs text-gray-500 mb-1 group-hover:text-gray-700'>
                                {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                              <div className='text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors'>
                                Rs {entry.price.toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                <div className="h-16 w-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar1 size={24} className="text-gray-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No Historical Data Yet</h4>
                <p className="text-gray-500 max-w-md mx-auto">
                  We haven't collected enough historical price points for this product yet. 
                  Check back later as we gather more data.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedProduct && !loading && (
        <div className='text-center py-12'>
          <div className='h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
            <Clock size={24} className='text-gray-400' />
          </div>
          <p className='text-gray-500 mb-2'>Select a product to view price history</p>
          <p className='text-sm text-gray-400'>Choose from the products above to analyze pricing trends.</p>
        </div>
      )}
    </div>
  );
};

// Enhanced overview component.
const EnhancedOverviewView: React.FC = () => {
  const [products, setProducts] = useState<EnhancedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [supermarketFilter, setSupermarketFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<any>(null);

  const selects = useMemo(() => [
    {
      label: 'Category',
      value: categoryFilter,
      options: [
        { label: 'All Categories', value: '' },
        ...(stats ? Object.keys(stats.category_stats).map(c => ({
          label: c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: c
        })) : [])
      ],
      onChange: setCategoryFilter
    },
    {
      label: 'Supermarket',
      value: supermarketFilter,
      options: [
        { label: 'All Supermarkets', value: '' },
        ...(stats ? Object.keys(stats.supermarket_stats).map(s => ({
          label: s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: s
        })) : [])
      ],
      onChange: setSupermarketFilter
    }
  ], [stats, categoryFilter, supermarketFilter]);

  useEffect(() => {
    // Debounce search to reduce API calls.
    const timeoutId = setTimeout(() => {
      fetchEnhancedData();
    }, searchTerm ? 500 : 0); // 500ms delay for search, immediate for filters.

    return () => clearTimeout(timeoutId);
  }, [categoryFilter, supermarketFilter, currentPage, searchTerm]);

  const fetchEnhancedData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: '50' // Reduced from 1000 to 50 for load testing.
      });
      
      if (categoryFilter) params.append('category', categoryFilter);
      if (supermarketFilter) params.append('supermarket', supermarketFilter);

      const response = await fetch(`${API_BASE_URL}/api/prices/overview/enhanced?${params}`);
      const data = await response.json();
      
      console.log('[DEBUG] Enhanced API Response:', {
        success: data.success,
        productsCount: data.products?.length,
        total: data.pagination?.total
      });

      if (data.success) {
        if (Array.isArray(data.products)) {
          setProducts(data.products);
          setPagination(data.pagination);
          setStats({
            supermarket_stats: data.supermarket_stats,
            category_stats: data.category_stats,
            brand_stats: data.brand_stats
          });
          
          // Log cache information for debugging.
          if (data.cache_info) {
            console.log(`[${data.cache_info.cached ? 'CACHED' : 'FRESH'}] Data loaded from ${data.cache_info.cache_key}`);
          }
        } else {
          console.error('[ERROR] data.products is not an array:', data.products);
        }
      }
    } catch (error) {
      console.error('Failed to fetch enhanced data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      product.name.toLowerCase().includes(searchLower) ||
      product.brand_name.toLowerCase().includes(searchLower) ||
      product.category.toLowerCase().includes(searchLower);
    
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className='text-center py-12'>
        <div className='animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4'></div>
        <p className='text-gray-500'>Loading product overview...</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Search and filters section. */}
      <div className='space-y-4'>
        <div>
          <h3 className='text-lg font-semibold text-gray-900 mb-2'>Browse Products</h3>
          <p className='text-gray-600'>
            Search and filter products by supermarket, category, and brand with detailed pricing information.
          </p>
        </div>

        <GlassFilterBar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search products..."
          selects={selects}
          onRefresh={fetchEnhancedData}
          autoRefresh={false}
          onAutoRefreshChange={() => {}}
        />
      </div>

      {/* Enhanced product grid. */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {filteredProducts.map((product) => {
          // Sort prices to identify the best deal.
          const sortedPrices = [...product.price_data].sort((a, b) => a.price - b.price);
          const bestPrice = sortedPrices[0];
          const worstPrice = sortedPrices[sortedPrices.length - 1];
          const priceRange = worstPrice.price - bestPrice.price;
          
          // Generate mock trend data for demo; replace with API data in production.
          const trendData = Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            price: bestPrice.price + (Math.random() - 0.5) * 20
          }));

          return (
            <div key={product.id} className='bg-white border rounded-xl p-5 hover:shadow-lg transition-all duration-300 hover:border-blue-200'>
              <div className='flex items-start gap-3 mb-4'>
                {product.image_url && (
                  <img 
                    src={product.image_url} 
                    alt={product.name}
                    className='w-16 h-16 object-cover rounded-xl flex-shrink-0 border'
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <div className='flex-1 min-w-0'>
                  <h6 className='font-semibold text-gray-900 mb-1 truncate'>{product.name}</h6>
                  <p className='text-sm text-gray-600 mb-1'>{product.brand_name}</p>
                  <p className='text-xs text-blue-600 capitalize font-medium bg-blue-50 px-2 py-1 rounded-full inline-block'>
                    {product.category} • {product.size}
                  </p>
                </div>
              </div>

              {/* Price trend visualization. */}
              <div className='mb-4'>
                <div className='flex items-center justify-between mb-2'>
                  <span className='text-xs font-medium text-gray-500'>7-Day Price Trend</span>
                  <span className='text-xs text-green-600 font-medium'>
                    {priceRange > 0 ? `Save Rs ${priceRange.toFixed(2)}` : 'Same price'}
                  </span>
                </div>
                <MiniPriceTrend 
                  data={trendData}
                  color={bestPrice.supermarket === 'keells' ? '#3b82f6' : 
                         bestPrice.supermarket === 'cargills' ? '#10b981' : '#f59e0b'}
                  height={50}
                  className="w-full bg-gray-50 rounded-lg p-2"
                />
              </div>

              {/* Price comparison. */}
              <div className='space-y-2'>
                <div className='flex items-center justify-between mb-2'>
                  <span className='text-sm font-medium text-gray-700'>Price Comparison</span>
                  <span className='text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full'>
                    {product.price_data.length} stores
                  </span>
                </div>
                
                {product.price_data.map((priceInfo, index) => {
                  const isBest = priceInfo.price === bestPrice.price;
                  const savingsAmount = priceInfo.price - bestPrice.price;
                  
                  return (
                    <div key={index} className={`flex justify-between items-center py-2 px-3 rounded-lg transition-all ${
                      isBest ? 'bg-green-50 border border-green-200' : 'bg-gray-50 hover:bg-gray-100'
                    }`}>
                      <div className='flex items-center gap-2'>
                        <div 
                          className='w-3 h-3 rounded-full'
                          style={{ 
                            backgroundColor: 
                              priceInfo.supermarket === 'keells' ? '#3b82f6' :
                              priceInfo.supermarket === 'cargills' ? '#10b981' : '#f59e0b'
                          }}
                        ></div>
                        <span className='text-sm capitalize font-medium text-gray-700'>
                          {priceInfo.supermarket}
                        </span>
                        {isBest && (
                          <span className='text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium'>
                            Best
                          </span>
                        )}
                      </div>
                      
                      <div className='text-right'>
                        <div className='text-sm font-bold text-gray-900'>
                          Rs {priceInfo.price.toFixed(2)}
                        </div>
                        {!isBest && savingsAmount > 0 && (
                          <div className='text-xs text-red-600'>
                            +Rs {savingsAmount.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick action button. */}
              <button className='w-full mt-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium'>
                View Price History
              </button>
            </div>
          );
        })}
      </div>

      {/* Pagination. */}
      {pagination && pagination.pages > 1 && (
        <div className='flex justify-center items-center gap-2 mt-6'>
          <button
            onClick={() => setCurrentPage(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className='px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50'
          >
            Previous
          </button>
          
          <span className='px-4 py-2 text-sm text-gray-600'>
            Page {pagination.page} of {pagination.pages}
          </span>
          
          <button
            onClick={() => setCurrentPage(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages}
            className='px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50'
          >
            Next
          </button>
        </div>
      )}

      {filteredProducts.length === 0 && !loading && (
        <div className='text-center py-12'>
          <div className='h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
            <SearchNormal1 size={24} className='text-gray-400' />
          </div>
          <p className='text-gray-500 mb-2'>No products found</p>
          <p className='text-sm text-gray-400 mb-4'>Try adjusting your search or filters.</p>
          <button
            onClick={fetchEnhancedData}
            className='px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm'
          >
            Retry Loading
          </button>
        </div>
      )}
    </div>
  );
};

// Price comparison component.
const PriceComparisonView: React.FC = () => {
  const [comparisons, setComparisons] = useState<ProductComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchComparisons();
  }, []);

  const fetchComparisons = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prices/current`);
      const data = await response.json();
      
      if (data.success) {
        setComparisons(data.comparisons || []);
      } else {
        console.error('Failed to fetch comparisons:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch comparisons:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredComparisons = comparisons.filter(comp =>
    comp.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className='text-center py-12'>
        <div className='animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4'></div>
        <p className='text-gray-500'>Loading comparisons...</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold text-gray-900 mb-2'>Price Comparisons</h3>
          <p className='text-gray-600'>
            Compare prices across different supermarkets to find the best deals.
          </p>
        </div>
        <button 
          onClick={fetchComparisons}
          className='px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2'
        >
          <Refresh2 size={16} />
          Refresh
        </button>
      </div>

      <GlassFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search products..."
        selects={[]}
        onRefresh={fetchComparisons}
        autoRefresh={false}
        onAutoRefreshChange={() => {}}
      />

      {/* Comparisons. */}
      {filteredComparisons.length > 0 ? (
        <div className='space-y-4'>
          {filteredComparisons.map((comparison) => (
            <div key={comparison.product_id} className='border rounded-lg p-6'>
              {/* Product header. */}
              <div className='flex items-center justify-between mb-4'>
                <div>
                  <h4 className='text-lg font-semibold text-gray-900'>
                    {comparison.product_name}
                  </h4>
                  <p className='text-sm text-gray-500'>
                    Best price at {comparison.cheapest_store.charAt(0).toUpperCase() + comparison.cheapest_store.slice(1)}
                  </p>
                </div>
                <div className='text-right'>
                  <div className='text-sm text-gray-500'>Price Range</div>
                  <div className='text-lg font-bold text-gray-900'>
                    Rs {comparison.price_range.min.toFixed(2)} - Rs {comparison.price_range.max.toFixed(2)}
                  </div>
                  <div className='text-sm text-red-600'>
                    Rs {comparison.price_range.difference.toFixed(2)} difference
                  </div>
                </div>
              </div>

              {/* Price grid. */}
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                {comparison.current_prices.map((priceInfo, index) => (
                  <div 
                    key={priceInfo.id} 
                    className={`p-4 rounded-lg border-2 ${
                      index === 0 ? 'border-green-500 bg-green-50' : 'border-gray-200'
                    }`}
                  >
                    <div className='flex items-center justify-between mb-2'>
                      <div className='flex items-center gap-2'>
                        <Shop size={16} className='text-gray-500' />
                        <span className='font-medium capitalize'>
                          {priceInfo.supermarketId}
                        </span>
                      </div>
                      {index === 0 && (
                        <span className='text-xs bg-green-500 text-white px-2 py-1 rounded-full'>
                          Best Price
                        </span>
                      )}
                    </div>
                    <div className='text-2xl font-bold text-gray-900 mb-1'>
                      Rs {priceInfo.price.toFixed(2)}
                    </div>
                    <div className='text-xs text-gray-500'>
                      Updated: {new Date(priceInfo.lastUpdated).toLocaleDateString()}
                    </div>
                    {index > 0 && (
                      <div className='text-sm text-red-600 mt-2'>
                        +Rs {(priceInfo.price - comparison.current_prices[0].price).toFixed(2)} more
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className='text-center py-12'>
          <div className='h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
            <Chart size={24} className='text-gray-400' />
          </div>
          <p className='text-gray-500 mb-2'>No price comparisons available</p>
          <p className='text-sm text-gray-400'>Upload some price data to see comparisons here.</p>
        </div>
      )}
    </div>
  );
};

const PricingDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [overviewStats, setOverviewStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [selectedSupermarket, setSelectedSupermarket] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [supermarkets, setSupermarkets] = useState<SupermarketOption[]>([]);
  
  // State for enhanced upload functionality.
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    processed: number;
    current: string;
    details: string[];
  } | null>(null);

  const tabs = [
    { 
      key: 'overview', 
      label: 'Overview', 
      description: 'Dashboard summary', 
      icon: Chart 
    },
    { 
      key: 'enhanced', 
      label: 'Enhanced View', 
      description: 'Browse products', 
      icon: Category2 
    },
    { 
      key: 'history', 
      label: 'Price History', 
      description: 'Historical data', 
      icon: Clock 
    },
    { 
      key: 'compare', 
      label: 'Comparison', 
      description: 'Compare prices', 
      icon: TrendUp 
    },
  ];
  
  // Toast notifications.
  const { toasts, addToast, removeToast } = useToast();

  const formatNumber = (value?: number | null) => new Intl.NumberFormat('en-US').format(value ?? 0);

  const heroStats = useMemo(() => (
    [
      {
        label: 'Current Prices',
        subtext: 'Live price points across catalog',
        value: loading ? '...' : formatNumber(stats?.total_current_prices),
        color: 'blue',
        icon: MoneyRecive,
      },
      {
        label: 'History Records',
        subtext: 'Historical snapshots stored',
        value: loading ? '...' : formatNumber(stats?.total_history_documents),
        color: 'emerald',
        icon: Calendar1,
      },
      {
        label: 'Products Tracked',
        subtext: 'Unique products with pricing',
        value: loading ? '...' : formatNumber(stats?.products_with_prices),
        color: 'indigo',
        icon: Chart,
      },
      {
        label: 'Active Stores',
        subtext: 'Supermarkets contributing data',
        value: loading ? '...' : formatNumber(stats?.supermarkets_with_data),
        color: 'amber',
        icon: Shop,
      },
    ]
  ), [loading, stats]);

  // Generate date options for the horizontal scroller.
  const generateDateOptions = () => {
    const dates = [];
    const today = new Date();
    
    // Generate dates from 30 days ago to today.
    for (let i = 30; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dates.push(date);
    }
    
    return dates;
  };

  const dateOptions = generateDateOptions();

  // Fetch initial data.
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverviewData();
    } else {
      fetchStats();
    }
    fetchSupermarkets();
  }, [activeTab]);

  const handleRefreshData = async () => {
    setLoading(true);
    try {
      // Always fetch basic stats.
      await fetchStats();
      
      // Refresh data based on the active tab.
      if (activeTab === 'overview') {
        await fetchOverviewData();
      }
      
      // Show a success toast.
      addToast({
        type: 'success',
        title: 'Data Refreshed',
        message: 'All price data has been updated successfully.'
      });
    } catch (error) {
      console.error('Failed to refresh data:', error);
      addToast({
        type: 'error',
        title: 'Refresh Failed',
        message: 'Failed to refresh data. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prices/stats`);
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOverviewData = async () => {
    try {
      setOverviewLoading(true);
      console.log('[OVERVIEW] Starting to fetch overview data...');
      
      const response = await fetch(`${API_BASE_URL}/api/prices/overview/enhanced?per_page=1000`);
      const data = await response.json();
      
      console.log('[OVERVIEW] API Response:', data);
      
      if (data.success) {
        // Store overview data separately to prevent conflicts.
        const overviewData = {
          supermarket_stats: data.supermarket_stats,
          category_stats: data.category_stats,
          brand_stats: data.brand_stats
        };
        
        console.log('[OVERVIEW] Setting overview stats:', overviewData);
        setOverviewStats(overviewData);
        
        // Update the main stats for the top cards.
        const totalProducts = Object.values(data.supermarket_stats || {}).reduce((sum: number, count: any) => sum + count, 0);
        const totalSupermarkets = Object.keys(data.supermarket_stats || {}).length;
        
        setStats(prev => ({
          ...prev,
          total_current_prices: totalProducts,
          total_history_documents: totalProducts,
          products_with_prices: totalProducts,
          supermarkets_with_data: totalSupermarkets,
          active_supermarkets: Object.keys(data.supermarket_stats || {}),
          supermarket_stats: data.supermarket_stats,
          category_stats: data.category_stats,
          brand_stats: data.brand_stats
        }) as PriceStats);
        
        // Log cache information for debugging.
        if (data.cache_info) {
          console.log(`[OVERVIEW] [${data.cache_info.cached ? 'CACHED' : 'FRESH'}] Data loaded`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch overview data:', error);
    } finally {
      setOverviewLoading(false);
      setLoading(false);
      console.log('[OVERVIEW] Finished loading');
    }
  };

  const fetchSupermarkets = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prices/supermarkets`);
      const data = await response.json();
      if (data.success) {
        setSupermarkets(data.supermarkets);
      }
    } catch (error) {
      console.error('Failed to fetch supermarkets:', error);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedSupermarket || !selectedFile) {
      addToast({
        type: 'error',
        title: 'Upload Error',
        message: 'Please select both a supermarket and a JSON file.'
      });
      return;
    }

    setUploading(true);
    setUploadProgress({
      total: 0,
      processed: 0,
      current: 'Preparing upload...',
      details: []
    });

    try {
      // Read and parse the file.
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(selectedFile);
      });

      const priceData = JSON.parse(fileContent);
      
      // Handle both new (metadata) and legacy (direct array) formats.
      let productsArray;
      if (Array.isArray(priceData)) {
        // Legacy format: direct array.
        productsArray = priceData;
      } else if (priceData.results && Array.isArray(priceData.results)) {
        // New format: metadata with products in the results field.
        productsArray = priceData.results;
      } else {
        throw new Error('Invalid JSON format: Expected array or object with results field');
      }
      
      setUploadProgress({
        total: productsArray.length,
        processed: 0,
        current: `Found ${productsArray.length} products to upload`,
        details: [
          ` File parsed successfully`, 
          ` Target: ${selectedSupermarket}`, 
          ` Price Date: ${selectedDate.toLocaleDateString('en-US', { 
            weekday: 'short', 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })}`,
          ` Upload Time: ${new Date().toLocaleTimeString()}`
        ]
      });

      // Perform an enhanced upload with date and progress tracking.
      const response = await fetch(`${API_BASE_URL}/api/prices/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supermarket_id: selectedSupermarket,
          price_date: selectedDate.toISOString().split('T')[0], // Send the selected date to the backend.
          price_data: productsArray.map((item: any) => ({
            ...item,
            price_date: selectedDate.toISOString().split('T')[0], // Add the date to each item.
            upload_date: selectedDate.toISOString().split('T')[0]
          }))
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setUploadProgress({
          total: productsArray.length,
          processed: productsArray.length,
          current: 'Upload completed successfully!',
          details: [
            `✅ Processed: ${result.stats.total_processed} products`,
            ` Price records created: ${result.stats.total_processed}`,
            ` Success rate: 100%`,
            ` Database updated`
          ]
        });

        // Success notification.
        addToast({
          type: 'success',
          title: 'Upload Successful!',
          message: `Successfully uploaded ${result.stats.total_processed} price records for ${selectedSupermarket} with date ${selectedDate.toLocaleDateString()}.`
        });

        // Reset the form after a short delay.
        setTimeout(() => {
          setSelectedFile(null);
          setSelectedSupermarket('');
          setUploadProgress(null);
          fetchStats(); // Refresh statistics.
        }, 3000);

      } else {
        setUploadProgress({
          total: productsArray.length,
          processed: 0,
          current: 'Upload failed',
          details: [`❌ Error: ${result.error}`]
        });

        addToast({
          type: 'error',
          title: 'Upload Failed',
          message: result.error || 'An unexpected error occurred during upload.'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setUploadProgress({
        total: 0,
        processed: 0,
        current: 'Upload failed',
        details: [`❌ Error: ${errorMessage}`]
      });

      addToast({
        type: 'error',
        title: 'Upload Failed',
        message: `Failed to process file: ${errorMessage}`
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <PageNavbar>
        <PageNavbarLeftContent>
          <div className='flex items-center gap-3'>
            <div className='h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center'>
              <MoneyRecive size={20} className='text-white' />
            </div>
            <div>
              <p className='text-sm font-semibold text-gray-800'>Price Management</p>
              <p className='text-xs font-medium text-gray-500'>Compare & Upload Prices</p>
            </div>
          </div>
        </PageNavbarLeftContent>

        <PageNavbarRightContent>
          <PageNavbarIconButton>
            <SearchNormal1 size={16} />
          </PageNavbarIconButton>
          <PageNavbarIconButton>
            <DirectNotification size={16} />
          </PageNavbarIconButton>
          <PageNavbarIconButton onClick={handleRefreshData} disabled={loading}>
            <Refresh2 size={16} className={loading ? 'animate-spin' : ''} />
          </PageNavbarIconButton>
        </PageNavbarRightContent>
      </PageNavbar>

      <PageContent>
        {/* Stats and overview. */}
        <div className='space-y-6 mb-8'>
        <PageHero
          category="Pricing Control Center"
          title="Stay ahead with live supermarket pricing intelligence"
          description="Track your price coverage, surface anomalies faster, and synchronize uploads without leaving this dashboard."
          stats={heroStats}
          badges={
            <>
              <span className='inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700'>
                <Shop size={16} className='text-indigo-500' />
                {loading ? 'Syncing markets...' : `${formatNumber(stats?.supermarkets_with_data)} supermarkets active`}
              </span>
              <span className='inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700'>
                <Chart size={16} className='text-indigo-500' />
                {loading ? 'Loading coverage...' : `${formatNumber(stats?.products_with_prices)} products tracked`}
              </span>
              <span className='inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-700'>
                <Clock size={16} className='text-indigo-500' />
                {loading ? 'Updating datasets...' : 'Metrics refreshed'}
              </span>
            </>
          }
        >
          <div className='flex flex-col items-start gap-3 lg:items-end'>
            <button
              onClick={handleRefreshData}
              disabled={loading}
              className='inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60'
            >
              <Refresh2 size={16} className={loading ? 'animate-spin text-white/60' : 'text-white'} />
              {loading ? 'Refreshing...' : 'Refresh data'}
            </button>
            <p className='text-xs text-slate-500'>Monitor supermarket imports and upload pricing snapshots instantly.</p>
          </div>
        </PageHero>
        </div>

        {/* Main content tabs. */}
        <div className='bg-white rounded-lg border'>
          <div className='border-b px-6 py-4'>
            <GlassSubTabs
              tabs={tabs}
              activeKey={activeTab}
              onChange={setActiveTab}
              columnsClassName="grid-cols-4"
            />
          </div>

          <div className='p-6'>
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                <div className='space-y-6'>
                  <div>
                    <h3 className='text-lg font-semibold text-gray-900 mb-2'>Product Pricing Overview</h3>
                    <p className='text-gray-600'>
                      Comprehensive view of all product data, pricing statistics, and distribution analytics.
                    </p>
                  </div>

                  {/* Stats overview with interactive charts. */}
                  {overviewStats && (overviewStats.supermarket_stats || overviewStats.category_stats || overviewStats.brand_stats) && (
                    <div className='space-y-6'>
                      {/* Statistics cards. */}
                      <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white'>
                          <div className='flex items-center text-sm gap-2 mb-4'>
                            <Shop size={18} className='text-blue-600' />
                            <p className='text-gray-800 font-medium'>Supermarkets</p>
                          </div>
                          <hr className='bg-gray-300 my-3' />
                          <div className='space-y-3 max-h-64 overflow-y-auto'>
                            {Object.entries(overviewStats.supermarket_stats || {}).map(([name, count]: [string, any]) => (
                              <div key={name} className='flex justify-between items-center'>
                                <span className='capitalize text-sm text-gray-700'>{name}</span>
                                <span className='text-sm font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded-full'>
                                  {count} products
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white'>
                          <div className='flex items-center text-sm gap-2 mb-4'>
                            <Category2 size={18} className='text-green-600' />
                            <p className='text-gray-800 font-medium'>Categories</p>
                          </div>
                          <hr className='bg-gray-300 my-3' />
                          <div className='space-y-3 max-h-64 overflow-y-auto'>
                            {Object.entries(overviewStats.category_stats || {}).map(([name, data]: [string, any]) => (
                              <div key={name} className='flex justify-between items-center'>
                                <span className='capitalize text-sm text-gray-700'>{name}</span>
                                <span className='text-sm font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full'>
                                  {data.count} products
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white'>
                          <div className='flex items-center text-sm gap-2 mb-4'>
                            <Building4 size={18} className='text-purple-600' />
                            <p className='text-gray-800 font-medium'>Top Brands</p>
                          </div>
                          <hr className='bg-gray-300 my-3' />
                          <div className='space-y-3 max-h-64 overflow-y-auto'>
                            {Object.entries(overviewStats.brand_stats || {})
                              .sort(([,a]: [string, any], [,b]: [string, any]) => b.count - a.count)
                              .map(([name, data]: [string, any]) => (
                              <div key={name} className='flex justify-between items-center'>
                                <span className='text-sm text-gray-700'>{name}</span>
                                <span className='text-sm font-medium bg-purple-100 text-purple-700 px-2 py-1 rounded-full'>
                                  {data.count} products
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Interactive distribution charts. */}
                      <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6'>
                        {/* Supermarket distribution chart. */}
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white'>
                          <div className='flex items-center text-sm gap-2 mb-4'>
                            <Chart size={20} className='text-blue-600' />
                            <p className='text-gray-800 font-medium'>Product Distribution by Supermarket</p>
                          </div>
                          <hr className='bg-gray-300 my-3' />
                          <PriceStatsChart
                            data={Object.entries(overviewStats.supermarket_stats || {}).map(([name, count]) => ({
                              category: name.charAt(0).toUpperCase() + name.slice(1),
                              count: count as number,
                              avgPrice: 0
                            }))}
                            type="supermarket"
                          />
                        </div>

                        {/* Category distribution chart. */}
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white'>
                          <div className='flex items-center text-sm gap-2 mb-4'>
                            <Category2 size={20} className='text-green-600' />
                            <p className='text-gray-800 font-medium'>Product Distribution by Category</p>
                          </div>
                          <hr className='bg-gray-300 my-3' />
                          <PriceStatsChart
                            data={Object.entries(overviewStats.category_stats || {}).map(([name, data]: [string, any]) => ({
                              category: name.charAt(0).toUpperCase() + name.slice(1),
                              count: data.count,
                              avgPrice: 0
                            }))}
                            type="category"
                          />
                        </div>

                        {/* Top brands chart. */}
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white'>
                          <div className='flex items-center text-sm gap-2 mb-4'>
                            <Building4 size={20} className='text-purple-600' />
                            <p className='text-gray-800 font-medium'>Top Brands Distribution</p>
                          </div>
                          <hr className='bg-gray-300 my-4' />
                          <div className='h-80'>
                            <PriceStatsChart
                              data={Object.entries(overviewStats.brand_stats || {})
                                .sort(([,a]: [string, any], [,b]: [string, any]) => b.count - a.count)
                                .slice(0, 8)
                                .map(([name, data]: [string, any]) => ({
                                  category: name,
                                  count: data.count,
                                  avgPrice: 0
                                }))}
                              type="brands"
                              chartType="pie"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Quick stats summary. */}
                      <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white text-center'>
                          <div className='text-2xl font-bold text-blue-600'>
                            {Object.keys(overviewStats.supermarket_stats || {}).length}
                          </div>
                          <div className='text-sm text-gray-600'>Active Supermarkets</div>
                        </div>
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white text-center'>
                          <div className='text-2xl font-bold text-green-600'>
                            {Object.keys(overviewStats.category_stats || {}).length}
                          </div>
                          <div className='text-sm text-gray-600'>Product Categories</div>
                        </div>
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white text-center'>
                          <div className='text-2xl font-bold text-purple-600'>
                            {Object.keys(overviewStats.brand_stats || {}).length}
                          </div>
                          <div className='text-sm text-gray-600'>Total Brands</div>
                        </div>
                        <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white text-center'>
                          <div className='text-2xl font-bold text-orange-600'>
                            {Object.values(overviewStats.supermarket_stats || {}).reduce((sum: number, count: any) => sum + count, 0)}
                          </div>
                          <div className='text-sm text-gray-600'>Total Products</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Loading state. */}
                  {(loading || overviewLoading) && (
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                      <CardSkeleton />
                      <CardSkeleton />
                      <CardSkeleton />
                    </div>
                  )}

                  {/* No data state. */}
                  {!loading && !overviewLoading && (!overviewStats || (!overviewStats.supermarket_stats && !overviewStats.category_stats && !overviewStats.brand_stats)) && (
                    <div className='text-center py-12'>
                      <div className='h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                        <Chart size={24} className='text-gray-400' />
                      </div>
                      <p className='text-gray-500 mb-2'>No pricing data available</p>
                      <p className='text-sm text-gray-400'>Upload some price data to see analytics.</p>
                    </div>
                  )}
                </div>
                </motion.div>
              )}

              {activeTab === 'enhanced' && (
                <motion.div
                  key="enhanced"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <EnhancedOverviewView />
                </motion.div>
              )}

              {activeTab === 'history' && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <PriceHistoryView />
                </motion.div>
              )}

              {activeTab === 'compare' && (
                <motion.div
                  key="compare"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <PriceComparisonView />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </PageContent>
      
      {/* Toast notifications. */}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default PricingDashboard;

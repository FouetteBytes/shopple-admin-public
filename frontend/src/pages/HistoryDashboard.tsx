"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import PageNavbar, {
  PageNavbarLeftContent,
  PageNavbarRightContent,
} from '@/components/layout/PageNavbar';
import PageContent from '@/components/layout/PageContent';
import {
  Chart,
  SearchNormal1,
  Shop,
  Calendar1,
  Refresh2,
  TrendUp,
  TrendDown,
  MoneyRecive,
  Category2,
  Building4,
  Clock,
  Box,
  Graph,
  Filter,
} from 'iconsax-react';
import MarketInsightsPanel from '@/components/pricing/MarketInsightsPanel';
import { GlassStatCard } from '@/components/shared/GlassStatCard';
import { GlassFilterBar } from '@/components/shared/GlassFilterBar';
import { GlassSubTabs } from '@/components/shared/GlassSubTabs';
import { PageHero } from '@/components/shared/PageHero';

import { API_BASE_URL } from '@/lib/api';

// Dynamically import chart components with no SSR
const PriceIntelligenceChart = dynamic(
  () => import('@/components/pricing/PriceIntelligenceChart'),
  { ssr: false },
);
const TestChart = dynamic(
  () => import('@/components/pricing/TestChart'),
  { ssr: false },
);

// Define interfaces for price data
interface EnhancedProduct {
  id: string;
  name: string;
  brand_name: string;
  size: string;
  category: string;
  image_url?: string;
  price_data: any[];
}

const HistoryDashboard: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [historyData, setHistoryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New State for Glass Components
  const [activeTab, setActiveTab] = useState<'products' | 'insights'>('products');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');

  // Use SWR for fetching available products
  const fetcher = (url: string) => fetch(url).then(r => r.json());
  
  const { data: productsData, mutate: refreshProducts } = useSWR(
    `${API_BASE_URL}/api/prices/overview/enhanced?per_page=1000`,
    fetcher,
    {
      refreshInterval: autoRefresh ? 30000 : 0,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      keepPreviousData: true, // Keep showing old data while fetching new data
    }
  );

  const availableProducts: EnhancedProduct[] = useMemo(() => {
    if (productsData && productsData.success) {
      return productsData.products;
    }
    return [];
  }, [productsData]);

  // Derived stats
  const stats = useMemo(() => {
    const totalProducts = availableProducts.length;
    const totalPrices = availableProducts.reduce((acc, p) => acc + p.price_data.length, 0);
    const categories = new Set(availableProducts.map(p => p.category).filter(Boolean)).size;
    const brands = new Set(availableProducts.map(p => p.brand_name).filter(Boolean)).size;
    return { totalProducts, totalPrices, categories, brands };
  }, [availableProducts]);

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
    setActiveTab('insights'); // Switch to insights tab on selection
  };

  const filteredProducts = useMemo(() => {
    return availableProducts.filter(product => {
      // Text Search
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          product.name.toLowerCase().includes(searchLower) ||
          product.brand_name.toLowerCase().includes(searchLower) ||
          product.category?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category Filter
      if (selectedCategory !== 'all' && product.category?.toLowerCase() !== selectedCategory) {
        return false;
      }

      // Brand Filter
      if (selectedBrand !== 'all' && product.brand_name?.toLowerCase() !== selectedBrand) {
        return false;
      }

      return true;
    });
  }, [availableProducts, searchTerm, selectedCategory, selectedBrand]);

  const filterSelects = useMemo(() => {
    const categories = Array.from(new Set(availableProducts.map(p => p.category?.toLowerCase()).filter(Boolean))).sort();
    const brands = Array.from(new Set(availableProducts.map(p => p.brand_name?.toLowerCase()).filter(Boolean))).sort();

    return [
      {
        label: 'Category',
        value: selectedCategory,
        options: [
          { value: 'all', label: 'All Categories' },
          ...categories.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))
        ],
        onChange: setSelectedCategory
      },
      {
        label: 'Brand',
        value: selectedBrand,
        options: [
          { value: 'all', label: 'All Brands' },
          ...brands.map(b => ({ value: b, label: b.charAt(0).toUpperCase() + b.slice(1) }))
        ],
        onChange: setSelectedBrand
      }
    ];
  }, [availableProducts, selectedCategory, selectedBrand]);

  return (
    <div>
      <PageHeader 
        title="Price History & Market Intelligence" 
        subtitle="Comprehensive market analysis and historical trends" 
        icon={Chart}
        onRefresh={() => {
            refreshProducts();
            if (selectedProduct) {
                fetchPriceHistory(selectedProduct);
            }
        }}
        refreshing={loading}
        hideSearch={true}
        hideNotification={true}
      />

      <PageContent>
        <div className='space-y-6'>
          <PageHero
            title="Price History & Market Intelligence"
            description="Comprehensive market analysis and historical trends"
            stats={[
              { label: "Total Products", value: stats.totalProducts, subtext: "Tracked", color: "indigo", icon: Box },
              { label: "Total Prices", value: stats.totalPrices, subtext: "Data Points", color: "blue", icon: MoneyRecive },
              { label: "Categories", value: stats.categories, subtext: "Active", color: "emerald", icon: Category2 },
              { label: "Brands", value: stats.brands, subtext: "Monitored", color: "rose", icon: Shop }
            ]}
          />

        {/* Filter Bar */}
        <GlassFilterBar
          searchPlaceholder="Search products by name, brand, or category..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          selects={filterSelects}
          onRefresh={() => refreshProducts()}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          lastRefreshedLabel="Just now"
        />

        {/* Tabs */}
        <GlassSubTabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'products' | 'insights')}
          tabs={[
            {
              key: 'products',
              label: 'Product List',
              description: 'Browse and select products',
              icon: Box,
              badgeValue: filteredProducts.length
            },
            {
              key: 'insights',
              label: 'Market Insights',
              description: 'Detailed price analysis',
              icon: Graph,
              badgeValue: selectedProduct ? 1 : 0
            }
          ]}
        />

        {/* Content Area */}
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'products' ? (
            <motion.div
              key="products"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20, transition: { duration: 0.1 } }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleProductSelect(product.id)}
                  className={`group relative p-4 border rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-lg ${
                    selectedProduct === product.id 
                      ? 'border-primary bg-blue-50/50 shadow-md ring-2 ring-primary/20' 
                      : 'border-white/60 bg-white/80 hover:bg-white hover:border-primary/30'
                  }`}
                >
                  {/* Selection Indicator */}
                  {selectedProduct === product.id && (
                    <div className='absolute -top-2 -right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-md z-10'>
                      <span className='text-white text-xs'>✓</span>
                    </div>
                  )}
                  
                  <div className='flex items-center gap-4'>
                    {/* Product Image */}
                    <div className='relative flex-shrink-0'>
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className='w-16 h-16 object-cover rounded-xl shadow-sm'
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className='w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center'>
                          <Shop size={24} className='text-gray-400' />
                        </div>
                      )}
                      {/* Price Count Badge */}
                      <div className='absolute -bottom-2 -right-2 bg-white text-xs px-2 py-0.5 rounded-full font-medium shadow-sm border border-gray-100 flex items-center gap-1'>
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        {product.price_data.length}
                      </div>
                    </div>
                    
                    {/* Product Info */}
                    <div className='flex-1 min-w-0'>
                      <p className='font-semibold text-gray-800 truncate text-sm mb-1 group-hover:text-primary transition-colors'>
                        {product.name}
                      </p>
                      <p className='text-xs text-gray-500 truncate mb-2'>
                        {product.brand_name} {product.size && `• ${product.size}`}
                      </p>
                      <div className='flex items-center justify-between'>
                        <span className='text-[10px] uppercase tracking-wider text-gray-400 font-medium bg-gray-50 px-2 py-1 rounded-md'>
                          {product.category || 'Uncategorized'}
                        </span>
                        {product.price_data.length > 0 && (
                          <p className='text-sm font-bold text-gray-900'>
                            Rs {Math.min(...product.price_data.map(p => p.price)).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500">
                  No products found matching your filters.
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="insights"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20, transition: { duration: 0.1 } }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="space-y-6"
            >
              {!selectedProduct ? (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-white/50 rounded-3xl border border-dashed border-gray-300">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <SearchNormal1 size={32} className="text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">No Product Selected</h3>
                  <p className="text-gray-500 max-w-md mt-2">
                    Select a product from the "Product List" tab to view detailed price history and market insights.
                  </p>
                  <button 
                    onClick={() => setActiveTab('products')}
                    className="mt-6 px-6 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Browse Products
                  </button>
                </div>
              ) : loading ? (
                <div className='space-y-6 animate-pulse'>
                  {/* Product Info Skeleton */}
                  <div className='bg-white rounded-3xl p-6 shadow-sm border border-gray-100'>
                    <div className='flex items-start gap-6'>
                      <div className='w-24 h-24 bg-gray-200 rounded-2xl'></div>
                      <div className='flex-1 space-y-4'>
                        <div className='flex justify-between'>
                          <div className='space-y-2'>
                            <div className='h-8 w-64 bg-gray-200 rounded-lg'></div>
                            <div className='flex gap-3'>
                              <div className='h-6 w-24 bg-gray-200 rounded-lg'></div>
                              <div className='h-6 w-24 bg-gray-200 rounded-lg'></div>
                            </div>
                          </div>
                          <div className='h-4 w-32 bg-gray-200 rounded'></div>
                        </div>
                        <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className='h-20 bg-gray-100 rounded-xl'></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chart Skeleton */}
                  <div className='h-96 bg-white rounded-3xl border border-gray-100 p-6'>
                    <div className='flex items-center gap-3 mb-8'>
                      <div className='h-10 w-10 bg-gray-200 rounded-xl'></div>
                      <div className='space-y-2'>
                        <div className='h-6 w-48 bg-gray-200 rounded'></div>
                        <div className='h-4 w-32 bg-gray-200 rounded'></div>
                      </div>
                    </div>
                    <div className='space-y-4'>
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className='h-48 bg-gray-50 rounded-2xl'></div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : historyData ? (
                <>
                  {/* Product Header Card */}
                  <div className='bg-white rounded-3xl p-6 shadow-sm border border-gray-100'>
                    <div className='flex items-start gap-6'>
                      <div className='relative flex-shrink-0'>
                        {historyData.product.image_url ? (
                          <img 
                            src={historyData.product.image_url} 
                            alt={historyData.product.name}
                            className='w-24 h-24 object-cover rounded-2xl shadow-md'
                          />
                        ) : (
                          <div className='w-24 h-24 bg-gray-100 rounded-2xl flex items-center justify-center'>
                            <Shop size={32} className='text-gray-400' />
                          </div>
                        )}
                      </div>
                      <div className='flex-1'>
                        <div className="flex justify-between items-start">
                          <div>
                            <h2 className='text-2xl font-bold text-gray-900 mb-2'>{historyData.product.name}</h2>
                            <div className='flex flex-wrap items-center gap-3 mb-4'>
                              <span className='px-3 py-1 bg-gray-100 rounded-lg text-sm font-medium text-gray-700'>
                                {historyData.product.brand_name}
                              </span>
                              {historyData.product.size && (
                                <span className='px-3 py-1 bg-gray-100 rounded-lg text-sm font-medium text-gray-700'>
                                  {historyData.product.size}
                                </span>
                              )}
                              <span className='px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium capitalize'>
                                {historyData.product.category}
                              </span>
                            </div>
                          </div>
                          <button 
                            onClick={() => setActiveTab('products')}
                            className="text-sm text-gray-500 hover:text-primary underline"
                          >
                            Change Product
                          </button>
                        </div>
                        
                        {/* Quick Stats Row */}
                        {historyData.price_analysis && (
                          <div className='grid grid-cols-2 md:grid-cols-4 gap-4 mt-2'>
                            <div className='p-3 bg-green-50 rounded-xl border border-green-100'>
                              <p className='text-xs text-green-600 font-medium mb-1'>Lowest Price</p>
                              <p className='text-lg font-bold text-green-700'>Rs {historyData.price_analysis.min_price.toFixed(2)}</p>
                            </div>
                            <div className='p-3 bg-red-50 rounded-xl border border-red-100'>
                              <p className='text-xs text-red-600 font-medium mb-1'>Highest Price</p>
                              <p className='text-lg font-bold text-red-700'>Rs {historyData.price_analysis.max_price.toFixed(2)}</p>
                            </div>
                            <div className='p-3 bg-blue-50 rounded-xl border border-blue-100'>
                              <p className='text-xs text-blue-600 font-medium mb-1'>Average Price</p>
                              <p className='text-lg font-bold text-blue-700'>Rs {historyData.price_analysis.avg_price.toFixed(2)}</p>
                            </div>
                            <div className='p-3 bg-purple-50 rounded-xl border border-purple-100'>
                              <p className='text-xs text-purple-600 font-medium mb-1'>Price Range</p>
                              <p className='text-lg font-bold text-purple-700'>Rs {historyData.price_analysis.price_range.toFixed(2)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Charts Section */}
                  {historyData.price_history && Object.keys(historyData.price_history).length > 0 ? (
                    <PriceIntelligenceChart 
                      priceHistory={historyData.price_history}
                      currentPrices={historyData.current_prices}
                      productName={historyData.product.name}
                      className="mb-6"
                    />
                  ) : (
                    <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 mb-6">
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

                  {/* Current Prices Grid */}
                  <div className='bg-white rounded-3xl p-6 shadow-sm border border-gray-100'>
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Building4 size={20} className="text-primary" />
                      Current Market Prices
                    </h3>
                    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                      {historyData.current_prices.map((price: any, index: number) => (
                        <div key={price.id} className={`relative p-4 rounded-2xl border transition-all hover:shadow-md ${
                          index === 0 
                            ? 'border-green-500 bg-green-50/50 ring-1 ring-green-200' 
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}>
                          {index === 0 && (
                            <div className='absolute -top-3 left-4 bg-green-500 text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-bold shadow-sm'>
                              Best Deal
                            </div>
                          )}
                          
                          <div className='flex justify-between items-start mb-2 mt-1'>
                            <span className='font-bold text-gray-800 capitalize text-lg'>{price.supermarketId}</span>
                            <div className={`text-xl font-bold ${
                              index === 0 ? 'text-green-700' : 'text-gray-900'
                            }`}>
                              Rs {price.price.toFixed(2)}
                            </div>
                          </div>
                          
                          <div className='flex items-center gap-2 text-xs text-gray-500'>
                            <Clock size={12} />
                            <span>Updated: {new Date(price.priceDate || price.lastUpdated).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Historical Price Records by Store */}
                  {historyData.price_history && Object.keys(historyData.price_history).length > 0 && (
                    <div className='space-y-6'>
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Clock size={20} className="text-primary" />
                        Historical Price Records
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries(historyData.price_history).map(([supermarket, data]: [string, any]) => (
                          <div key={supermarket} className='bg-white rounded-3xl p-6 shadow-sm border border-gray-100'>
                            <div className='flex items-center justify-between mb-4'>
                              <div className='flex items-center gap-3'>
                                <div className='h-10 w-10 bg-gray-100 rounded-xl flex items-center justify-center'>
                                  <Shop size={20} className="text-gray-600" />
                                </div>
                                <div>
                                  <h4 className='font-bold text-gray-900 capitalize'>{supermarket}</h4>
                                  <p className='text-xs text-gray-500'>{data.total_records} records found</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className='max-h-60 overflow-y-auto pr-2 custom-scrollbar'>
                              <table className='w-full text-sm'>
                                <thead className='bg-gray-50 sticky top-0'>
                                  <tr>
                                    <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 rounded-l-lg'>Date</th>
                                    <th className='px-4 py-2 text-right text-xs font-medium text-gray-500 rounded-r-lg'>Price</th>
                                  </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-100'>
                                  {data.daily_prices.slice().reverse().map((record: any, idx: number) => (
                                    <tr key={idx} className='hover:bg-gray-50 transition-colors'>
                                      <td className='px-4 py-3 text-gray-600'>
                                        {new Date(record.date).toLocaleDateString(undefined, { 
                                          year: 'numeric', 
                                          month: 'short', 
                                          day: 'numeric' 
                                        })}
                                      </td>
                                      <td className='px-4 py-3 text-right font-medium text-gray-900'>
                                        Rs {record.price.toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageContent>
    </div>
  );
};

export default HistoryDashboard;

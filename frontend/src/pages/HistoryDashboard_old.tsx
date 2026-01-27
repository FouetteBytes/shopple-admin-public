"use client"

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import PageNavbar, {
  PageNavbarLeftContent,
  PageNavbarRightContent,
  PageNavbarIconButton,
} from '@/components/layout/PageNavbar';
import PageContent from '@/components/layout/PageContent';
import {
  Document,
  Chart,
  SearchNormal1,
  Refresh2,
  Clock,
  TrendUp,
  Building4,
  DirectNotification,
  MoneyRecive,
} from 'iconsax-react';
import MarketInsightsPanel from '@/components/pricing/MarketInsightsPanel';
import { API_BASE_URL } from '@/lib/api';

// Interface for enhanced product data
interface EnhancedProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  total_stores: number;
  avg_price: number;
  price_range: {
    min: number;
    max: number;
    difference: number;
  };
  last_updated: string;
  current_prices: Array<{
    id: string;
    price: number;
    supermarketId: string;
    productId: string;
    lastUpdated: string;
  }>;
}

const HistoryDashboard: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [historyData, setHistoryData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableProducts, setAvailableProducts] = useState<EnhancedProduct[]>([]);

  useEffect(() => {
    fetchAvailableProducts();
  }, []);

  const fetchAvailableProducts = async () => {
    try {
  const response = await fetch(`${API_BASE_URL}/api/prices/overview/enhanced?per_page=100`);
      const data = await response.json();
      if (data.success) {
        setAvailableProducts(data.products);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const fetchPriceHistory = async (productId: string) => {
    setLoading(true);
    try {
  const response = await fetch(`${API_BASE_URL}/api/prices/history/${productId}`);
      const data = await response.json();
      
      if (data.success) {
        setHistoryData(data.data);
      } else {
        console.error('Failed to fetch price history:', data.message);
        setHistoryData(null);
      }
    } catch (error) {
      console.error('Error fetching price history:', error);
      setHistoryData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    if (productId) {
      fetchPriceHistory(productId);
    } else {
      setHistoryData(null);
    }
  };

  const filteredProducts = availableProducts.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedProductData = availableProducts.find(p => p.id === selectedProduct);

  return (
    <PageContent>
      <PageNavbar>
        <PageNavbarLeftContent>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Document size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900"> Price History & Market Intelligence</h1>
              <p className="text-sm text-gray-600">Comprehensive market analysis and historical trends</p>
            </div>
          </div>
        </PageNavbarLeftContent>
        <PageNavbarRightContent>
          <PageNavbarIconButton 
            onClick={() => {
              fetchAvailableProducts();
              if (selectedProduct) {
                fetchPriceHistory(selectedProduct);
              }
            }}
            disabled={loading}
            title="Refresh Data"
          >
            <Refresh2 size={20} />
          </PageNavbarIconButton>
        </PageNavbarRightContent>
      </PageNavbar>

      <div className="space-y-6">
        {/* Product Selection Section */}
        <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl border border-blue-100 shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <SearchNormal1 size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900"> Select Product for Analysis</h3>
              <p className="text-sm text-gray-600">Choose a product to view detailed price history and market insights</p>
            </div>
          </div>

          {/* Search and Select */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Products</label>
              <div className="relative">
                <SearchNormal1 size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or category..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Product</label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={selectedProduct}
                onChange={(e) => handleProductSelect(e.target.value)}
              >
                <option value="">Choose a product...</option>
                {filteredProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} - {product.category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected Product Info */}
          {selectedProductData && (
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="grid md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-sm text-blue-600 font-medium">Product</p>
                  <p className="text-lg font-bold text-blue-900">{selectedProductData.name}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-blue-600 font-medium">Avg Price</p>
                  <p className="text-lg font-bold text-blue-900">Rs {selectedProductData.avg_price.toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-blue-600 font-medium">Stores</p>
                  <p className="text-lg font-bold text-blue-900">{selectedProductData.total_stores}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-blue-600 font-medium">Price Range</p>
                  <p className="text-lg font-bold text-blue-900">Rs {selectedProductData.price_range.difference.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-12">
            <div className="flex flex-col items-center justify-center">
              <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2"> Loading Market Intelligence</h3>
              <p className="text-gray-600 text-center">Analyzing price history and generating insights...</p>
            </div>
          </div>
        )}

        {/* Market Insights Panel - Only show when data is available */}
        {!loading && historyData && historyData.price_history && Object.keys(historyData.price_history).length > 0 && (
          <MarketInsightsPanel 
            priceHistory={historyData.price_history}
            productName={historyData.product.name}
            className="mb-6"
          />
        )}

        {/* No Data State */}
        {!loading && selectedProduct && (!historyData || !historyData.price_history || Object.keys(historyData.price_history).length === 0) && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-12">
            <div className="text-center">
              <Chart size={64} className="mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">No Historical Data Available</h3>
              <p className="text-gray-600 mb-4">
                This product doesn&rsquo;t have sufficient price history for analysis.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
                <p className="text-sm text-yellow-800">
                   <strong>Tip:</strong> Historical data becomes available after products have been tracked for multiple periods.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Welcome State - No product selected */}
        {!selectedProduct && !loading && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-12">
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <div className="h-20 w-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <Document size={40} className="text-white" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4"> Welcome to Price History Center</h3>
              <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
                Get comprehensive market intelligence with historical price analysis, trend identification, 
                and smart shopping recommendations. Select a product above to begin your analysis.
              </p>
              
              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                <div className="bg-white rounded-xl p-6 border border-indigo-100">
                  <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <TrendUp size={24} className="text-blue-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Market Trends</h4>
                  <p className="text-sm text-gray-600">Track price movements and identify the best buying opportunities</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 border border-indigo-100">
                  <div className="h-12 w-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Building4 size={24} className="text-green-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Store Comparison</h4>
                  <p className="text-sm text-gray-600">Compare prices across different supermarkets and find the best deals</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 border border-indigo-100">
                  <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <DirectNotification size={24} className="text-purple-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Smart Alerts</h4>
                  <p className="text-sm text-gray-600">Get notified about price anomalies and unusual market movements</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContent>
  );
};

export default HistoryDashboard;

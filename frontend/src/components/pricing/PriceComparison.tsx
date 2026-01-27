import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Store, Calendar, Search, Filter } from 'lucide-react';

interface PriceComparison {
  product_id: string;
  product_name: string;
  category: string;
  brand_name: string;
  size: string;
  prices: {
    [supermarket: string]: {
      price: number;
      last_updated: string;
      rank: number;
    }
  };
  price_range: {
    min: number;
    max: number;
    avg: number;
    spread_percentage: number;
  };
}

interface MonthlyTrend {
  product_id: string;
  product_name: string;
  supermarket_id: string;
  monthly_data: {
    [month: string]: {
      avg_price: number;
      min_price: number;
      max_price: number;
      price_change: number;
      volatility: number;
    }
  };
}

const PriceComparison: React.FC = () => {
  const [comparisons, setComparisons] = useState<PriceComparison[]>([]);
  const [trends, setTrends] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'spread' | 'min_price'>('spread');
  const [showTrends, setShowTrends] = useState(false);

  const supermarketNames: { [key: string]: string } = {
    'cargills': 'Cargills',
    'keells': 'Keells',
    'arpico': 'Arpico',
    'laughs': 'Laughs',
    'spar': 'SPAR'
  };

  const categories = [
    'All Categories',
    'dairy', 'beverages', 'snacks', 'household', 'frozen_foods',
    'fruits', 'vegetables', 'meat', 'bakery', 'personal_care'
  ];

  useEffect(() => {
    fetchPriceComparisons();
  }, []);

  const fetchPriceComparisons = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/prices/compare');
      if (!response.ok) {
        throw new Error('Failed to fetch price comparisons');
      }
      const data = await response.json();
      setComparisons(data.comparisons || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrends = async () => {
    try {
      const response = await fetch('/api/prices/trends');
      if (!response.ok) {
        throw new Error('Failed to fetch trends');
      }
      const data = await response.json();
      setTrends(data.trends || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trends');
    }
  };

  const filteredComparisons = comparisons.filter(comparison => {
    const matchesSearch = comparison.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         comparison.brand_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || selectedCategory === 'All Categories' || 
                           comparison.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedComparisons = [...filteredComparisons].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.product_name.localeCompare(b.product_name);
      case 'spread':
        return b.price_range.spread_percentage - a.price_range.spread_percentage;
      case 'min_price':
        return a.price_range.min - b.price_range.min;
      default:
        return 0;
    }
  });

  const formatPrice = (price: number) => `Rs. ${price.toFixed(2)}`;

  const getPriceChangeColor = (change: number) => {
    if (change > 0) return 'text-red-600';
    if (change < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Price Comparison Dashboard</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTrends(!showTrends)}
            className={`px-4 py-2 rounded-md flex items-center gap-2 ${showTrends ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            <TrendingUp className="h-4 w-4" />
            {showTrends ? 'Hide Trends' : 'Show Trends'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Products</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search products..."
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map((category) => (
                <option key={category} value={category === 'All Categories' ? '' : category}>
                  {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'spread' | 'min_price')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="spread">Price Spread</option>
              <option value="name">Product Name</option>
              <option value="min_price">Lowest Price</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchPriceComparisons}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Price Comparisons */}
      <div className="space-y-4">
        {sortedComparisons.map((comparison) => (
          <div key={comparison.product_id} className="bg-white rounded-lg shadow-sm border p-6">
            {/* Product Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {comparison.brand_name} {comparison.product_name}
                </h3>
                <p className="text-sm text-gray-600">
                  {comparison.category.replace('_', ' ')} • {comparison.size}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Price Range</div>
                <div className="text-lg font-bold text-gray-900">
                  {formatPrice(comparison.price_range.min)} - {formatPrice(comparison.price_range.max)}
                </div>
                <div className="text-sm text-red-600">
                  {comparison.price_range.spread_percentage.toFixed(1)}% spread
                </div>
              </div>
            </div>

            {/* Price Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(comparison.prices).map(([supermarket, priceData]) => (
                <div key={supermarket} className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-center gap-1 mb-2">
                    <Store className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {supermarketNames[supermarket] || supermarket}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-gray-900">
                    {formatPrice(priceData.price)}
                  </div>
                  <div className="text-xs text-gray-500">
                    Rank #{priceData.rank}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(priceData.last_updated).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Average Price */}
            <div className="mt-4 pt-4 border-t text-center">
              <span className="text-sm text-gray-600">Average Price: </span>
              <span className="text-lg font-semibold text-blue-600">
                {formatPrice(comparison.price_range.avg)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {sortedComparisons.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No price comparisons found. Try adjusting your filters or upload some price data.</p>
        </div>
      )}

      {/* Trends Section */}
      {showTrends && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">Price Trends</h2>
            <button
              onClick={fetchTrends}
              className="ml-auto px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Load Trends
            </button>
          </div>
          
          {trends.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {trends.slice(0, 6).map((trend) => (
                <div key={`${trend.product_id}_${trend.supermarket_id}`} className="bg-white p-4 rounded-lg shadow-sm border">
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {trend.product_name} - {supermarketNames[trend.supermarket_id]}
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(trend.monthly_data).slice(-3).map(([month, data]) => (
                      <div key={month} className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">{month}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{formatPrice(data.avg_price)}</span>
                          <span className={`text-sm flex items-center gap-1 ${getPriceChangeColor(data.price_change)}`}>
                            {data.price_change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {Math.abs(data.price_change).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No trend data available. Price trends will appear after multiple months of data collection.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PriceComparison;

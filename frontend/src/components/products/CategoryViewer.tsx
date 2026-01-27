'use client';

import React, { useState, useEffect } from 'react';
import { Eye, Database, CheckCircle, XCircle, Calendar, Hash, FileText, Tag, Package, Search, Filter, RefreshCw, Grid, List, ChevronDown, Info, Activity, Box, Layers } from 'lucide-react';
import { GlassStatCard } from '@/components/shared/GlassStatCard';
import { API_BASE_URL } from '@/lib/api';

interface Category {
  id: string;
  display_name: string;
  description: string;
  is_food: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

const CategoryViewer: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'food' | 'non-food'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
  const response = await fetch(`${API_BASE_URL}/api/categories`);
      const result = await response.json();

      if (result.success) {
        // Sort categories by sort_order
        const sortedCategories = result.categories.sort((a: Category, b: Category) => 
          a.sort_order - b.sort_order
        );
        setCategories(sortedCategories);
      } else {
        setError('Failed to load categories');
      }
    } catch (error) {
      setError('Error loading categories: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter(category => {
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'food' && category.is_food) || 
      (filter === 'non-food' && !category.is_food);
    
    const matchesSearch = 
      searchTerm === '' ||
      category.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      category.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      category.id.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const stats = {
    total: categories.length,
    food: categories.filter(c => c.is_food).length,
    nonFood: categories.filter(c => !c.is_food).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-lg text-gray-600">Loading categories...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <XCircle className="h-6 w-6 text-red-500 mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-red-800">Error Loading Categories</h3>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-500 rounded-xl shadow-lg">
              <Layers className="h-7 w-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">System Categories</h2>
              <p className="text-gray-600 text-sm">Comprehensive view of all product categories in Firestore</p>
            </div>
          </div>
          <button
            onClick={loadCategories}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="font-medium">Refresh Data</span>
          </button>
        </div>

        {/* Enhanced Stats Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="relative">
            <GlassStatCard
              label="Total categories"
              value={stats.total}
              subtext="All system categories"
              accent="primary"
              className="h-full"
            />
            <div className="pointer-events-none absolute right-6 top-6 rounded-2xl border border-white/50 bg-white/80 p-3 text-slate-500">
              <Database className="h-6 w-6" />
            </div>
          </div>
          <div className="relative">
            <GlassStatCard
              label="Food categories"
              value={stats.food}
              subtext="Edible products"
              accent="emerald"
              className="h-full"
            />
            <div className="pointer-events-none absolute right-6 top-6 rounded-2xl border border-white/50 bg-white/80 p-3 text-emerald-500">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
          <div className="relative">
            <GlassStatCard
              label="Non-food"
              value={stats.nonFood}
              subtext="Household items"
              accent="amber"
              className="h-full"
            />
            <div className="pointer-events-none absolute right-6 top-6 rounded-2xl border border-white/50 bg-white/80 p-3 text-amber-500">
              <Box className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Controls Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters & Search</span>
          </div>
          
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-500">View:</span>
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'grid' 
                    ? 'bg-white shadow-sm text-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'list' 
                    ? 'bg-white shadow-sm text-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Filter */}
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'food' | 'non-food')}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none bg-white"
            >
              <option value="all">All Categories ({stats.total})</option>
              <option value="food">Food Only ({stats.food})</option>
              <option value="non-food">Non-Food Only ({stats.nonFood})</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-center lg:justify-start">
            <div className="bg-blue-50 px-4 py-3 rounded-xl">
              <span className="text-sm font-medium text-blue-700">
                {filteredCategories.length} categories found
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Categories Display */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories.map((category) => (
            <div
              key={category.id}
              className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 hover:-translate-y-1 cursor-pointer group"
              onClick={() => setSelectedCategory(category)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${category.is_food ? 'bg-green-100' : 'bg-orange-100'}`}>
                  {category.is_food ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : (
                    <Box className="h-6 w-6 text-orange-600" />
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    category.is_food 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-orange-100 text-orange-700'
                  }`}>
                    {category.is_food ? 'Food' : 'Non-Food'}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    #{category.sort_order}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                    {category.display_name}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded mt-1">
                    {category.id}
                  </p>
                </div>

                <p className="text-gray-600 text-sm line-clamp-2">
                  {category.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(category.created_at)}</span>
                  </div>
                  <Info className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sort Order
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCategories.map((category, index) => (
                  <tr
                    key={category.id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
                    }`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg mr-3 ${
                          category.is_food ? 'bg-green-100' : 'bg-orange-100'
                        }`}>
                          {category.is_food ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Box className="h-4 w-4 text-orange-600" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {category.display_name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {category.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        category.is_food 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {category.is_food ? 'Food' : 'Non-Food'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {category.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                        #{category.sort_order}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(category.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button className="text-blue-600 hover:text-blue-900 font-medium">
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enhanced Category Detail Modal */}
      {selectedCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`p-3 rounded-xl ${
                    selectedCategory.is_food ? 'bg-green-500' : 'bg-orange-500'
                  }`}>
                    {selectedCategory.is_food ? (
                      <CheckCircle className="h-6 w-6 text-white" />
                    ) : (
                      <Box className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {selectedCategory.display_name}
                    </h3>
                    <p className="text-sm text-gray-600">Category Details</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <XCircle className="h-6 w-6 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Document ID
                    </label>
                    <p className="mt-1 text-sm font-mono text-gray-900 bg-white px-3 py-2 rounded border">
                      {selectedCategory.id}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Display Name
                    </label>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {selectedCategory.display_name}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category Type
                    </label>
                    <div className="mt-2">
                      <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                        selectedCategory.is_food 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {selectedCategory.is_food ? ' Food Category' : ' Non-Food Category'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sort Order
                    </label>
                    <p className="mt-1 text-lg font-bold text-gray-900">
                      #{selectedCategory.sort_order}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </label>
                    <p className="mt-2 text-sm text-gray-700 leading-relaxed">
                      {selectedCategory.description}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamps
                    </label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          Created: {formatDate(selectedCategory.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Activity className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          Updated: {formatDate(selectedCategory.updated_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryViewer;

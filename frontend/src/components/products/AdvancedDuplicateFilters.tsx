'use client';

import React, { useState } from 'react';
import { 
  Filter, 
  X, 
  ChevronDown,
  Percent,
  Tag,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

export interface DuplicateFilterOptions {
  matchPercentageMin: number;
  matchPercentageMax: number;
  matchTypes: string[]; // 'exact', 'fuzzy', 'brand_variety'
  differenceTypes: string[]; // 'name', 'brand', 'size', 'category'
  showOnlyWithDifferences: boolean;
}

interface AdvancedDuplicateFiltersProps {
  filters: DuplicateFilterOptions;
  onFilterChange: (filters: DuplicateFilterOptions) => void;
  totalDuplicates: number;
  filteredCount: number;
}

const AdvancedDuplicateFilters: React.FC<AdvancedDuplicateFiltersProps> = ({
  filters,
  onFilterChange,
  totalDuplicates,
  filteredCount
}) => {
  const matchTypeOptions = [
    { value: 'exact', label: 'Exact', color: 'red', icon: '🎯' },
    { value: 'fuzzy', label: 'Fuzzy', color: 'orange', icon: '🔍' },
    { value: 'brand_variety', label: 'Brand', color: 'yellow', icon: '🏷️' }
  ];

  const differenceTypeOptions = [
    { value: 'name', label: 'Name', icon: '📝' },
    { value: 'brand', label: 'Brand', icon: '🏷️' },
    { value: 'size', label: 'Size', icon: '📏' },
    { value: 'category', label: 'Cat', icon: '📂' }
  ];

  const toggleMatchType = (type: string) => {
    const newTypes = filters.matchTypes.includes(type)
      ? filters.matchTypes.filter(t => t !== type)
      : [...filters.matchTypes, type];
    onFilterChange({ ...filters, matchTypes: newTypes });
  };

  const toggleDifferenceType = (type: string) => {
    const newTypes = filters.differenceTypes.includes(type)
      ? filters.differenceTypes.filter(t => t !== type)
      : [...filters.differenceTypes, type];
    onFilterChange({ ...filters, differenceTypes: newTypes });
  };

  const resetFilters = () => {
    onFilterChange({
      matchPercentageMin: 0,
      matchPercentageMax: 100,
      matchTypes: ['exact', 'fuzzy', 'brand_variety'],
      differenceTypes: [],
      showOnlyWithDifferences: false
    });
  };

  const isFiltered = 
    filters.matchPercentageMin > 0 ||
    filters.matchPercentageMax < 100 ||
    filters.matchTypes.length < 3 ||
    filters.differenceTypes.length > 0 ||
    filters.showOnlyWithDifferences;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 shadow-sm">
      {/* Compact Single Row Layout */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Filter Icon + Title */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
            <Filter className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-700">Filters</span>
        </div>

        {/* Match Percentage */}
        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-gray-200">
          <Percent className="h-3.5 w-3.5 text-blue-600" />
          <input
            type="number"
            min="0"
            max="100"
            value={filters.matchPercentageMin}
            onChange={(e) => onFilterChange({ ...filters, matchPercentageMin: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
            className="w-12 text-xs font-medium text-center border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
            placeholder="Min"
          />
          <span className="text-xs text-gray-400">-</span>
          <input
            type="number"
            min="0"
            max="100"
            value={filters.matchPercentageMax}
            onChange={(e) => onFilterChange({ ...filters, matchPercentageMax: Math.max(0, Math.min(100, parseInt(e.target.value) || 100)) })}
            className="w-12 text-xs font-medium text-center border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1"
            placeholder="Max"
          />
          <span className="text-xs text-gray-500">%</span>
        </div>

        {/* Match Types */}
        <div className="flex items-center gap-1">
          {matchTypeOptions.map(option => {
            const isSelected = filters.matchTypes.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => toggleMatchType(option.value)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
                title={`${option.label} Match`}
              >
                <span>{option.icon}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        {/* Difference Types */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 mr-1">Diff:</span>
          {differenceTypeOptions.map(option => {
            const isSelected = filters.differenceTypes.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => toggleDifferenceType(option.value)}
                className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
                title={`${option.label} Differs`}
              >
                <span className="text-sm">{option.icon}</span>
              </button>
            );
          })}
        </div>

        {/* Result Count + Reset */}
        <div className="flex items-center gap-2 ml-auto">
          <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
            filteredCount < totalDuplicates
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-200'
          }`}>
            {filteredCount} / {totalDuplicates}
          </div>
          
          {isFiltered && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-white text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-all font-medium"
              title="Reset filters"
            >
              <X className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact info bar */}
      {(filters.matchPercentageMin > 0 || filters.matchPercentageMax < 100) && (
        <div className="mt-2 px-3 py-1 bg-white rounded text-xs text-gray-600 border border-gray-200 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-blue-600" />
          <span>Showing matches between {filters.matchPercentageMin}% - {filters.matchPercentageMax}%</span>
        </div>
      )}

      <style jsx>{`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          opacity: 1;
        }
      `}</style>
    </div>
  );
};

export default AdvancedDuplicateFilters;

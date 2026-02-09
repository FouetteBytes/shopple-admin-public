"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Edit, Eye, DocumentDownload, Trash, Add, Setting5, SearchNormal1, CloseCircle } from 'iconsax-react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { API_BASE_URL } from '@/lib/api'

interface Product {
  id?: string;
  name: string;
  product_name?: string;
  original_name?: string;
  description?: string;
  product_type?: string;
  brand_name?: string;
  size?: string | number;
  sizeUnit?: string;
  sizeRaw?: string;
  variety?: string;
  price?: string;
  image_url?: string;
  confidence?: number;
  model_used?: string;
  processing_time?: number;
}

interface ProductTableProps {
  products: Product[]
  isEditable?: boolean
  onProductUpdate?: (index: number, product: Product) => void
  onProductDelete?: (index: number) => void
  showActions?: boolean
  title?: string
  availableProductTypes?: string[]
  onAddNewType?: (type: string) => void
  editMode?: boolean
  cacheSaveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

const PRODUCT_CATEGORY_OPTIONS: string[] = [
  'Rice & Grains',
  'Lentils & Pulses',
  'Spices & Seasonings',
  'Coconut Products',
  'Canned Food',
  'Snacks',
  'Beverages',
  'Dairy',
  'Meat',
  'Seafood',
  'Dried Seafood',
  'Frozen Food',
  'Salt',
  'Sugar',
  'Vegetables',
  'Fruits',
  'Dried Fruits',
  'Bread & Bakery',
  'Noodles & Pasta',
  'Instant Foods',
  'Oil & Vinegar',
  'Condiments & Sauces',
  'Pickles & Preserves',
  'Sweets & Desserts',
  'Tea & Coffee',
  'Flour & Baking',
  'Nuts & Seeds',
  'Eggs',
  'Baby Food',
  'Cereal',
  'Health & Supplements',
  'Household Items',
  'Paper Products',
  'Cleaning Supplies',
  'Personal Care',
  'Pet Food & Supplies',
]

type RenderEditableTextCellArgs = {
  rowIndex: number
  field: keyof Product
  updateField?: keyof Product
  displayValue?: string | number | null
  inputValue?: string
  placeholder?: string
  onClear?: () => void
  clearTitle?: string
  showClearOnHover?: boolean
  displayClassName?: string
}

// Enhanced Editable Product Type Dropdown Component
const EditableProductTypeDropdown: React.FC<{
  value: string | undefined;
  onChange: (value: string) => void;
  index: number;
  availableTypes: string[];
  onAddNewType?: (type: string) => void;
  allowCustom?: boolean;
}> = ({ value, onChange, index, availableTypes, onAddNewType, allowCustom = true }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const [filteredOptions, setFilteredOptions] = useState(availableTypes)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const findMatchingOption = useCallback((candidate: string) => {
    if (!candidate.trim()) return undefined
    return availableTypes.find(option => option.toLowerCase() === candidate.trim().toLowerCase())
  }, [availableTypes])

  // Update input value when external value changes
  useEffect(() => {
    setInputValue(value || '')
  }, [value])

  // Handle changes and update available types
  const handleChange = useCallback((newValue: string) => {
    const trimmed = newValue.trim()
    if (!trimmed) {
      return
    }

    const existing = findMatchingOption(trimmed)
    if (!allowCustom && !existing) {
      setInputValue(value || '')
      return
    }

    const resolvedValue = existing || trimmed
    onChange(resolvedValue)

    if (allowCustom && resolvedValue && !availableTypes.includes(resolvedValue) && onAddNewType) {
      onAddNewType(resolvedValue)
    }
  }, [allowCustom, availableTypes, findMatchingOption, onAddNewType, onChange, value])

  // Filter options based on input
  useEffect(() => {
    const filtered = availableTypes.filter(option => 
      option.toLowerCase().includes(inputValue.toLowerCase())
    )
    setFilteredOptions(filtered)
    
    // Auto-show dropdown when there are filtered results or when typing
    if (inputValue.trim() && (filtered.length > 0 || (allowCustom && !findMatchingOption(inputValue)))) {
      setIsOpen(true)
    }
  }, [allowCustom, findMatchingOption, inputValue, availableTypes])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        // Save the current input value when clicking outside
        if (inputValue.trim() && inputValue.trim() !== value) {
          const match = findMatchingOption(inputValue)
          if (match) {
            handleChange(match)
            setInputValue(match)
          } else if (!allowCustom) {
            setInputValue(value || '')
          } else {
            handleChange(inputValue.trim())
          }
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [allowCustom, findMatchingOption, handleChange, inputValue, value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inputValue.trim()) {
        const match = findMatchingOption(inputValue)
        if (match) {
          handleChange(match)
          setInputValue(match)
          setIsOpen(false)
        } else if (allowCustom) {
          handleChange(inputValue.trim())
          setIsOpen(false)
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      // Reset to original value on escape
      setInputValue(value || '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIsOpen(true)
    }
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const selectOption = (option: string) => {
    handleChange(option)
    setInputValue(option)
    setIsOpen(false)
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
        placeholder="Select or type product type..."
      />
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-[60] w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
            style={{ 
              minWidth: '200px',
              maxWidth: '300px'
            }}
          >
            {/* Option to add new type if it doesn't exist */}
            {allowCustom && inputValue.trim() && !findMatchingOption(inputValue) && (
              <div
                onClick={() => selectOption(inputValue.trim())}
                className="px-3 py-2 cursor-pointer hover:bg-green-50 text-green-700 font-medium flex items-center gap-2 border-b border-gray-100"
              >
                <Add size={14} />
                Add &quot;{inputValue.trim()}&quot; as new type
              </div>
            )}
            
            {/* Show existing types that match the filter */}
            {filteredOptions.length > 0 && (
              <>
                {allowCustom && inputValue.trim() && !findMatchingOption(inputValue) && (
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                    Existing Types
                  </div>
                )}
                {filteredOptions.map((option) => (
                  <div
                    key={option}
                    onClick={() => selectOption(option)}
                    className="px-3 py-2 cursor-pointer hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 border-b border-gray-50 last:border-b-0 text-sm"
                  >
                    <Setting5 size={12} />
                    {option}
                  </div>
                ))}
              </>
            )}
            
            {/* Show empty state if no matches and no input */}
            {filteredOptions.length === 0 && !inputValue.trim() && (
              <div className="p-4 text-center text-gray-500 text-sm italic">
                Start typing to create a new product type...
              </div>
            )}
            
            {/* Show no matches state */}
            {filteredOptions.length === 0 && inputValue.trim() && availableTypes.length > 0 && allowCustom && (
              <div className="p-4 text-center text-gray-500 text-sm italic">
                No matching types found. Press Enter to create &quot;{inputValue.trim()}&quot;
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ProductTable: React.FC<ProductTableProps> = ({
  products,
  isEditable = false,
  onProductUpdate,
  onProductDelete,
  showActions = true,
  title = "Products",
  availableProductTypes = [],
  onAddNewType,
  editMode = false,
  cacheSaveStatus = 'idle'
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingField, setEditingField] = useState<{rowIndex: number, field: keyof Product} | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchFilter, setSearchFilter] = useState('all') // 'all', 'product_name', 'product_type', 'brand_name', etc.

  const normalizedProductTypes = useMemo(() => {
    const set = new Set<string>()
    PRODUCT_CATEGORY_OPTIONS.forEach(option => {
      const cleaned = option.trim()
      if (cleaned) set.add(cleaned)
    })
    availableProductTypes.forEach(option => {
      if (!option) return
      const cleaned = option.trim()
      if (cleaned) set.add(cleaned)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [availableProductTypes])

  // Helper function - define before useMemo
  const getProductName = (product: Product) => {
    return product.product_name || product.name || product.original_name || 'Unknown Product'
  }

  const getProductTypeStyle = (productType: string | undefined) => {
    if (productType === 'AI_FAILED') {
      return 'bg-red-100 text-red-800'
    }
    return 'bg-green-100 text-green-800'
  }

  const levenshtein = useCallback((a: string, b: string) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const matrix: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }, []);

  const tokenMatches = useCallback((value: string, tokens: string[]) => {
    if (!tokens.length) return true;
    const normalized = value.toLowerCase();
    return tokens.every((token) => {
      if (normalized.includes(token)) return true;
      const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);
      const tolerance = Math.max(1, Math.floor(token.length * 0.3));
      return words.some((word) => levenshtein(word, token) <= tolerance);
    });
  }, [levenshtein]);

  // Intelligent search filtering with stable product references
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products

    const searchTokens = searchTerm
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    
    return products.filter((product, originalIndex) => {
      // Add original index to maintain reference
      const productWithIndex = { ...product, __originalIndex: originalIndex }
      
      const searchableFields = {
        product_name: getProductName(product),
        product_type: product.product_type || '',
        brand_name: product.brand_name || '',
        size: product.sizeRaw || String(product.size || ''),
        variety: product.variety || '',
        price: product.price || '',
        model_used: product.model_used || ''
      }

      const matches = searchFilter === 'all' 
        ? Object.values(searchableFields).some((value) => tokenMatches(value, searchTokens))
        : tokenMatches(searchableFields[searchFilter as keyof typeof searchableFields] || '', searchTokens)

      return matches
    }).map((product, filteredIndex) => ({
      ...product,
      __filteredIndex: filteredIndex
    }))
  }, [products, searchTerm, searchFilter, tokenMatches])

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Highlight matching text in search results
  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text

    const parts = text.split(new RegExp(`(${escapeRegExp(search)})`, 'gi'))

    return parts.map((part, index) => (
      index % 2 === 1 ? (
        <span key={`${part}-${index}`} className="bg-yellow-200 text-yellow-900 px-1 rounded">
          {part}
        </span>
      ) : part
    ))
  }

  const showModelColumn = useMemo(() => products.some(p => p.model_used), [products])
  const showConfidenceColumn = useMemo(() => products.some(p => p.confidence), [products])

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    setEditingProduct({ ...products[index] })
  }

  const handleSave = () => {
    if (editingIndex !== null && editingProduct && onProductUpdate) {
      onProductUpdate(editingIndex, editingProduct)
    }
    setEditingIndex(null)
    setEditingProduct(null)
  }

  const handleCancel = () => {
    setEditingIndex(null)
    setEditingProduct(null)
  }

  // Generate a stable key for each product
  const getProductKey = useCallback((product: Product, filteredIndex: number) => {
    // Use multiple identifiers to create a stable key
    const identifiers = [
      product.original_name,
      product.product_name || product.name,
      product.price,
      product.image_url
    ].filter(Boolean).join('|')
    
    // Fallback to content hash if no clear identifiers
    const contentHash = identifiers || `${filteredIndex}-${JSON.stringify(product).slice(0, 50)}`
    return contentHash
  }, [])

  const resolveOriginalIndex = useCallback((product: Product & { __originalIndex?: number }) => {
    const indexedProduct = product as Product & { __originalIndex?: number }
    if (indexedProduct.__originalIndex !== undefined) {
      return indexedProduct.__originalIndex
    }

    return products.findIndex(p => (
      (p.original_name && p.original_name === product.original_name) ||
      (p.product_name === product.product_name &&
       p.price === product.price &&
       p.image_url === product.image_url)
    ))
  }, [products])

  const handleFieldUpdate = (filteredIndex: number, field: keyof Product, value: string) => {
    if (onProductUpdate) {
      console.log(`📝 Field update: ${field} = "${value}" at filtered index ${filteredIndex}`)
      
      // Get the target product from filtered results
      const targetProduct = filteredProducts[filteredIndex]
      
      // Use the original index if available, otherwise find it
      const originalIndex = resolveOriginalIndex(targetProduct as Product & { __originalIndex?: number })
      
      if (originalIndex !== -1 && originalIndex !== undefined) {
        const updatedProduct = { ...products[originalIndex], [field]: value }
        console.log(`✏️ Updating product at original index ${originalIndex}:`, updatedProduct.product_name || updatedProduct.name)
        onProductUpdate(originalIndex, updatedProduct)
      } else {
        console.error('Could not find original product index for update')
      }
    }
  }

  const clearBrandName = (filteredIndex: number) => {
    const targetProduct = filteredProducts[filteredIndex]
    
    const originalIndex = resolveOriginalIndex(targetProduct as Product & { __originalIndex?: number })

    if (originalIndex !== -1 && originalIndex !== undefined && onProductUpdate) {
      const updatedProduct = { ...products[originalIndex], brand_name: '' }
      onProductUpdate(originalIndex, updatedProduct)
    }
  }

  const startFieldEdit = (rowIndex: number, field: keyof Product) => {
    if (editMode) {
      setEditingField({ rowIndex, field })
    }
  }

  const stopFieldEdit = () => {
    setEditingField(null)
  }

  const isFieldEditing = (rowIndex: number, field: keyof Product) => {
    return editingField?.rowIndex === rowIndex && editingField?.field === field
  }

  const handleEditableInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      stopFieldEdit()
    }
  }

  const renderEditableTextCell = ({
    rowIndex,
    field,
    updateField,
    displayValue,
    inputValue,
    placeholder = 'N/A',
    onClear,
    clearTitle,
    showClearOnHover = false,
    displayClassName = 'text-sm text-gray-900'
  }: RenderEditableTextCellArgs) => {
    const isEditing = editMode && isFieldEditing(rowIndex, field)
    const effectiveUpdateField = updateField ?? field
    const displayString = displayValue !== undefined && displayValue !== null && displayValue !== ''
      ? String(displayValue)
      : ''
    const inputString = inputValue ?? displayString
    const hasValue = displayString.length > 0
    const displayContent = hasValue ? highlightText(displayString, searchTerm) : placeholder

    if (!editMode) {
      return (
        <div className={displayClassName}>
          {displayContent}
        </div>
      )
    }

    if (isEditing) {
      return (
        <div className={`flex items-center ${onClear ? 'space-x-2' : ''}`}>
          <input
            type="text"
            value={inputString}
            onChange={(event) => handleFieldUpdate(rowIndex, effectiveUpdateField, event.target.value)}
            onBlur={stopFieldEdit}
            onKeyDown={handleEditableInputKeyDown}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {onClear && (
            <button
              type="button"
              onClick={() => {
                onClear()
                stopFieldEdit()
              }}
              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
              title={clearTitle || 'Clear value'}
            >
              <CloseCircle size={16} />
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="flex items-center space-x-2">
        <div
          className={`${displayClassName} ${editMode ? 'cursor-pointer hover:bg-gray-100 rounded px-2 py-1' : ''}`}
          onClick={() => startFieldEdit(rowIndex, field)}
        >
          {displayContent}
        </div>
        {onClear && hasValue && (
          <button
            type="button"
            onClick={onClear}
            className={`p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded ${showClearOnHover ? 'opacity-0 group-hover:opacity-100 transition-opacity' : ''}`}
            title={clearTitle || 'Clear value'}
          >
            <CloseCircle size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 relative">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {title} ({filteredProducts.length}{filteredProducts.length !== products.length ? ` of ${products.length}` : ''})
            </h3>
            
            {/* Cache Save Status Indicator */}
            {editMode && cacheSaveStatus !== 'idle' && (
              <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                cacheSaveStatus === 'saving' ? 'bg-blue-100 text-blue-700' :
                cacheSaveStatus === 'saved' ? 'bg-green-100 text-green-700' :
                'bg-red-100 text-red-700'
              }`}>
                {cacheSaveStatus === 'saving' && (
                  <>
                    <div className="animate-spin h-3 w-3 border border-blue-400 border-t-transparent rounded-full"></div>
                    <span>Saving edits...</span>
                  </>
                )}
                {cacheSaveStatus === 'saved' && (
                  <>
                    <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                    <span>All edits saved ✓</span>
                  </>
                )}
                {cacheSaveStatus === 'error' && (
                  <>
                    <div className="h-3 w-3 bg-red-500 rounded-full"></div>
                    <span>Save failed</span>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Search Controls */}
          <div className="flex items-center space-x-3">
            {/* Search Filter Dropdown */}
            <select
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Fields</option>
              <option value="product_name">Product Name</option>
              <option value="product_type">Product Type</option>
              <option value="brand_name">Brand Name</option>
              <option value="size">Size</option>
              <option value="variety">Variety</option>
              <option value="price">Price</option>
              <option value="model_used">Model</option>
            </select>
            
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder={`Search ${searchFilter === 'all' ? 'all fields' : searchFilter.replace('_', ' ')}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <SearchNormal1 
                size={16} 
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" 
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <CloseCircle size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
        
        {/* Search Results Info */}
        {searchTerm && (
          <div className="mt-2 text-sm text-gray-600">
            {filteredProducts.length === 0 ? (
              <span className="text-red-600">No products found matching &ldquo;{searchTerm}&rdquo;</span>
            ) : (
              <span>
                Found {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} 
                {searchFilter !== 'all' && ` in ${searchFilter.replace('_', ' ')}`} 
                matching &ldquo;{searchTerm}&rdquo;
              </span>
            )}
          </div>
        )}
      </div>
      
      <div className="overflow-x-auto overflow-y-visible" style={{ overflowY: 'visible' }}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                #
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                Image
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product Name
                {editMode && <div className="text-xs text-gray-400 normal-case">Click to edit</div>}
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product Type
                {editMode && <div className="text-xs text-gray-400 normal-case">Click to edit</div>}
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Brand
                {editMode && <div className="text-xs text-gray-400 normal-case">Click to edit</div>}
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
                {editMode && <div className="text-xs text-gray-400 normal-case">Click to edit</div>}
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Variety
                {editMode && <div className="text-xs text-gray-400 normal-case">Click to edit</div>}
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
                {editMode && <div className="text-xs text-gray-400 normal-case">Click to edit</div>}
              </th>
              {showModelColumn && (
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Model
                </th>
              )}
              {showConfidenceColumn && (
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
              )}
              {(showActions && editMode) && (
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, index) => {
                const originalIndex = resolveOriginalIndex(product as Product & { __originalIndex?: number })
                const displayIndex = searchTerm
                  ? index + 1
                  : (originalIndex !== -1 && originalIndex !== undefined
                      ? originalIndex + 1
                      : index + 1)

                return (
                <motion.tr 
                  key={getProductKey(product, index)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.02 }}
                  className="hover:bg-gray-50 group"
                >
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      {displayIndex}
                    </div>
                  </td>
                  
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="w-12 h-12 flex-shrink-0">
                      {product.image_url ? (
                        <div className="relative w-12 h-12">
                          <Image
                            className="rounded-lg object-cover cursor-pointer hover:scale-110 transition-transform"
                            src={product.image_url}
                            alt={getProductName(product)}
                            fill
                            sizes="48px"
                            unoptimized
                            onClick={() => window.open(product.image_url, '_blank')}
                            onError={(e) => {
                              console.warn('Image load failed', product.image_url);
                              const target = e.target as HTMLImageElement;
                              if (target.parentElement) {
                                target.parentElement.style.display = 'none';
                                target.parentElement.nextElementSibling?.setAttribute('style', 'display: flex');
                              }
                            }}
                          />
                        </div>
                      ) : null}
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs" style={{ display: product.image_url ? 'none' : 'flex' }}>
                        No Image
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-4">
                    <div className="max-w-xs">
                      {renderEditableTextCell({
                        rowIndex: index,
                        field: 'product_name',
                        displayValue: getProductName(product),
                        inputValue: getProductName(product),
                        displayClassName: 'text-sm font-medium text-gray-900 break-words'
                      })}
                    </div>
                  </td>

                  <td className="px-3 py-4 relative">
                    <div className="min-w-[150px]">
                      {editMode && isFieldEditing(index, 'product_type') ? (
                        <EditableProductTypeDropdown
                          value={product.product_type}
                          onChange={(value) => {
                            handleFieldUpdate(index, 'product_type', value)
                            stopFieldEdit()
                          }}
                          index={index}
                          availableTypes={normalizedProductTypes}
                          onAddNewType={onAddNewType}
                          allowCustom={false}
                        />
                      ) : (
                        <span 
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getProductTypeStyle(product.product_type)} ${editMode ? 'cursor-pointer hover:opacity-80' : ''}`}
                          onClick={() => startFieldEdit(index, 'product_type')}
                        >
                          {highlightText(product.product_type || 'N/A', searchTerm)}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-4 whitespace-nowrap">
                    {renderEditableTextCell({
                      rowIndex: index,
                      field: 'brand_name',
                      displayValue: product.brand_name,
                      onClear: () => clearBrandName(index),
                      clearTitle: 'Clear brand name',
                      showClearOnHover: true,
                      displayClassName: 'flex-1 text-sm text-gray-900'
                    })}
                  </td>

                  <td className="px-3 py-4 whitespace-nowrap">
                    {renderEditableTextCell({
                      rowIndex: index,
                      field: 'size',
                      updateField: 'sizeRaw',
                      displayValue: product.sizeRaw || (product.size !== undefined ? String(product.size) : ''),
                      inputValue: product.sizeRaw || (product.size !== undefined ? String(product.size) : '')
                    })}
                  </td>

                  <td className="px-3 py-4 whitespace-nowrap">
                    {renderEditableTextCell({
                      rowIndex: index,
                      field: 'variety',
                      displayValue: product.variety
                    })}
                  </td>

                  <td className="px-3 py-4 whitespace-nowrap">
                    {renderEditableTextCell({
                      rowIndex: index,
                      field: 'price',
                      displayValue: product.price
                    })}
                  </td>

                  {showModelColumn && (
                    <td className="px-3 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                        {product.model_used ? highlightText(product.model_used, searchTerm) : 'N/A'}
                      </span>
                    </td>
                  )}

                  {showConfidenceColumn && (
                    <td className="px-3 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {product.confidence ? `${Math.round(product.confidence * 100)}%` : 'N/A'}
                      </div>
                    </td>
                  )}

                  {(showActions && editMode) && (
                    <td className="px-3 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {onProductDelete && (
                          <motion.button
                            onClick={() => {
                              if (originalIndex !== -1 && originalIndex !== undefined) {
                                onProductDelete(originalIndex)
                              }
                            }}
                            className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            title="Delete product"
                          >
                            <Trash size={16} />
                          </motion.button>
                        )}
                      </div>
                    </td>
                  )}
                </motion.tr>
              )})}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      
      {filteredProducts.length === 0 && (
        <div className="px-6 py-12 text-center">
          {searchTerm ? (
            <>
              <div className="text-gray-500 text-lg mb-2">No products match your search</div>
              <div className="text-gray-400 text-sm mb-4">
                Try adjusting your search term or filter to find what you&rsquo;re looking for
              </div>
              <button
                onClick={() => setSearchTerm('')}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                <CloseCircle size={16} className="mr-2" />
                Clear Search
              </button>
            </>
          ) : (
            <>
              <div className="text-gray-500 text-lg mb-2">No products available</div>
              <div className="text-gray-400 text-sm">Upload a JSON file to get started</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ProductTable

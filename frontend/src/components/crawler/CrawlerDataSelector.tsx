"use client"

import { useState, useEffect, useCallback } from 'react'
import { crawlerAPI } from '@/lib/api'
import { useGlobalToast } from '@/contexts/ToastContext'
import { FolderOpen, Document, Refresh } from 'iconsax-react'
import { PrimaryButton, OutlineButton } from '@/components/ui/Button'

interface CrawlerDataSelectorProps {
  onDataLoad: (data: any[], sourceInfo?: { store?: string; category?: string }) => void;
  onClose: () => void;
}

interface CrawlerResult {
  crawler_id: string;
  store: string;
  category: string;
  status: string;
  results: any[];
  created_at: string;
  last_updated: string;
  count?: number;
  cloud_path?: string;
  output_file?: string;
}

interface FileInfo {
  store: string;
  category: string;
  filename: string;
  size: number;
  modified: string;
  type: string;
}

export default function CrawlerDataSelector({ onDataLoad, onClose }: CrawlerDataSelectorProps) {
  const [activeTab, setActiveTab] = useState<'results' | 'files'>('results')
  const [crawlerResults, setCrawlerResults] = useState<CrawlerResult[]>([])
  const [outputFiles, setOutputFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'store'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const { success, error: showError, info } = useGlobalToast()

  // Remove sample data functionality
  
  // Sort functions
  const sortItems = (items: any[], type: 'results' | 'files') => {
    return [...items].sort((a, b) => {
      let compareValue = 0
      
      if (type === 'results') {
        switch (sortBy) {
          case 'name':
            compareValue = (a.store + a.category).localeCompare(b.store + b.category)
            break
          case 'date':
            compareValue = new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime()
            break
          case 'size':
            compareValue = (a.results?.length || 0) - (b.results?.length || 0)
            break
          case 'store':
            compareValue = a.store.localeCompare(b.store)
            break
        }
      } else {
        switch (sortBy) {
          case 'name':
            compareValue = a.filename.localeCompare(b.filename)
            break
          case 'date':
            compareValue = new Date(a.modified).getTime() - new Date(b.modified).getTime()
            break
          case 'size':
            compareValue = a.size - b.size
            break
          case 'store':
            compareValue = a.store.localeCompare(b.store)
            break
        }
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue
    })
  }

  const fetchCrawlerResults = useCallback(async () => {
    setLoading(true)
    try {
      const response = await crawlerAPI.getAllResults()
      console.log('Crawler results response:', response)
      
      // Handle different response formats
      let results: CrawlerResult[] = []
      if (Array.isArray(response)) {
        results = response
      } else if (response.results) {
        // Handle case where results is an object with crawler IDs as keys
        if (typeof response.results === 'object' && !Array.isArray(response.results)) {
          results = Object.values(response.results).map((result: any) => ({
            crawler_id: result.crawler_id,
            store: result.store,
            category: result.category,
            status: 'completed', // Assume completed if we have results
            results: result.items || [],
            count: result.count || (result.items ? result.items.length : 0),
            cloud_path: result.cloud_path,
            output_file: result.output_file,
            created_at: result.completed_at || new Date().toISOString(),
            last_updated: result.completed_at || new Date().toISOString()
          }))
        } else if (Array.isArray(response.results)) {
          results = response.results
        }
      } else if (response.data && Array.isArray(response.data)) {
        results = response.data
      } else if (response.error) {
        console.warn('Crawler API error:', response.error)
        showError('Crawler Error', response.error)
        results = []
      } else {
        console.warn('Unexpected crawler results format:', response)
        results = []
      }
      
      // If we have few results, also fetch from files to populate the list
      if (results.length < 5) {
        try {
          const filesResponse = await crawlerAPI.getOutputFiles()
          if (filesResponse.files && Array.isArray(filesResponse.files)) {
            // Create result entries from files that aren't already in results
            const existingKeys = new Set(results.map(r => `${r.store}_${r.category}`))
            
            for (const file of filesResponse.files) {
              const key = `${file.store}_${file.category}`
              // Only add if we don't already have a result for this store/category
              if (!existingKeys.has(key)) {
                const fileResult: CrawlerResult = {
                  crawler_id: `file_${file.store}_${file.category}_${Date.now()}`,
                  store: file.store || 'unknown',
                  category: file.category || 'general',
                  status: 'completed',
                  results: [], // Will be lazy-loaded when selected
                  count: file.metadata?.count || file.metadata?.item_count || 0,
                  cloud_path: file.name,
                  output_file: file.name,
                  created_at: file.updated || file.modified || new Date().toISOString(),
                  last_updated: file.updated || file.modified || new Date().toISOString()
                }
                results.push(fileResult)
                existingKeys.add(key)
              }
            }
          }
        } catch (fileError) {
          console.warn('Could not fetch files to populate results:', fileError)
        }
      }
      
      setCrawlerResults(results)
      
      // Show info if no results but API was successful
      if (results.length === 0 && !response.error) {
        info('No Results', 'No crawler results found. Try running some crawlers first.')
      }
    } catch (error) {
      console.error('Error fetching crawler results:', error)
      setCrawlerResults([]) // Ensure it's always an array
      showError('Failed to fetch crawler results', 'Could not load crawler results. The crawler system may not be available.')
    } finally {
      setLoading(false)
    }
  }, [showError, info])

  const fetchOutputFiles = useCallback(async () => {
    setLoading(true)
    try {
      const response = await crawlerAPI.getOutputFiles()
      console.log('Output files response:', response)
      
      // Handle different response formats
      let files = []
      if (Array.isArray(response)) {
        files = response
      } else if (response.files && Array.isArray(response.files)) {
        files = response.files
      } else if (response.data && Array.isArray(response.data)) {
        files = response.data
      } else if (response.cloud_files && Array.isArray(response.cloud_files)) {
        files = response.cloud_files
      } else if (response.local_files && Array.isArray(response.local_files)) {
        files = response.local_files
      } else {
        console.warn('Unexpected output files format:', response)
        files = []
      }
      
      // Transform files to expected format if needed
      const transformedFiles = files.map((file: any, index: number) => {
        if (typeof file === 'string') {
          // Simple filename string
          const parts = file.split('_')
          const store = parts[0] || 'unknown'
          const category = parts.slice(1, -1).join('_') || 'general'
          return {
            store,
            category,
            filename: file,
            size: 0,
            modified: new Date().toISOString(),
            type: 'json'
          }
        } else if (file.name || file.filename) {
          // File object from the API response
          return {
            store: file.store || file.metadata?.store || 'unknown',
            category: file.category || file.metadata?.category || 'general',
            filename: file.name || file.filename,
            size: file.size || 0,
            modified: file.updated || file.modified || file.lastModified || new Date().toISOString(),
            type: file.type || 'json'
          }
        } else {
          // Unknown format, create default
          return {
            store: 'unknown',
            category: 'general',
            filename: `file_${index}.json`,
            size: 0,
            modified: new Date().toISOString(),
            type: 'json'
          }
        }
      })
      
      setOutputFiles(transformedFiles)
    } catch (error) {
      console.error('Error fetching output files:', error)
      setOutputFiles([]) // Ensure it's always an array
      showError('Failed to fetch output files', 'Could not load output files')
    } finally {
      setLoading(false)
    }
  }, [showError])

  useEffect(() => {
    if (activeTab === 'results') {
      fetchCrawlerResults()
    } else if (activeTab === 'files') {
      fetchOutputFiles()
    }
  }, [activeTab, fetchCrawlerResults, fetchOutputFiles])

  const handleItemSelection = (id: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedItems(newSelected)
  }

  const handleLoadSelected = async () => {
    if (selectedItems.size === 0) {
      showError('No Selection', 'Please select at least one item to load')
      return
    }

    setLoading(true)
    try {
      let allProducts: any[] = []

      if (activeTab === 'results') {
        // Load from crawler results
        for (const crawlerId of Array.from(selectedItems)) {
          const result = crawlerResults.find(r => r.crawler_id === crawlerId)
          if (result) {
            if (result.results && result.results.length > 0) {
              allProducts = [...allProducts, ...result.results]
            } else if ((result.count && result.count > 0) && (result.cloud_path || result.output_file)) {
               // Lazy load from file if results are empty but file exists (Cloud Mode)
               const filename = result.cloud_path 
                  ? result.cloud_path.split('/').pop() 
                  : (result.output_file ? result.output_file.split('/').pop() : null);
               
               if (filename) {
                  try {
                    const response = await crawlerAPI.loadFile(result.store, filename, result.category);
                    if (response && response.success) {
                       let products = [];
                       if (response.items && Array.isArray(response.items)) products = response.items;
                       else if (response.data && Array.isArray(response.data)) products = response.data;
                       // Handle other formats similar to below
                       
                       if (products.length > 0) {
                           allProducts = [...allProducts, ...products];
                       }
                    }
                  } catch (e) {
                      console.error(`Error lazy loading result ${crawlerId}`, e);
                  }
               }
            }
          }
        }
      } else if (activeTab === 'files') {
        // Load from files
        for (const fileId of Array.from(selectedItems)) {
          const fileInfo = outputFiles.find(f => `${f.store}/${f.filename}` === fileId)
          if (fileInfo) {
            try {
              const response = await crawlerAPI.loadFile(fileInfo.store, fileInfo.filename, fileInfo.category)
              console.log('File load response:', response)
              
              if (response && response.success) {
                // Handle the response format from the API
                let products = []
                if (response.items && Array.isArray(response.items)) {
                  products = response.items
                } else if (Array.isArray(response.content)) {
                  products = response.content
                } else if (response.content && response.content.items && Array.isArray(response.content.items)) {
                  products = response.content.items
                } else if (response.content && response.content.products && Array.isArray(response.content.products)) {
                  products = response.content.products
                } else if (response.content && response.content.data && Array.isArray(response.content.data)) {
                  products = response.content.data
                }
                
                // Map the products to include store and category info
                if (products.length > 0) {
                  const enrichedProducts = products.map((product: any) => ({
                    ...product,
                    store: fileInfo.store,
                    category: fileInfo.category,
                    name: product.product_name || product.name || product.title || 'Unknown Product',
                    description: product.description || product.desc || ''
                  }))
                  allProducts = [...allProducts, ...enrichedProducts]
                }
              } else {
                console.warn('File load failed:', response)
                showError('File Load Error', `Failed to load file: ${fileInfo.filename}`)
              }
            } catch (error) {
              console.error(`Error loading file ${fileInfo.filename}:`, error)
              showError('File Load Error', `Failed to load file: ${fileInfo.filename}`)
            }
          }
        }
      }

      if (allProducts.length > 0) {
        // Determine source information for download naming
        let sourceInfo = { store: 'unknown', category: 'unknown' };
        
        // Get source info from the first product or selected items
        if (activeTab === 'results' && selectedItems.size > 0) {
          const firstResultId = Array.from(selectedItems)[0];
          const result = crawlerResults.find(r => r.crawler_id === firstResultId);
          if (result) {
            sourceInfo = { store: result.store, category: result.category };
          }
        } else if (activeTab === 'files' && selectedItems.size > 0) {
          const firstFileId = Array.from(selectedItems)[0];
          const fileInfo = outputFiles.find(f => `${f.store}/${f.filename}` === firstFileId);
          if (fileInfo) {
            sourceInfo = { store: fileInfo.store, category: fileInfo.category };
          }
        }

        // Transform products to match the expected format
        const transformedProducts = allProducts.map((product, index) => ({
          id: product.id || `imported_${index}`,
          name: product.name || product.product_name || product.title || 'Unknown Product',
          description: product.description || product.desc || '',
          product_type: product.product_type || '',
          brand_name: product.brand_name || '',
          product_name: product.product_name || product.name || product.title || '',
          size: product.size || '',
          variety: product.variety || '',
          confidence: product.confidence || 0,
          model_used: product.model_used || '',
          processing_time: product.processing_time || 0,
          // Map image field correctly - ProductTable expects image_url
          image_url: product.image_url || product.image || product.img || '',
          price: product.price || '',
          // Include original data for reference
          original_data: product
        }))

        onDataLoad(transformedProducts, sourceInfo)
        const dataSource = activeTab === 'results' ? 'crawler results' : 'output files'
        success('Data Loaded', `Successfully loaded ${transformedProducts.length} products from ${dataSource}`)
        onClose()
      } else {
        showError('No Data Found', 'No products found in selected items')
      }
    } catch (error) {
      console.error('Error loading data:', error)
      showError('Load Error', 'Failed to load selected data')
    } finally {
      setLoading(false)
    }
  }

  const renderResultsTab = () => (
    <div className="space-y-4">
      {/* Sort Controls */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="date">Date Updated</option>
            <option value="name">Name (Store + Category)</option>
            <option value="size">Product Count</option>
            <option value="store">Store</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
            <span>{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
          </button>
        </div>
        <div className="text-sm text-gray-500">
          {crawlerResults.length} results
        </div>
      </div>

      {/* Results Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">Loading crawler results...</p>
            <p className="text-gray-500 text-sm mt-1">Please wait while we fetch the latest data</p>
          </div>
        ) : crawlerResults.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen size={64} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No crawler results found</h3>
            <p className="text-gray-500 mb-4">Start a crawler to see results here, or try refreshing the data.</p>
            <button
              onClick={fetchCrawlerResults}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Refresh Results
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(crawlerResults.map(r => r.crawler_id)))
                      } else {
                        setSelectedItems(new Set())
                      }
                    }}
                    checked={selectedItems.size === crawlerResults.length && crawlerResults.length > 0}
                    className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Store</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Products</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortItems(crawlerResults, 'results').map((result) => (
                <tr
                  key={result.crawler_id}
                  className={`cursor-pointer transition-colors ${
                    selectedItems.has(result.crawler_id)
                      ? 'bg-primary/5'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleItemSelection(result.crawler_id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(result.crawler_id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        handleItemSelection(result.crawler_id)
                      }}
                      className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <FolderOpen size={16} className="text-gray-400" />
                      <span className="font-medium text-gray-900 capitalize">{result.store}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-600 capitalize">{result.category.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                      result.status === 'completed' ? 'bg-green-100 text-green-800' : 
                      result.status === 'running' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'
                    }`}>
                      {result.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {result.count || result.results?.length || 0}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(result.created_at).toLocaleDateString()} {new Date(result.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(result.last_updated).toLocaleDateString()} {new Date(result.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

  const renderFilesTab = () => (
    <div className="space-y-4">
      {/* Sort Controls */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="date">Date Modified</option>
            <option value="name">Filename</option>
            <option value="size">File Size</option>
            <option value="store">Store</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
            <span>{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
          </button>
        </div>
        <div className="text-sm text-gray-500">
          {outputFiles.length} files
        </div>
      </div>

      {/* Files Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">Loading output files...</p>
            <p className="text-gray-500 text-sm mt-1">Scanning for available files</p>
          </div>
        ) : outputFiles.length === 0 ? (
          <div className="text-center py-12">
            <Document size={64} className="mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No output files found</h3>
            <p className="text-gray-500 mb-4">No crawler output files are available, or they may not have been generated yet.</p>
            <button
              onClick={fetchOutputFiles}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Refresh Files
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(outputFiles.map(f => `${f.store}/${f.filename}`)))
                      } else {
                        setSelectedItems(new Set())
                      }
                    }}
                    checked={selectedItems.size === outputFiles.length && outputFiles.length > 0}
                    className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filename</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Store</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Modified</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortItems(outputFiles, 'files').map((file) => {
                const fileId = `${file.store}/${file.filename}`
                return (
                  <tr
                    key={fileId}
                    className={`cursor-pointer transition-colors ${
                      selectedItems.has(fileId)
                        ? 'bg-primary/5'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleItemSelection(fileId)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(fileId)}
                        onChange={(e) => {
                          e.stopPropagation()
                          handleItemSelection(fileId)
                        }}
                        className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <Document size={16} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 text-sm truncate">{file.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-900 capitalize font-medium">{file.store}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-600 capitalize">{file.category.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {(file.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {file.type || 'JSON'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {new Date(file.modified).toLocaleDateString()} {new Date(file.modified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-xl font-semibold text-gray-900">Load Product Data</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col h-full max-h-[calc(90vh-80px)]">
          {/* Tab Navigation */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('results')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'results'
                    ? 'bg-primary text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Crawler Results
              </button>
              <button
                onClick={() => setActiveTab('files')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === 'files'
                    ? 'bg-primary text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Output Files
              </button>
            </div>
            <button
              onClick={() => activeTab === 'results' ? fetchCrawlerResults() : fetchOutputFiles()}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 hover:bg-gray-100 rounded-md transition-colors"
              title="Refresh data"
            >
              <Refresh size={18} />
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'results' ? renderResultsTab() : renderFilesTab()}
          </div>
          
          {/* Debug Section */}
          <div className="mx-6 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-xs text-gray-600 mb-2 font-medium">Debug Info:</div>
            <div className="text-xs text-gray-500 mb-2">
              Results: {crawlerResults.length} items | Files: {outputFiles.length} items | Selected: {selectedItems.size}
            </div>
            <button
              onClick={() => {
                console.log('Current crawler results:', crawlerResults)
                console.log('Current output files:', outputFiles)
                console.log('Selected items:', Array.from(selectedItems))
                info('Debug Info', 'Check browser console for detailed data')
              }}
              className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
            >
              Log Debug Info
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex space-x-3">
              <OutlineButton onClick={onClose}>
                Cancel
              </OutlineButton>
              <PrimaryButton
                onClick={handleLoadSelected}
                disabled={loading || selectedItems.size === 0}
                className={`px-6 py-2 ${loading || selectedItems.size === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {loading ? 'Loading...' : 'Load Selected'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

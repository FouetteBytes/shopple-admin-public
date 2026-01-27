"use client"

import { useState, useEffect } from 'react'
import { CloseCircle, DocumentDownload, Send2, Copy, Eye } from 'iconsax-react'
import { useGlobalToast } from '@/contexts/ToastContext'
import Image from 'next/image'

interface FileViewerModalProps {
  isOpen: boolean
  onClose: () => void
  store: string
  filename: string
  content: any
  onSendToClassifier?: (products: any[]) => void
}

// Component for handling individual product image loading with fallback
const ProductImage: React.FC<{ 
  src: string, 
  alt: string, 
  className?: string 
}> = ({ src, alt, className = "" }) => {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setHasError(false)
    setIsLoading(true)
  }, [src])

  if (!src || hasError) {
    return (
      <div className={`w-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 ${className}`}>
        <div className="text-center text-gray-400">
          <div className="text-sm">No Image</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className} overflow-hidden bg-gray-50`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 bg-[length:200%_100%] animate-shimmer" />
      )}
      <Image
        src={src}
        alt={alt}
        width={400}
        height={400}
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          setHasError(true)
        }}
        unoptimized
        priority={false}
      />
    </div>
  )
}

const FileViewerModal: React.FC<FileViewerModalProps> = ({
  isOpen,
  onClose,
  store,
  filename,
  content,
  onSendToClassifier
}) => {
  const { success } = useGlobalToast()
  const [viewMode, setViewMode] = useState<'preview' | 'json'>('preview')
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredContent, setFilteredContent] = useState<any[]>([])

  useEffect(() => {
    if (content && content.items) {
      const items = Array.isArray(content.items) ? content.items : []
      if (searchTerm) {
        setFilteredContent(items.filter((item: any) => 
          JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase())
        ))
      } else {
        setFilteredContent(items)
      }
    }
  }, [content, searchTerm])

  if (!isOpen) return null

  const handleSendToClassifier = () => {
    if (onSendToClassifier && content?.items) {
      onSendToClassifier(content.items)
      onClose()
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 2))
    success('Copied', 'Content copied to clipboard!')
  }

  const downloadFile = () => {
    const dataStr = JSON.stringify(content, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">
              {filename}
            </h3>
            <p className="text-sm text-gray-600">
              {store} • {content?.count || filteredContent.length} items
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'preview' ? 'json' : 'preview')}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-1"
            >
              <Eye size={16} />
              {viewMode === 'preview' ? 'JSON' : 'Preview'}
            </button>
            <button
              onClick={copyToClipboard}
              className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md flex items-center gap-1"
            >
              <Copy size={16} />
              Copy
            </button>
            <button
              onClick={downloadFile}
              className="px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-md flex items-center gap-1"
            >
              <DocumentDownload size={16} />
              Download
            </button>
            {onSendToClassifier && (
              <button
                onClick={handleSendToClassifier}
                className="px-3 py-1 text-sm bg-primary hover:bg-primary/90 text-white rounded-md flex items-center gap-1"
              >
                <Send2 size={16} />
                Send to Classifier
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-md"
            >
              <CloseCircle size={20} />
            </button>
          </div>
        </div>

        {/* Search */}
        {viewMode === 'preview' && (
          <div className="p-4 border-b bg-gray-50">
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {viewMode === 'preview' ? (
            <div className="space-y-4">
              {filteredContent.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No items found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredContent.map((item: any, idx: number) => (
                    <div key={idx} className="border rounded-lg overflow-hidden bg-white shadow-sm">
                      {/* Product Image */}
                      {(item.image_url || item.image) && (
                        <ProductImage
                          src={item.image_url || item.image}
                          alt={item.product_name || item.name || 'Product'}
                          className="aspect-square w-full bg-gray-100"
                        />
                      )}
                      
                      <div className="p-4">
                        <h4 className="font-medium text-gray-800 mb-2 text-sm leading-tight" style={{ 
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {item.product_name || item.name || 'Unnamed Product'}
                        </h4>
                        <div className="space-y-1 text-sm text-gray-600">
                          {item.price && (
                            <p><span className="font-medium">Price:</span> {item.price}</p>
                          )}
                          {item.category && (
                            <p><span className="font-medium">Category:</span> {item.category}</p>
                          )}
                          {item.brand && (
                            <p><span className="font-medium">Brand:</span> {item.brand}</p>
                          )}
                          {item.weight && (
                            <p><span className="font-medium">Weight:</span> {item.weight}</p>
                          )}
                          {item.size && (
                            <p><span className="font-medium">Size:</span> {item.size}</p>
                          )}
                          {item.availability && (
                            <p><span className="font-medium">Stock:</span> {item.availability}</p>
                          )}
                          {item.url && (
                            <p>
                              <span className="font-medium">URL:</span>{' '}
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                View Original
                              </a>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4">
              <pre className="text-sm overflow-auto whitespace-pre-wrap">
                {JSON.stringify(content, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {viewMode === 'preview' 
              ? `Showing ${filteredContent.length} of ${content?.count || 0} items`
              : `JSON size: ${JSON.stringify(content).length} characters`
            }
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default FileViewerModal

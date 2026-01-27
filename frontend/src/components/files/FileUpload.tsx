"use client"

import React, { useCallback, useState } from 'react'
import { DocumentUpload, TickCircle, CloseCircle } from 'iconsax-react'
import { motion, AnimatePresence } from 'framer-motion'

interface FileUploadProps {
  onFileUpload: (data: any[]) => void
  isProcessing?: boolean
  className?: string
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileUpload, 
  isProcessing = false, 
  className = '' 
}) => {
  const [dragOver, setDragOver] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState('')

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    const file = files[0]
    
    // Validate file type
    if (!file.name.endsWith('.json')) {
      setUploadStatus('error')
      setUploadMessage('Please upload a JSON file')
      setTimeout(() => setUploadStatus('idle'), 3000)
      return
    }

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      // Handle both old format (direct array) and new format (with metadata)
      let products: any[];
      
      if (Array.isArray(data)) {
        // Old format: direct array of products
        products = data;
      } else if (data.results && Array.isArray(data.results)) {
        // New format: products are in the 'results' field
        products = data.results;
      } else {
        throw new Error('JSON file must contain an array of products or have a "results" field with products')
      }

      if (products.length === 0) {
        throw new Error('JSON file contains no products')
      }

      // Normalize product data - map product_name to name if needed
      const normalizedData = products.map(item => {
        // If product has product_name but no name, map it
        if (item.product_name && !item.name) {
          return { ...item, name: item.product_name }
        }
        return item
      })

      // Validate each product has required fields
      const invalidProducts = normalizedData.filter(item => !item.name || typeof item.name !== 'string')
      if (invalidProducts.length > 0) {
        throw new Error(`${invalidProducts.length} products are missing required 'name' or 'product_name' field`)
      }

      setUploadStatus('success')
      setUploadMessage(`Successfully loaded ${normalizedData.length} products`)
      onFileUpload(normalizedData)
      
      setTimeout(() => setUploadStatus('idle'), 3000)
    } catch (error) {
      setUploadStatus('error')
      setUploadMessage(error instanceof Error ? error.message : 'Failed to parse JSON file')
      setTimeout(() => setUploadStatus('idle'), 3000)
    }
  }, [onFileUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }, [handleFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }, [handleFiles])

  const getStatusIcon = () => {
    switch (uploadStatus) {
      case 'success':
        return <TickCircle size={24} className='text-green-500' />
      case 'error':
        return <CloseCircle size={24} className='text-red-500' />
      default:
        return isProcessing ? 
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /> :
          <DocumentUpload size={24} className='text-gray-400' />
    }
  }

  const getBorderColor = () => {
    if (uploadStatus === 'success') return 'border-green-300 bg-green-50'
    if (uploadStatus === 'error') return 'border-red-300 bg-red-50'
    if (dragOver) return 'border-primary bg-violet-50'
    return 'border-gray-300 bg-white'
  }

  return (
    <div className={`relative ${className}`}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200
          ${getBorderColor()}
          ${!isProcessing ? 'cursor-pointer hover:border-primary hover:bg-violet-50' : 'cursor-not-allowed'}
        `}
      >
        <input
          type="file"
          accept=".json"
          onChange={handleFileInput}
          disabled={isProcessing}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        
        <motion.div
          initial={{ scale: 1 }}
          animate={{ scale: dragOver ? 1.05 : 1 }}
          className="flex flex-col items-center space-y-4"
        >
          {getStatusIcon()}
          
          <div className="space-y-2">
            <AnimatePresence mode="wait">
              {uploadStatus !== 'idle' ? (
                <motion.div
                  key="status"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-1"
                >
                  <p className={`font-medium ${
                    uploadStatus === 'success' ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {uploadStatus === 'success' ? 'Upload Successful!' : 'Upload Failed'}
                  </p>
                  <p className="text-sm text-gray-600">{uploadMessage}</p>
                </motion.div>
              ) : (
                <motion.div
                  key="default"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-1"
                >
                  <p className="text-gray-700 font-medium">
                    {isProcessing ? 'Processing...' : 'Drop your JSON file here or click to browse'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {isProcessing ? 'Please wait while processing' : 'Supports JSON files with product data'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isProcessing && uploadStatus === 'idle' && (
            <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
              Choose File
            </button>
          )}
        </motion.div>
      </div>
    </div>
  )
}

export default FileUpload

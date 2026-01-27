"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCentralStore } from '@/Store'
import type { Product } from '@/Store'
import { Cpu, Flash, Activity } from 'iconsax-react'

// Simple Progress component
const Progress = ({ value, className = '' }: { value: number; className?: string }) => {
  return (
    <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${className}`}>
      <div 
        className="bg-blue-600 h-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

interface ProcessingProgressProps {
  className?: string
}

const EnhancedProcessingProgress = ({ className = '' }: ProcessingProgressProps) => {
  const {
    isProcessing,
    progress,
    currentProduct,
    currentStep,
    currentModel,
    modelSwitching,
    modelProgress,
    processingLogs,
    modelStats,
    processingStats,
    autoScroll,
    setAutoScroll,
    inputData,
    outputData,
    currentProductIndex,
    processingStartTime
  } = useCentralStore()

  // Debug: Log when component re-renders with new model stats
  console.log(' EnhancedProcessingProgress render, model stats:', modelStats)

  const logsContainerRef = useRef<HTMLDivElement>(null)
  const [liveStats, setLiveStats] = useState({
    elapsedTime: '0s',
    avgTimePerProduct: '0s',
    successful: 0,
    failed: 0,
    processed: 0
  })
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)

  const effectiveStartTime = useMemo(() => (
    typeof processingStartTime === 'number' ? new Date(processingStartTime) : null
  ), [processingStartTime])

  const activeIndex = useMemo(() => {
    if (typeof currentProductIndex === 'number' && currentProductIndex >= 0) {
      return Math.min(currentProductIndex, Math.max(0, inputData.length - 1))
    }

    if (!currentProduct) return null

    const fallbackIndex = inputData.findIndex((product) => {
      const name = product?.name || product?.product_name || product?.original_name
      return name ? name.toLowerCase() === currentProduct.toLowerCase() : false
    })

    return fallbackIndex >= 0 ? fallbackIndex : null
  }, [currentProductIndex, currentProduct, inputData])

  const previousProduct = activeIndex !== null && activeIndex > 0
    ? inputData[activeIndex - 1]
    : null
  const activeProduct = activeIndex !== null && activeIndex < inputData.length
    ? inputData[activeIndex]
    : null
  const fallbackQueue = activeIndex === null ? inputData.slice(0, 4) : []
  const nextProduct = activeIndex !== null && activeIndex + 1 < inputData.length
    ? inputData[activeIndex + 1]
    : (activeIndex === null ? fallbackQueue[0] ?? null : null)
  const upcomingProducts = activeIndex !== null
    ? inputData.slice(activeIndex + 2, activeIndex + 5)
    : fallbackQueue.slice(nextProduct ? 1 : 0)

  const getOutputForIndex = (index: number | null) => {
    if (index === null) return undefined
    if (index < 0) return undefined
    if (index >= outputData.length) return undefined
    return outputData[index]
  }

  // Visually pulse when the currently processing product changes
  useEffect(() => {
    if (activeIndex === null) return
    setHighlightedIndex(activeIndex)
    const timeout = setTimeout(() => setHighlightedIndex(null), 900)
    return () => clearTimeout(timeout)
  }, [activeIndex])

  // Initialize timer when processing starts
  useEffect(() => {
    if (isProcessing && effectiveStartTime) {
      setLiveStats({
        elapsedTime: '0s',
        avgTimePerProduct: '0s',
        successful: 0,
        failed: 0,
        processed: 0
      })
    } else if (!isProcessing) {
      setLiveStats((prev) => ({
        ...prev,
        elapsedTime: '0s',
        avgTimePerProduct: '0s'
      }))
    }
  }, [isProcessing, effectiveStartTime, modelStats])

  // Real-time timer update
  useEffect(() => {
    if (!isProcessing || !effectiveStartTime) return

    const updateLiveStats = () => {
      const elapsed = Math.floor((Date.now() - effectiveStartTime.getTime()) / 1000)

      const hours = Math.floor(elapsed / 3600)
      const minutes = Math.floor((elapsed % 3600) / 60)
      const seconds = elapsed % 60
      
      let timeStr = ''
      if (hours > 0) timeStr += `${hours}h `
      if (minutes > 0) timeStr += `${minutes}m `
      timeStr += `${seconds}s`

      // Calculate processed count from logs and queue position
      const processedFromLogs = processingLogs.filter(log => 
        log.message.includes('✅ Parsed Classification') || 
        log.message.includes('❌ Error')
      ).length
      const processedFromIndex = activeIndex !== null ? activeIndex : 0
      const processedCount = Math.max(processedFromLogs, processedFromIndex)

      const successCount = processingLogs.filter(log => 
        log.message.includes('✅ Parsed Classification')
      ).length

      const failCount = processedCount - successCount

      // Calculate average time per product
      let avgTime = '0s'
      if (processedCount > 0) {
        const avgSeconds = Math.floor(elapsed / processedCount)
        if (avgSeconds >= 60) {
          const avgMin = Math.floor(avgSeconds / 60)
          const avgSec = avgSeconds % 60
          avgTime = `${avgMin}m ${avgSec}s`
        } else {
          avgTime = `${avgSeconds}s`
        }
      }

      // Debug log model stats every 2 seconds (to avoid spam)
      if (elapsed % 2 === 0) {
        console.log(' Current model stats in progress component:', modelStats)
      }

      setLiveStats({
        elapsedTime: timeStr.trim(),
        avgTimePerProduct: avgTime,
        successful: successCount,
        failed: failCount,
        processed: processedCount
      })
    }

    updateLiveStats()
    const timer = setInterval(updateLiveStats, 1000)

    return () => clearInterval(timer)
  }, [isProcessing, effectiveStartTime, processingLogs, modelStats, activeIndex])

  // Auto-scroll behavior
  useEffect(() => {
    if (autoScroll && logsContainerRef.current && processingLogs.length > 0) {
      const container = logsContainerRef.current
      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      }, 50)
    }
  }, [processingLogs, autoScroll])

  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.target as HTMLDivElement
    const isAtBottom = Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 10
    setAutoScroll(isAtBottom)
  }

  const scrollToBottom = () => {
    if (logsContainerRef.current) {
      const container = logsContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }

  const getLogTypeIcon = (type: string) => {
    switch (type) {
      case 'success': return '✅'
      case 'error': return '❌'
      case 'warning': return '⚠️'
      case 'model': return ''
      case 'product': return ''
      case 'ai': return ''
      case 'think': return ''
      case 'think-header': return ''
      case 'response-header': return ''
      case 'complete': return ''
      case 'stats': return ''
      case 'info':
      default: return 'ℹ️'
    }
  }

  const getLogTypeClass = (type: string) => {
    const baseClass = 'px-3 py-2 rounded-lg border-l-4 '
    switch (type) {
      case 'success': return baseClass + 'bg-green-50 border-green-400 text-green-800'
      case 'error': return baseClass + 'bg-red-50 border-red-400 text-red-800'
      case 'warning': return baseClass + 'bg-yellow-50 border-yellow-400 text-yellow-800'
      case 'model': return baseClass + 'bg-blue-50 border-blue-400 text-blue-800'
      case 'product': return baseClass + 'bg-purple-50 border-purple-400 text-purple-800'
      case 'ai': return baseClass + 'bg-indigo-50 border-indigo-400 text-indigo-800'
      case 'think': return baseClass + 'bg-cyan-50 border-cyan-400 text-cyan-800'
      case 'think-header': return baseClass + 'bg-cyan-100 border-cyan-500 text-cyan-900 font-semibold'
      case 'think-content': return baseClass + 'bg-cyan-25 border-cyan-300 text-cyan-700 ml-4 text-sm'
      case 'response-header': return baseClass + 'bg-emerald-100 border-emerald-500 text-emerald-900 font-semibold'
      case 'response': return baseClass + 'bg-emerald-25 border-emerald-300 text-emerald-700 ml-4 font-mono text-sm'
      case 'detail': return baseClass + 'bg-gray-50 border-gray-300 text-gray-700 ml-6 text-sm'
      case 'complete': return baseClass + 'bg-green-100 border-green-500 text-green-900 font-bold'
      case 'stats': return baseClass + 'bg-blue-100 border-blue-500 text-blue-900 font-medium'
      case 'separator': return 'text-gray-400 font-mono text-xs py-1'
      case 'info':
      default: return baseClass + 'bg-gray-50 border-gray-300 text-gray-800'
    }
  }

  const formatLogMessage = (message: string, type: string) => {
    if (type === 'separator') {
      return <div className="border-t border-gray-200 my-2"></div>
    }
    
    if (type === 'think-content' || type === 'response') {
      return (
        <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
          {message}
        </pre>
      )
    }
    
    return <div className="leading-relaxed">{message}</div>
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Progress Header */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isProcessing ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">AI Processing</h3>
              <p className="text-sm text-gray-600">
                {isProcessing ? `Processing ${currentProduct || 'products...'}` : 'Ready to process'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{Math.round(progress)}%</div>
            <div className="text-sm text-gray-600">{currentStep || 'Waiting...'}</div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <Progress value={progress} className="h-3" />
        
        {/* Current Model Info */}
        {currentModel && (
          <div className="mt-4 flex items-center space-x-2">
            <div className={`p-1 rounded ${modelSwitching ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'}`}>
              <Flash className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-gray-900">
              Current Model: {currentModel}
            </span>
            {modelSwitching && (
              <span className="text-xs text-yellow-600 font-medium">
                Switching...
              </span>
            )}
          </div>
        )}

        {/* Model Progress */}
        {modelProgress.step && (
          <div className="mt-2">
            <div className="text-xs text-gray-600 mb-1">{modelProgress.step}</div>
            <Progress value={modelProgress.progress} className="h-1" />
          </div>
        )}
      </div>

      {/* Product Queue Overview */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h4 className="text-lg font-semibold text-gray-900">Live Product Queue</h4>
            <p className="text-sm text-gray-600">
              Keep track of what just finished, what&apos;s running, and what&apos;s coming next.
            </p>
          </div>
          <div className="text-sm text-gray-500 font-medium">
            {activeIndex !== null && inputData.length > 0
              ? `Item ${Math.min(activeIndex + 1, inputData.length)} of ${inputData.length}`
              : inputData.length > 0
                ? `${inputData.length} products queued`
                : 'Queue empty'}
          </div>
        </div>

        {inputData.length === 0 ? (
          <div className="text-center text-gray-500 py-10">
            Load products to see the live queue.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <ProductQueueCard
                label="Previously"
                variant="previous"
                product={previousProduct || null}
                isActive={false}
                output={getOutputForIndex(activeIndex !== null ? activeIndex - 1 : null)}
              />
              <ProductQueueCard
                label={isProcessing ? 'Processing Now' : 'Last Processed'}
                variant="current"
                product={activeProduct || null}
                isActive={isProcessing && highlightedIndex === activeIndex}
                output={getOutputForIndex(activeIndex)}
              />
              <ProductQueueCard
                label="Up Next"
                variant="next"
                product={nextProduct || null}
                isActive={false}
              />
            </div>

            {upcomingProducts.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  In the Pipeline
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {upcomingProducts.map((product, index) => {
                    const label = product.name || product.product_name || product.original_name || 'Unnamed Product'
                    const truncated = label.length > 36 ? `${label.slice(0, 36)}…` : label
                    return (
                      <div
                        key={`${label}-${index}`}
                        className="flex-shrink-0 px-3 py-2 rounded-full bg-slate-100 text-sm text-slate-700"
                      >
                        {truncated}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Model Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg shadow-sm border p-3 text-center">
          <div className="text-xl font-bold text-blue-600">{modelStats.groq}</div>
          <div className="text-xs text-gray-600">1️⃣ GROQ</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-3 text-center">
          <div className="text-xl font-bold text-purple-600">{modelStats.openrouter}</div>
          <div className="text-xs text-gray-600">2️⃣ OpenRouter</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-3 text-center">
          <div className="text-xl font-bold text-indigo-600">{modelStats.gemini}</div>
          <div className="text-xs text-gray-600">3️⃣ GEMINI</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-3 text-center">
          <div className="text-xl font-bold text-cyan-600">{modelStats.cerebras}</div>
          <div className="text-xs text-gray-600">4️⃣ CEREBRAS</div>
        </div>
      </div>

      {/* Processing Stats */}
      {(processingStats.totalTime !== '0s' || isProcessing) && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Processing Statistics</h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {isProcessing ? liveStats.elapsedTime : processingStats.totalTime}
              </div>
              <div className="text-sm text-gray-600">
                {isProcessing ? 'Elapsed Time' : 'Total Time'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {isProcessing ? liveStats.avgTimePerProduct : processingStats.avgTime}
              </div>
              <div className="text-sm text-gray-600">Avg per Product</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {isProcessing ? liveStats.successful : processingStats.successful}
              </div>
              <div className="text-sm text-gray-600">Successful</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {isProcessing ? liveStats.failed : processingStats.failed}
              </div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Logs */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-gray-600" />
            <h4 className="text-lg font-semibold text-gray-900">Processing Logs</h4>
            <span className="text-sm text-gray-600">({processingLogs.length} entries)</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={scrollToBottom}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Scroll to Bottom
            </button>
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`text-sm font-medium px-2 py-1 rounded ${
                autoScroll 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        
        <div 
          ref={logsContainerRef}
          onScroll={handleLogsScroll}
          className="h-96 overflow-y-auto p-4 space-y-2 font-mono text-sm"
        >
          {processingLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No logs yet. Start processing to see detailed progress...
            </div>
          ) : (
            processingLogs.map((log) => (
              <div key={log.id} className={getLogTypeClass(log.type)}>
                <div className="flex items-start space-x-2">
                  <span className="text-xs text-gray-500 mt-1 min-w-[60px]">
                    {log.timestamp}
                  </span>
                  <span className="mt-1">{getLogTypeIcon(log.type)}</span>
                  <div className="flex-1">
                    {formatLogMessage(log.message, log.type)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default EnhancedProcessingProgress

interface ProductQueueCardProps {
  label: string
  variant: 'previous' | 'current' | 'next'
  product: Product | null
  isActive: boolean
  output?: Product
}

const ProductQueueCard = ({ label, variant, product, isActive, output }: ProductQueueCardProps) => {
  const hasProduct = !!product
  const name = hasProduct
    ? product?.name || product?.product_name || product?.original_name || 'Unnamed Product'
    : ''
  const brand = product?.brand_name || product?.variety || ''
  const size = product?.sizeRaw || (product?.size ? `${product.size}${product?.sizeUnit ? ` ${product.sizeUnit}` : ''}` : '')
  const description = [brand, size].filter(Boolean).join(' • ')
  const predictedCategory = output?.product_type || output?.category
  const confidenceValue = typeof output?.confidence === 'number' && !Number.isNaN(output.confidence)
    ? Math.max(0, Math.min(100, Math.round((output.confidence <= 1 ? output.confidence * 100 : output.confidence))))
    : null

  const baseClasses = {
    previous: 'border-slate-200 bg-white',
    current: 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-50',
    next: 'border-purple-200 bg-white'
  }[variant]

  const highlight = variant === 'current' && isActive
    ? 'ring-2 ring-blue-300 shadow-lg scale-[1.01]'
    : 'shadow-sm'

  const statusLabel = !hasProduct
    ? variant === 'previous'
      ? 'Nothing processed yet'
      : variant === 'next'
        ? 'Queue complete'
        : 'Waiting to start'
    : null

  const title = hasProduct ? name : 'Queue idle'

  return (
    <div className={`relative rounded-2xl border transition-all duration-300 ease-out ${baseClasses} ${highlight}`}>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold uppercase tracking-wide ${variant === 'current' ? 'text-blue-600' : 'text-slate-500'}`}>
            {label}
          </span>
          {variant === 'current' && isActive && (
            <span className="flex items-center text-xs font-medium text-blue-600">
              <span className="relative mr-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              Live
            </span>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <ProductThumbnail product={product} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate text-base font-semibold text-gray-900">
              {title}
            </div>
            {hasProduct && description && (
              <div className="truncate text-xs text-gray-500">{description}</div>
            )}
            {predictedCategory && (
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                <span>{predictedCategory}</span>
                {confidenceValue !== null && <span className="text-[10px] text-blue-500">{confidenceValue}%</span>}
              </div>
            )}
            {!hasProduct && statusLabel && (
              <div className="text-xs text-gray-400">{statusLabel}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const ProductThumbnail = ({ product }: { product: Product | null }) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  const imageUrl = product?.image_url?.trim()
  const shouldShowImage = imageUrl && !imageFailed
  const fallbackInitial = (product?.name || product?.product_name || product?.original_name || '?').slice(0, 1).toUpperCase() || '?'

  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-slate-100">
      {shouldShowImage && (
        <img
          src={imageUrl}
          alt={product?.name || product?.product_name || 'Product image'}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      )}
      <div className={`absolute inset-0 flex h-full w-full items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-100 via-white to-blue-50 text-lg font-semibold text-blue-600 transition-opacity duration-300 ${shouldShowImage && imageLoaded ? 'opacity-0' : 'opacity-100'}`}>
        {fallbackInitial || '?'}
      </div>
    </div>
  )
}

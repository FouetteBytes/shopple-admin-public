"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import ApiKeysModal from '@/components/shared/ApiKeysModal'
import { Key as KeyIcon } from 'lucide-react'
import { Add, DocumentUpload, Play, Stop, Refresh, Setting4, Eye, Edit, FolderOpen, CloudAdd, Clock } from 'iconsax-react'
import PageContent from '@/components/layout/PageContent'
import { OutlineButton } from '@/components/ui/Button'
import { useCentralStore } from '@/Store'
import type { ModelStats, Product } from '@/Store'
import FileUpload from '@/components/files/FileUpload'
import { useGlobalToast } from '@/contexts/ToastContext'
import ProductTable from '@/components/products/ProductTable'
import EnhancedProcessingProgress from '@/components/files/EnhancedProcessingProgress'
import CrawlerDataSelector from '@/components/crawler/CrawlerDataSelector'
import { API_BASE_URL, classificationAPI, keysAPI } from '@/lib/api'
import ManualCloudUploader from '@/components/classifier/ManualCloudUploader'
import ClassifierCloudManager from '@/components/classifier/ClassifierCloudManager'
import ClassificationHistoryTimeline from '@/components/history/ClassificationHistoryTimeline'
import type { ClassificationHistoryEvent } from '@/types/classification'
import { formatDateTime } from '@/utils/datetime'
import { PageHero } from '@/components/shared/PageHero'
import { PageHeader } from '@/components/layout/PageHeader'

const PROVIDER_IDS = ['groq', 'openrouter', 'gemini', 'cerebras'] as const
type ProviderKey = typeof PROVIDER_IDS[number]
type ModelOverrides = Partial<Record<ProviderKey, string>>

const PROVIDER_LABELS: Record<ProviderKey, string> = {
    groq: 'Groq',
    openrouter: 'OpenRouter',
    gemini: 'Gemini',
    cerebras: 'Cerebras'
}

const FALLBACK_ALLOWED_MODELS: Record<ProviderKey, string[]> = {
    groq: [],
    openrouter: [],
    gemini: [],
    cerebras: []
}

const cloneAllowedModels = (source: Record<ProviderKey, string[]>) => (
    PROVIDER_IDS.reduce((acc, prov) => {
        acc[prov] = [...(source[prov] || [])]
        return acc
    }, {} as Record<ProviderKey, string[]>)
)

const normalizeModelMap = (source: Partial<Record<string, string[]>> | null | undefined): Record<ProviderKey, string[]> => (
    PROVIDER_IDS.reduce((acc, prov) => {
        const raw = source?.[prov]
        const values = Array.isArray(raw) ? (raw as string[]) : []
        const seen = new Set<string>()
        const cleaned: string[] = []
        values.forEach(item => {
            if (typeof item !== 'string') return
            const trimmed = item.trim()
            if (!trimmed) return
            const key = trimmed.toLowerCase()
            if (seen.has(key)) return
            seen.add(key)
            cleaned.push(trimmed)
        })
        cleaned.sort((a, b) => a.localeCompare(b))
        acc[prov] = cleaned
        return acc
    }, {} as Record<ProviderKey, string[]>)
)

const sanitizeModelSelection = (raw: unknown, allowed: Record<ProviderKey, string[]>) => {
    const input = (raw && typeof raw === 'object') ? raw as Partial<Record<string, string>> : {}
    return PROVIDER_IDS.reduce((acc, prov) => {
        const list = allowed[prov] || []
        const candidateRaw = input?.[prov]
        const candidate = typeof candidateRaw === 'string' ? candidateRaw.trim() : ''
        const resolved = list.includes(candidate) ? candidate : (list[0] || '')
        acc[prov] = resolved
        return acc
    }, {} as Record<ProviderKey, string>)
}

const selectionsEqual = (a: Record<ProviderKey, string>, b: Record<ProviderKey, string>) => (
    PROVIDER_IDS.every(prov => (a[prov] || '') === (b[prov] || ''))
)

const BACKEND_URL = API_BASE_URL

type ClassifierTab = 'workflow' | 'cloud' | 'history'

type TabIconComponent = typeof DocumentUpload

const CLASSIFIER_TABS: Array<{
    key: ClassifierTab
    label: string
    description: string
    icon: TabIconComponent
    accent: {
        icon: string
        glow: string
    }
}> = [
    {
        key: 'workflow',
        label: 'Classifier Flow',
        description: 'Upload, process, and review product batches',
        icon: DocumentUpload,
        accent: {
            icon: 'bg-gradient-to-br from-sky-500 to-indigo-500',
            glow: 'shadow-[0_18px_40px_-24px_rgba(37,99,235,0.7)]',
        },
    },
    {
        key: 'cloud',
        label: 'Cloud Workspace',
        description: 'Manage saved runs and upload external results',
        icon: CloudAdd,
        accent: {
            icon: 'bg-gradient-to-br from-emerald-500 to-teal-500',
            glow: 'shadow-[0_18px_40px_-24px_rgba(16,185,129,0.7)]',
        },
    },
    {
        key: 'history',
        label: 'Activity History',
        description: 'Audit every classification and manual sync',
        icon: Clock,
        accent: {
            icon: 'bg-gradient-to-br from-amber-500 to-orange-500',
            glow: 'shadow-[0_18px_40px_-24px_rgba(251,191,36,0.7)]',
        },
    },
]

function Classifier() {
    const { success, error: showError, warning, info } = useGlobalToast()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [showCrawlerDataSelector, setShowCrawlerDataSelector] = useState(false)
    const [cacheSaveStatus, setCacheSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
    const [showDownloadModal, setShowDownloadModal] = useState(false)
    const [downloadConfig, setDownloadConfig] = useState({
        supermarket: '',
        customName: '',
        classificationDate: '',
        useCurrentDate: true
    })
    const [saveToCloudAfterDownload, setSaveToCloudAfterDownload] = useState(false)
    const [isDownloadingResults, setIsDownloadingResults] = useState(false)
    const [isSavingToCloud, setIsSavingToCloud] = useState(false)
    const [activeTab, setActiveTab] = useState<ClassifierTab>('workflow')
    const [historyEvents, setHistoryEvents] = useState<ClassificationHistoryEvent[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyError, setHistoryError] = useState<string | null>(null)
    const historyLoadedRef = useRef(false)

    useEffect(() => {
        const tabParam = searchParams?.get('tab')
        if (tabParam === 'cloud' || tabParam === 'history') {
            setActiveTab(tabParam)
        } else {
            setActiveTab('workflow')
        }
    }, [searchParams])

    const {
        inputData, setInputData,
        outputData, setOutputData,
        isProcessing, setIsProcessing,
        progress, setProgress,
    currentProduct, setCurrentProduct,
    currentProductIndex, setCurrentProductIndex,
    currentStep, setCurrentStep,
    setProcessingStartTime,
        processingLogs, addProcessingLog, setProcessingLogs,
        modelStats, setModelStats, updateModelStats,
        processingStats, setProcessingStats,
        apiStatus, setApiStatus,
        currentModel, setCurrentModel,
        modelSwitching, setModelSwitching,
        modelProgress, setModelProgress,
        currentView, setCurrentView,
        useCacheForLookup, setUseCacheForLookup,
        storeCacheAfterClassification, setStoreCacheAfterClassification,
        autoScroll, setAutoScroll,
        editMode, setEditMode,
        availableProductTypes, setAvailableProductTypes,
        updateInputData, updateOutputData, addInputRow, removeInputRow,
        resetApp
    } = useCentralStore()

    // Track current classification job and abort controller for cancellation
    const currentJobIdRef = useRef<string | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    // Model selection settings
    const [showModelSettings, setShowModelSettings] = useState(false)
    const [allowedModels, setAllowedModels] = useState<Record<ProviderKey, string[]>>(() => cloneAllowedModels(FALLBACK_ALLOWED_MODELS))
    const [allowedModelsLoading, setAllowedModelsLoading] = useState(true)
    const [allowedModelsError, setAllowedModelsError] = useState<string | null>(null)
    const [selectedModels, setSelectedModels] = useState<Record<ProviderKey, string>>(() => {
        const fallback = cloneAllowedModels(FALLBACK_ALLOWED_MODELS)
        try {
            const raw = localStorage.getItem('classifierModelOverrides')
            const parsed = raw ? JSON.parse(raw) : {}
            return sanitizeModelSelection(parsed, fallback)
        } catch {
            return sanitizeModelSelection({}, fallback)
        }
    })

    const persistModelOverrides = (overrides: Record<ProviderKey, string>) => {
        try { localStorage.setItem('classifierModelOverrides', JSON.stringify(overrides)) } catch {}
    }

    const handleModelChange = (provider: ProviderKey, value: string) => {
        setSelectedModels(prev => {
            const next = { ...prev, [provider]: value }
            const sanitized = sanitizeModelSelection(next, allowedModels)
            if (!selectionsEqual(prev, sanitized)) {
                persistModelOverrides(sanitized)
                return sanitized
            }
            return prev
        })
    }

    useEffect(() => {
        let cancelled = false
        const loadAllowedModels = async () => {
            setAllowedModelsLoading(true)
            setAllowedModelsError(null)
            try {
                const models = await keysAPI.allowedModels()
                if (cancelled) return
                const normalized = normalizeModelMap(models)
                setAllowedModels(normalized)
                setSelectedModels(prev => {
                    const sanitized = sanitizeModelSelection(prev, normalized)
                    if (!selectionsEqual(prev, sanitized)) {
                        persistModelOverrides(sanitized)
                        return sanitized
                    }
                    return prev
                })
            } catch (err: any) {
                if (cancelled) return
                console.error('Failed to load allowed models:', err)
                const message = err?.message || 'Failed to load allowed models'
                setAllowedModelsError(message)
                const fallback = cloneAllowedModels(FALLBACK_ALLOWED_MODELS)
                setAllowedModels(fallback)
                setSelectedModels(prev => {
                    const sanitized = sanitizeModelSelection(prev, fallback)
                    if (!selectionsEqual(prev, sanitized)) {
                        persistModelOverrides(sanitized)
                        return sanitized
                    }
                    return prev
                })
            } finally {
                if (!cancelled) setAllowedModelsLoading(false)
            }
        }

        loadAllowedModels()
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<Record<string, string[]>>).detail
            if (!detail) return
            const normalized = normalizeModelMap(detail)
            setAllowedModels(normalized)
            setAllowedModelsLoading(false)
            setAllowedModelsError(null)
            setSelectedModels(prev => {
                const sanitized = sanitizeModelSelection(prev, normalized)
                if (!selectionsEqual(prev, sanitized)) {
                    persistModelOverrides(sanitized)
                    return sanitized
                }
                return prev
            })
        }

        window.addEventListener('allowed-models-updated', handler)
        return () => window.removeEventListener('allowed-models-updated', handler)
    }, [])

    const loadHistory = useCallback(async () => {
        setHistoryLoading(true)
        setHistoryError(null)
        try {
            const response = await classificationAPI.listHistory(200)
            if (response?.success) {
                setHistoryEvents(response.events || [])
            } else {
                setHistoryEvents(response?.events || [])
                setHistoryError(response?.error || 'Failed to load classification history')
            }
        } catch (error: any) {
            setHistoryEvents([])
            setHistoryError(error?.message || 'Failed to load classification history')
        } finally {
            setHistoryLoading(false)
            historyLoadedRef.current = true
        }
    }, [])

    const handleClearHistory = useCallback(async () => {
        if (historyEvents.length === 0) {
            showError('No History', 'There are no history events to clear')
            return
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete all ${historyEvents.length} classification history events? This action cannot be undone.`
        )

        if (!confirmed) return

        setHistoryLoading(true)
        try {
            // Delete all events one by one
            const deletePromises = historyEvents.map(event =>
                fetch(`${API_BASE_URL}/classification/history/${event.id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                })
            )

            await Promise.allSettled(deletePromises)
            
            success('History Cleared', `Successfully deleted ${historyEvents.length} history events`)
            await loadHistory() // Reload to refresh the list
        } catch (error: any) {
            showError('Clear Failed', error?.message || 'Failed to clear history')
        } finally {
            setHistoryLoading(false)
        }
    }, [historyEvents, loadHistory])

    useEffect(() => {
        loadHistory()
    }, [loadHistory])

    useEffect(() => {
        const handler = () => {
            loadHistory()
        }

        window.addEventListener('classification-cloud-updated', handler)
        return () => window.removeEventListener('classification-cloud-updated', handler)
    }, [loadHistory])

    const handleTabChange = (tab: ClassifierTab) => {
        setActiveTab(tab)
        const params = new URLSearchParams(searchParams ? searchParams.toString() : '')
        if (tab === 'workflow') {
            params.delete('tab')
        } else {
            params.set('tab', tab)
        }
        const queryString = params.toString()
        router.replace(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false })
        if (tab === 'history' && !historyLoadedRef.current) {
            loadHistory()
        }
    }

    const historySummary = useMemo(() => {
        if (!historyEvents.length) {
            return {
                events: 0,
                totalProducts: 0,
                successful: 0,
                failed: 0,
                lastTimestamp: null as string | null,
                avgProductsPerRun: 0,
            }
        }

        // Calculate aggregates and find the latest classification run
        const classificationRuns = historyEvents.filter(
            event => event.event_type === 'classification_completed' || 
                     event.event_type === 'cloud_upload' ||
                     event.event_type === 'cloud_manual_upload'
        )

        let totalProducts = 0
        let successful = 0
        let failed = 0
        let runCount = 0

        classificationRuns.forEach(event => {
            if (event.total_products) {
                totalProducts += Number(event.total_products)
                runCount++
            }
            successful += Number(event.successful || 0)
            failed += Number(event.failed || 0)
        })

        const avgProductsPerRun = runCount > 0 ? Math.round(totalProducts / runCount) : 0

        return {
            events: historyEvents.length,
            totalProducts: avgProductsPerRun, // Show average per run instead of cumulative sum
            successful,
            failed,
            lastTimestamp: historyEvents[0]?.timestamp || null,
            avgProductsPerRun,
        }
    }, [historyEvents])

    // Wrapper functions for table callbacks
    const handleInputProductUpdate = (index: number, product: Product) => {
        const updatedData = [...inputData]
        updatedData[index] = product
        setInputData(updatedData)
    }

    const handleOutputProductUpdate = (index: number, product: Product) => {
        console.log(` Editing product at index ${index}:`, product.name || 'Unknown Product')
        console.log(` Product data being saved:`, product)
        const updatedData = [...outputData]
        updatedData[index] = product
        setOutputData(updatedData)
        
        // Immediate save for better UX and reliability
        saveUserEditsImmediately(updatedData)
    }

    const handleInputProductDelete = (index: number) => {
        const updatedData = inputData.filter((_, i) => i !== index)
        setInputData(updatedData)
    }

    const handleOutputProductDelete = (index: number) => {
        const updatedData = outputData.filter((_, i) => i !== index)
        setOutputData(updatedData)
        
        // Immediate save for deletions
        saveUserEditsImmediately(updatedData)
    }

    const checkApiStatus = useCallback(async () => {
        setApiStatus('checking')
        try {
            const isOnline = await classificationAPI.healthCheck()
            setApiStatus(isOnline ? 'online' : 'offline')
        } catch (error) {
            setApiStatus('offline')
        }
    }, [setApiStatus])

    // Check API status on mount
    useEffect(() => {
        checkApiStatus()
        
        // Check for crawler products in localStorage
        const crawlerProducts = localStorage.getItem('crawlerProducts')
        const crawlerProductsTimestamp = localStorage.getItem('crawlerProductsTimestamp')
        
        if (crawlerProducts && crawlerProductsTimestamp) {
            try {
                const products = JSON.parse(crawlerProducts)
                const timestamp = new Date(crawlerProductsTimestamp)
                const now = new Date()
                const hoursSinceUpload = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60)
                
                // Only auto-load if the data is less than 24 hours old
                if (hoursSinceUpload < 24 && products.length > 0) {
                    setInputData(products)
                    setCurrentView('input')
                    addProcessingLog(`Loaded ${products.length} products from crawler (${timestamp.toLocaleString()})`)
                    
                    // Clear the localStorage after loading to prevent re-loading on refresh
                    localStorage.removeItem('crawlerProducts')
                    localStorage.removeItem('crawlerProductsTimestamp')
                    
                    // Show notification to user
                    success('Products Loaded', `Successfully loaded ${products.length} products from the crawler!`)
                }
            } catch (error) {
                console.error('Error loading crawler products:', error)
                // Clear corrupted data
                localStorage.removeItem('crawlerProducts')
                localStorage.removeItem('crawlerProductsTimestamp')
            }
        }
    }, [checkApiStatus, setInputData, setCurrentView, addProcessingLog, success])

    const handleFileUpload = (data: any[]) => {
        setInputData(data)
        setCurrentView('input')
        addProcessingLog(`Loaded ${data.length} products for classification`)
    }

    const handleCrawlerDataLoad = (data: any[], sourceInfo?: { store?: string; category?: string }) => {
        setInputData(data)
        setCurrentView('input')
        addProcessingLog(`Loaded ${data.length} products from crawler for classification`)
        
        // Store crawler source information for download naming
        if (sourceInfo) {
            localStorage.setItem('lastCrawlerInfo', JSON.stringify(sourceInfo))
        }
        
        setShowCrawlerDataSelector(false)
    }

    // Immediate save function for all edits - simplified and reliable
    const saveUserEditsImmediately = useCallback(async (products: any[]) => {
        if (products.length === 0) return
        
        try {
            setCacheSaveStatus('saving')
            console.log(` Saving ${products.length} products to cache...`)
            console.log(` First product sample:`, products[0])
            
            // Map frontend Product fields to backend cache format
            const mappedProducts = products.map(product => ({
                // Backend expects 'name' field for cache key generation
                name: product.name || product.product_name || product.original_name || '',
                // Map all other fields as expected by backend
                product_type: product.product_type || product.category || '',
                brand_name: product.brand_name || '',
                size: product.sizeRaw || product.size || '',
                variety: product.variety || '',
                price: product.price || '',
                image_url: product.image_url || '',
                confidence: product.confidence || 0,
                model_used: product.model_used || '',
                // Keep additional fields for reference
                product_name: product.product_name || product.name || '',
                original_name: product.original_name || product.name || product.product_name || '',
                description: product.description || ''
            }))
            
            console.log(` Mapped product sample:`, mappedProducts[0])
            
            const result = await classificationAPI.saveEditedDataToCache(mappedProducts)
            console.log('✅ Cache save API response:', result)
            setCacheSaveStatus('saved')
            
            // Show success message briefly for user feedback
            setTimeout(() => {
                setCacheSaveStatus('idle')
            }, 1500)
        } catch (error) {
            console.error('❌ Failed to save user edits to cache:', error)
            setCacheSaveStatus('error')
            showError('Save Failed', 'Failed to save edits to cache. Please try again.')
            
            // Reset status after 3 seconds for errors
            setTimeout(() => setCacheSaveStatus('idle'), 3000)
        }
    }, [showError])
    
    // Cleanup and save on page unload
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Save any pending changes on page unload
            if (outputData.length > 0) {
                // Use sendBeacon for reliable saving on page unload
                navigator.sendBeacon('/api/save-cache', JSON.stringify(outputData))
            }
        }
        
        window.addEventListener('beforeunload', handleBeforeUnload)
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
            // Save any pending changes on component unmount
            if (outputData.length > 0) {
                saveUserEditsImmediately(outputData)
            }
        }
    }, [outputData, saveUserEditsImmediately])

    // Add keyboard shortcut to manually trigger save (Ctrl+S)
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.key === 's') {
                event.preventDefault()
                if (outputData.length > 0) {
                    console.log(' Manual save triggered (Ctrl+S)')
                    saveUserEditsImmediately(outputData)
                }
            }
        }
        
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [outputData, saveUserEditsImmediately])

    const handleStartClassification = async () => {
        if (inputData.length === 0) return

        if (allowedModelsLoading) {
            info('Loading models', 'Please wait until allowed models finish loading.')
            return
        }

        const sanitizedSelection = sanitizeModelSelection(selectedModels, allowedModels)
        const selectionChanged = !selectionsEqual(selectedModels, sanitizedSelection)
        if (selectionChanged) {
            setSelectedModels(sanitizedSelection)
            persistModelOverrides(sanitizedSelection)
            warning('Model list updated', 'Saved model choices were adjusted to match the latest allowed models.')
        }

        const missingProviders = PROVIDER_IDS.filter(prov => {
            const list = allowedModels[prov] || []
            return list.length > 0 && !sanitizedSelection[prov]
        })
        if (missingProviders.length > 0) {
            const names = missingProviders.map(prov => PROVIDER_LABELS[prov]).join(', ')
            showError('Model selection required', `Choose a model for ${names} before classifying.`)
            setShowModelSettings(true)
            return
        }

        const overrides = PROVIDER_IDS.reduce((acc, prov) => {
            const value = sanitizedSelection[prov]
            if (value) acc[prov] = value
            return acc
        }, {} as ModelOverrides)

        setIsProcessing(true)
        setProgress(0)
        setCurrentView('processing')
        setProcessingLogs([])
        setOutputData([])
        setCurrentProduct('')
        setCurrentProductIndex(null)
        setCurrentStep('')
        setCurrentModel('')
        setProcessingStartTime(Date.now())

        // Reset stats
        setModelStats({ groq: 0, cerebras: 0, gemini: 0, openrouter: 0, switches: 0 })
        setProcessingStats({ totalTime: '0s', avgTime: '0s', successful: 0, failed: 0 })
        setAutoScroll(true)

        try {
            // Create an AbortController for this run
            abortControllerRef.current = new AbortController()
            currentJobIdRef.current = null

            const results = await classificationAPI.classifyProducts(
                inputData,
                handleSSEProgress,
                useCacheForLookup,
                storeCacheAfterClassification,
                overrides,
                {
                    signal: abortControllerRef.current.signal,
                    onJobId: (jobId: string) => {
                        currentJobIdRef.current = jobId
                        addProcessingLog(` Job started (id: ${jobId.substring(0, 8)}…)`, 'info')
                    }
                }
            )

            setOutputData(results)
            setIsProcessing(false)
            setCurrentView('output')
            setProcessingStartTime(null)
            setCurrentProductIndex(null)
        } catch (error) {
            console.error('Classification error:', error)
            addProcessingLog(`❌ Error: ${error}`, 'error')
            setIsProcessing(false)
            setProcessingStartTime(null)
            setCurrentProductIndex(null)
        } finally {
            // Reset controller after finishing
            abortControllerRef.current = null
            currentJobIdRef.current = null
        }
    }

    // Handle detailed SSE progress events like the original frontend
    const handleSSEProgress = (data: any) => {
        switch (data.type) {
            case 'init':
                addProcessingLog(data.message, 'info')
                break
            case 'stopped':
                // Backend signaled cooperative cancellation
                setIsProcessing(false)
                setProcessingStartTime(null)
                setCurrentProductIndex(null)
                addProcessingLog(' Classification stopped by user.', 'info')
                // Return user to the start (input) view
                setCurrentView('input')
                setCurrentStep('')
                setCurrentModel('')
                setProgress(0)
                info('Classification stopped', 'You can start a new classification when ready.')
                break

            case 'product_start':
                setProgress(data.percentage || 0)
                setCurrentProduct(data.current_product || '')
                setCurrentProductIndex(typeof data.current === 'number' ? Math.max(0, data.current - 1) : null)
                setCurrentStep(`Product ${data.current}/${data.total} - ${data.step}`)
                addProcessingLog(`\n${'='.repeat(70)}`, 'separator')
                addProcessingLog(data.message, 'product')
                break

            case 'model_trying':
                setCurrentModel(data.current_model || 'Enhanced Cascade')
                setModelSwitching(true)
                setModelProgress({ step: data.step || 'Trying model...', progress: 25 })
                addProcessingLog(data.message, 'model')
                // Reset switching animation after a delay
                setTimeout(() => setModelSwitching(false), 1000)
                break

            case 'model_success':
                setCurrentModel(data.model_used || 'Unknown')
                setModelSwitching(false)
                setModelProgress({ step: 'Model successful!', progress: 100 })
                addProcessingLog(data.message, 'success')
                if (data.selected_model) {
                    addProcessingLog(` Selected model: ${data.model_used} (${data.selected_model})`, 'detail')
                }
                // Update model stats with enhanced tracking
                const modelKey = data.model_used?.includes('GROQ') ? 'groq' : 
                                data.model_used?.includes('CEREBRAS') ? 'cerebras' :
                                data.model_used?.includes('GEMINI') ? 'gemini' :
                                data.model_used?.includes('OPENROUTER') ? 'openrouter' : 'other'
                
                console.log(' Model success event:', {
                    model_used: data.model_used,
                    mapped_key: modelKey,
                    event_data: data
                })
                
                if (modelKey !== 'other') {
                    updateModelStats((prev: ModelStats) => {
                        const newStats = {
                            ...prev,
                            [modelKey]: prev[modelKey] + 1,
                            switches: data.model_used?.includes('RETRY') || data.model_used?.includes('QWQ') || data.model_used?.includes('QWEN') ? prev.switches + 1 : prev.switches
                        }
                        console.log(` Model stats updated: ${modelKey} = ${newStats[modelKey]}`, newStats)
                        return newStats
                    })
                } else {
                    console.log('⚠️ Unknown model, not updating stats:', data.model_used)
                }
                break

            case 'ai_response':
                // Log the AI response header
                addProcessingLog(` AI Response (from ${data.model_used} model${data.selected_model ? `: ${data.selected_model}` : ''}):`, 'ai')
                addProcessingLog('-'.repeat(50), 'separator')
                
                // Display think content if available
                if (data.think_content && data.think_content.length > 0) {
                    addProcessingLog(` AI Reasoning Process:`, 'think')
                    data.think_content.forEach((thinkText: string, index: number) => {
                        addProcessingLog(` Think Block ${index + 1}:`, 'think-header')
                        addProcessingLog(thinkText, 'think-content')
                    })
                    addProcessingLog('-'.repeat(50), 'separator')
                } else {
                    // Fallback: try to extract think content from the response
                    const fullResponse = data.response || ''
                    const thinkMatches = fullResponse.match(/<think>([\s\S]*?)<\/think>/g)
                    
                    if (thinkMatches && thinkMatches.length > 0) {
                        addProcessingLog(` AI Reasoning Process:`, 'think')
                        thinkMatches.forEach((thinkBlock: string, index: number) => {
                            const thinkContent = thinkBlock.replace(/<\/?think>/g, '').trim()
                            if (thinkContent) {
                                addProcessingLog(` Think Block ${index + 1}:`, 'think-header')
                                addProcessingLog(thinkContent, 'think-content')
                            }
                        })
                        addProcessingLog('-'.repeat(50), 'separator')
                    }
                }
                
                // Show the cleaned classification response
                const cleanedResponse = (data.response || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
                if (cleanedResponse) {
                    addProcessingLog(' Final Classification Output:', 'response-header')
                    addProcessingLog(cleanedResponse, 'response')
                }
                addProcessingLog('-'.repeat(50), 'separator')
                break

            case 'parsed_classification':
                const classification = data.classification
                addProcessingLog(`✅ Parsed Classification (by ${data.model_used} model):`, 'success')
                addProcessingLog(`   Product Type: ${classification.product_type}`, 'detail')
                addProcessingLog(`   Brand Name: ${classification.brand_name}`, 'detail')
                addProcessingLog(`   Product Name: ${classification.product_name}`, 'detail')
                addProcessingLog(`   Size: ${classification.size}`, 'detail')
                addProcessingLog(`   Variety: ${classification.variety}`, 'detail')
                break

            case 'optimization_pause':
                addProcessingLog(data.message, 'info')
                break

            case 'progress':
                setProgress(data.percentage || 0)
                // Update model stats with server data, using higher values to preserve local increments
                updateModelStats((prev: ModelStats) => ({
                    ...prev,
                    groq: Math.max(prev.groq, data.groq_successes || 0),
                    cerebras: Math.max(prev.cerebras, data.cerebras_successes || 0),
                    gemini: Math.max(prev.gemini, data.gemini_successes || 0),
                    openrouter: Math.max(prev.openrouter, data.openrouter_successes || 0)
                }))
                console.log(' Progress update - server stats:', {
                    groq: data.groq_successes,
                    cerebras: data.cerebras_successes,
                    gemini: data.gemini_successes,
                    openrouter: data.openrouter_successes
                })
                break

            case 'result':
                // Results are collected by the API function
                break

            case 'complete':
                setProcessingStats({
                    totalTime: data.stats?.total_time || '0s',
                    avgTime: data.stats?.avg_time_per_product || '0s',
                    successful: data.stats?.successful || 0,
                    failed: data.stats?.failed || 0
                })
                addProcessingLog('\n' + data.message, 'complete')
                addProcessingLog(`⚡ Total time: ${data.stats?.total_time} (${data.stats?.avg_time_per_product} per product)`, 'stats')
                addProcessingLog(`✅ Successfully classified: ${data.stats?.successful}`, 'stats')
                addProcessingLog(`❌ Failed: ${data.stats?.failed}`, 'stats')
                addProcessingLog(` Model Usage Stats:`, 'stats')
                if (data.stats?.groq_successes) addProcessingLog(`    Groq: ${data.stats.groq_successes} products`, 'stats')
                if (data.stats?.cerebras_successes) addProcessingLog(`    Cerebras: ${data.stats.cerebras_successes} products`, 'stats')
                if (data.stats?.gemini_successes) addProcessingLog(`    Gemini: ${data.stats.gemini_successes} products`, 'stats')
                if (data.stats?.openrouter_successes) addProcessingLog(`    OpenRouter: ${data.stats.openrouter_successes} products`, 'stats')
                setOutputData(data.results || [])
                setIsProcessing(false)
                setCurrentView('output')
                setProcessingStartTime(null)
                setCurrentProductIndex(null)
                break

            case 'error':
                addProcessingLog(`❌ Error: ${data.error}`, 'error')
                break

            default:
                console.log('Unknown message type:', data.type)
                break
        }
    }

    const groqModels = allowedModels.groq || []
    const openrouterModels = allowedModels.openrouter || []
    const geminiModels = allowedModels.gemini || []
    const cerebrasModels = allowedModels.cerebras || []

    const renderUploadView = () => (
        <div className="space-y-6">
            <PageHero
                title="Load Product Data"
                description="Choose how you want to load product data for classification"
                category="Upload"
            />
            
            <div className="max-w-4xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* File Upload Option */}
                    <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload JSON File</h3>
                        <p className="text-gray-600 mb-4">Upload a JSON file containing product data</p>
                        <FileUpload onFileUpload={handleFileUpload} />
                    </div>
                    
                    {/* Crawler Data Option */}
                    <div className="bg-white border-2 border-gray-300 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Load from Crawler</h3>
                        <p className="text-gray-600 mb-4">Select data from previous crawler results or output files</p>
                        <button
                            onClick={() => setShowCrawlerDataSelector(true)}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center space-x-2 mx-auto"
                        >
                            <FolderOpen size={16} />
                            <span>Browse Crawler Data</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )

    const renderInputView = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                     <span>{inputData.length} products loaded</span>
                </div>
                <div className="flex space-x-3">
                    <OutlineButton onClick={() => setCurrentView('upload')}>
                        <DocumentUpload size={16} />
                        Load Different File
                    </OutlineButton>
                    <button
                        onClick={handleStartClassification}
                        disabled={inputData.length === 0 || isProcessing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
                    >
                        <Play size={16} />
                        <span>Start Classification</span>
                    </button>
                </div>
            </div>

            {/* Cache Settings */}
            <div className="bg-white rounded-lg border p-4">
                <h3 className="text-lg font-semibold mb-3">Cache Settings</h3>
                <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={useCacheForLookup}
                            onChange={(e) => setUseCacheForLookup(e.target.checked)}
                            className="rounded"
                        />
                        <span>Use cache for product lookup</span>
                    </label>
                    <label className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={storeCacheAfterClassification}
                            onChange={(e) => setStoreCacheAfterClassification(e.target.checked)}
                            className="rounded"
                        />
                        <span>Store results in cache after classification</span>
                    </label>
                </div>
            </div>

            <ProductTable 
                products={inputData} 
                isEditable={true}
                editMode={editMode}
                availableProductTypes={availableProductTypes}
                onProductUpdate={handleInputProductUpdate}
                onProductDelete={handleInputProductDelete}
                onAddNewType={(newType) => setAvailableProductTypes([...availableProductTypes, newType].sort())}
                title="Input Products"
            />
        </div>
    )

    const onStopProcessing = async () => {
        // Optimistically update UI
        setIsProcessing(false)
        setCurrentStep('Stopping…')

        try {
            // Abort the client-side stream immediately
            abortControllerRef.current?.abort()
        } catch {}

        try {
            // Tell backend to stop if we have a job id
            if (currentJobIdRef.current) {
                await classificationAPI.stopClassification(currentJobIdRef.current)
                addProcessingLog(' Stop requested. Waiting for backend to finalize…', 'info')
            } else {
                addProcessingLog(' Stop requested (no job id yet).', 'info')
            }
        } catch (e) {
            console.error('Failed to stop job:', e)
        } finally {
            // Navigate back to the start page with a friendly message
            setCurrentView('input')
            setCurrentStep('')
            setCurrentModel('')
            setProgress(0)
            info('Classification stopped', 'Start a new classification when you are ready.')
        }
    }

    const renderProcessingView = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Processing Classification</h2>
                    <p className="text-gray-600">AI is analyzing and classifying your products...</p>
                </div>
                <button
                    onClick={onStopProcessing}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
                >
                    <Stop size={16} />
                    <span>Stop Processing</span>
                </button>
            </div>
            
            <EnhancedProcessingProgress />
        </div>
    )

    const buildExportPayload = () => {
        const classificationDateIso = downloadConfig.useCurrentDate
            ? new Date().toISOString()
            : downloadConfig.classificationDate
                ? new Date(`${downloadConfig.classificationDate}T00:00:00.000Z`).toISOString()
                : ''

        const supermarket = downloadConfig.supermarket.trim() || 'supermarket'

        return {
            requestPayload: {
                results: outputData,
                supermarket,
                classification_date: classificationDateIso,
                custom_name: downloadConfig.customName.trim()
            },
            supermarket,
            classificationDateIso
        }
    }

    const persistResultsToCloud = async (options?: { showToast?: boolean }) => {
        if (!outputData.length) {
            showError('No Results', 'No classification results to save yet.')
            return null
        }

        setIsSavingToCloud(true)
        try {
            const { requestPayload } = buildExportPayload()
            const response = await classificationAPI.saveResultsToCloud({
                ...requestPayload,
                use_current_date: downloadConfig.useCurrentDate,
                metadata: {
                    total_products: outputData.length,
                    requested_from: 'classifier'
                }
            })

            if (options?.showToast !== false) {
                const cloudName = response?.filename || requestPayload.supermarket
                success('Saved to Cloud', `Classification saved as ${cloudName}`)
            }

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('classification-cloud-updated'))
            }
            return response
        } catch (error) {
            console.error('Cloud save error:', error)
            const message = error instanceof Error ? error.message : 'Failed to save results to cloud'
            showError('Cloud Save Failed', message)
            throw error
        } finally {
            setIsSavingToCloud(false)
        }
    }

    const handleSaveResultsToCloudOnly = async () => {
        try {
            const result = await persistResultsToCloud()
            if (result) {
                setShowDownloadModal(false)
            }
        } catch {
            // Error toast already displayed inside persistResultsToCloud
        }
    }

    const renderOutputView = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Classification Results</h2>
                    <div className="flex items-center space-x-4">
                        <p className="text-gray-600">{outputData.length} products have been classified</p>
                    </div>
                </div>
                <div className="flex space-x-3">
                    <OutlineButton onClick={resetApp}>
                        <Refresh size={16} />
                        Reset & Start Over
                    </OutlineButton>
                    <button
                        onClick={openDownloadModal}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                    >
                        <DocumentUpload size={16} />
                        <span>Download</span>
                    </button>
                </div>
            </div>
            
            <ProductTable 
                products={outputData} 
                isEditable={true}
                editMode={editMode}
                availableProductTypes={availableProductTypes}
                onProductUpdate={handleOutputProductUpdate}
                onProductDelete={handleOutputProductDelete}
                onAddNewType={(newType) => setAvailableProductTypes([...availableProductTypes, newType].sort())}
                title="Classification Results"
                cacheSaveStatus={cacheSaveStatus}
            />
        </div>
    )

    // Enhanced download functionality
    const handleEnhancedDownload = async () => {
        if (isDownloadingResults) {
            return
        }

        if (!outputData.length) {
            showError('No Results', 'No classification results available to download yet.')
            return
        }

        console.log(' Starting enhanced download... [Version 3.1]')
        console.log(' Current downloadConfig state:', downloadConfig)

        const { requestPayload, supermarket } = buildExportPayload()
        const classificationDate = requestPayload.classification_date

        console.log(' Download date logic:')
        console.log('   useCurrentDate:', downloadConfig.useCurrentDate)
        console.log('   classificationDate input:', downloadConfig.classificationDate)
        console.log('   final classificationDate:', classificationDate)

        console.log(' Download request payload:', requestPayload)
        console.log(' Supermarket being sent:', supermarket)
        console.log(' Classification date:', classificationDate)
        console.log('️ Custom name:', downloadConfig.customName)

        try {
            setIsDownloadingResults(true)

            const response = await fetch(`${BACKEND_URL}/download-results`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                body: JSON.stringify(requestPayload)
            })

            console.log(' Response status:', response.status)
            console.log(' Response headers:', Object.fromEntries(response.headers.entries()))

            if (!response.ok) {
                const errorData = await response.text()
                console.error('❌ Download failed with response:', errorData)
                throw new Error(`Download failed: ${response.status} ${response.statusText}`)
            }

            const blob = await response.blob()
            const contentDisposition = response.headers.get('Content-Disposition')
            let filename = 'classification_results_fallback.json'

            console.log(' Raw Content-Disposition header:', contentDisposition)
            console.log(' Blob size:', blob.size, 'bytes')

            if (contentDisposition) {
                console.log(' MANUAL REGEX TEST:')
                const testString = 'attachment; filename="cargills_classification_20250709.json"'
                const testPattern = /filename="([^"]+)"/i
                const testMatch = testString.match(testPattern)
                console.log(' Test string:', testString)
                console.log(' Test pattern:', testPattern)
                console.log(' Test match:', testMatch)

                console.log(' ACTUAL PARSING:')
                console.log(' Raw Content-Disposition:', JSON.stringify(contentDisposition))
                console.log(' Content-Disposition as string:', contentDisposition.toString())

                let extractedFilename: string | null = null

                const basicMatch = contentDisposition.match(/filename="([^"]+)"/i)
                console.log(' Basic filename pattern match:', basicMatch)

                if (basicMatch && basicMatch[1]) {
                    extractedFilename = basicMatch[1].trim()
                    console.log('✅ Extracted filename via basic pattern:', extractedFilename)
                } else {
                    const noQuotesMatch = contentDisposition.match(/filename=([^;,\s]+)/i)
                    console.log(' No quotes pattern match:', noQuotesMatch)

                    if (noQuotesMatch && noQuotesMatch[1]) {
                        extractedFilename = noQuotesMatch[1].trim()
                        console.log('✅ Extracted filename via no-quotes pattern:', extractedFilename)
                    }
                }

                if (extractedFilename) {
                    filename = extractedFilename
                    console.log('✅ Final extracted filename:', filename)
                } else {
                    console.log('❌ Failed to extract filename from Content-Disposition')
                    console.log('⚠️ Using fallback logic with downloadConfig date')
                    const useDate = downloadConfig.useCurrentDate
                        ? new Date().toISOString().split('T')[0].replace(/-/g, '')
                        : downloadConfig.classificationDate.replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')
                    filename = `${supermarket}_classification_${useDate}.json`
                    console.log(' Fallback filename:', filename)
                }
            } else {
                console.log('⚠️ No Content-Disposition header found')
                const useDate = downloadConfig.useCurrentDate
                    ? new Date().toISOString().split('T')[0].replace(/-/g, '')
                    : downloadConfig.classificationDate.replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '')
                filename = `${supermarket}_classification_${useDate}.json`
                console.log(' Created filename without header:', filename)
            }

            console.log(' Final filename for download:', filename)

            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = filename
            link.style.display = 'none'

            document.body.appendChild(link)
            console.log(' Created download link with filename:', link.download)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)

            console.log('✅ Download initiated successfully')

            let cloudSaved = false
            if (saveToCloudAfterDownload) {
                try {
                    await persistResultsToCloud({ showToast: false })
                    cloudSaved = true
                } catch (cloudError) {
                    console.error('❌ Failed to save to cloud after download:', cloudError)
                }
            }

            if (!saveToCloudAfterDownload || cloudSaved) {
                setShowDownloadModal(false)
            }

            const successMessage = cloudSaved
                ? `Downloaded ${filename} and saved to cloud`
                : `Downloaded results as ${filename}`

            success('Download Complete', successMessage)
        } catch (error) {
            console.error('❌ Enhanced download error:', error)
            showError('Download Failed', 'Could not download classification results. Check console for details.')
        } finally {
            setIsDownloadingResults(false)
        }
    }

    const openDownloadModal = () => {
        // Auto-detect supermarket and custom name from crawler data
        let detectedSupermarket = '';
        let detectedCustomName = '';
        
        // Check localStorage for crawler data info
        const crawlerInfo = localStorage.getItem('lastCrawlerInfo');
        if (crawlerInfo) {
            try {
                const info = JSON.parse(crawlerInfo);
                if (info.store) {
                    detectedSupermarket = info.store.toLowerCase();
                    console.log(' Detected supermarket from crawler info:', detectedSupermarket);
                }
                // Extract custom name from category or other crawler metadata
                if (info.category) {
                    detectedCustomName = info.category.toLowerCase().replace(/_/g, ' ');
                    console.log('️ Detected custom name from crawler category:', detectedCustomName);
                }
                // Check for any custom_name field in crawler metadata
                if (info.custom_name) {
                    detectedCustomName = info.custom_name;
                    console.log('️ Using custom name from crawler metadata:', detectedCustomName);
                }
            } catch (e) {
                console.log('Could not parse crawler info from localStorage');
            }
        }

        // If no custom name from crawler, try to get from crawler products metadata
        if (!detectedCustomName) {
            const crawlerProducts = localStorage.getItem('crawlerProducts');
            if (crawlerProducts) {
                try {
                    const products = JSON.parse(crawlerProducts);
                    if (Array.isArray(products) && products.length > 0) {
                        // Check first product for metadata
                        const firstProduct = products[0];
                        if (firstProduct.category) {
                            detectedCustomName = firstProduct.category.toLowerCase().replace(/_/g, ' ');
                            console.log('️ Detected custom name from product category:', detectedCustomName);
                        }
                    }
                } catch (e) {
                    console.log('Could not parse crawler products from localStorage');
                }
            }
        }

        // Check if we can determine supermarket from the input data
        if (!detectedSupermarket && inputData.length > 0) {
            const firstProduct = inputData[0];
            if (firstProduct.name?.toLowerCase().includes('keells') || 
                firstProduct.description?.toLowerCase().includes('keells') ||
                firstProduct.image_url?.toLowerCase().includes('keells')) {
                detectedSupermarket = 'keells';
                console.log(' Detected Keells from input data');
            } else if (firstProduct.name?.toLowerCase().includes('cargills') || 
                       firstProduct.description?.toLowerCase().includes('cargills') ||
                       firstProduct.image_url?.toLowerCase().includes('cargills')) {
                detectedSupermarket = 'cargills';
                console.log(' Detected Cargills from input data');
            }
        }

        // If still no detection, check URL or page context for hints
        if (!detectedSupermarket) {
            const urlParams = new URLSearchParams(window.location.search);
            const urlSupermarket = urlParams.get('supermarket');
            if (urlSupermarket) {
                detectedSupermarket = urlSupermarket.toLowerCase();
                console.log(' Detected supermarket from URL:', detectedSupermarket);
            }
        }

        // If still no detection, ask user to specify or default to generic name
        if (!detectedSupermarket) {
            detectedSupermarket = 'supermarket'; // Better than 'unknown'
            console.log(' No supermarket detected, using generic name');
        }

        console.log(' Final detected supermarket:', detectedSupermarket);
        console.log('️ Final detected custom name:', detectedCustomName || '(none)');

        setDownloadConfig(prev => ({
            ...prev,
            supermarket: detectedSupermarket,
            customName: detectedCustomName,
            classificationDate: '',
            useCurrentDate: true
        }));
        setSaveToCloudAfterDownload(false)
        
        setShowDownloadModal(true);
    };

    const [showKeys, setShowKeys] = useState(false)

    return (
        <>
            <PageHeader 
                title="AI Classifier" 
                subtitle="Automated product classification" 
            />
            <PageContent>
                <PageHero
                    title="AI Product Classifier"
                    description="Classify products using AI models."
                    badges={
                        <div className="flex items-center gap-2 bg-white/50 px-3 py-1 rounded-full border border-gray-100">
                            <div
                                className={`h-2 w-2 rounded-full ${
                                    apiStatus === 'online'
                                        ? 'bg-emerald-500'
                                        : apiStatus === 'offline'
                                            ? 'bg-red-500'
                                            : 'bg-amber-400'
                                }`}
                            />
                            <span className="text-xs font-medium text-slate-500">
                                {apiStatus === 'online' ? 'Connected' : apiStatus === 'offline' ? 'Offline' : 'Checking...'}
                            </span>
                        </div>
                    }
                >
                    <div className="flex items-center gap-2">
                        <button 
                            className='flex items-center justify-center h-10 w-10 duration-200 hover:bg-gray-100 rounded-xl text-gray-600'
                            onClick={() => setShowKeys(true)}
                            title="API Keys"
                        >
                            <KeyIcon size={20} />
                        </button>
                        {(currentView === 'input' || currentView === 'output') && (
                            <button 
                                className='flex items-center justify-center h-10 w-10 duration-200 hover:bg-gray-100 rounded-xl text-gray-600'
                                onClick={() => setEditMode(!editMode)}
                                title={editMode ? "View Mode" : "Edit Mode"}
                            >
                                {editMode ? <Eye size={20} /> : <Edit size={20} />}
                            </button>
                        )}
                        <button 
                            className='flex items-center justify-center h-10 w-10 duration-200 hover:bg-gray-100 rounded-xl text-gray-600'
                            onClick={() => setShowModelSettings(true)}
                            title="Model Settings"
                        >
                            <Setting4 size={20} />
                        </button>
                    </div>
                </PageHero>
                <div className="relative">
                    <motion.div
                        aria-hidden
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="pointer-events-none absolute inset-0 -z-10 rounded-[32px] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(16,185,129,0.18),_transparent_50%)]"
                    />
                    <div className="space-y-6">
                        <div className="rounded-3xl bg-white/80 p-1 shadow-inner shadow-slate-200 backdrop-blur">
                            <div className="grid gap-1 sm:grid-cols-3">
                                {CLASSIFIER_TABS.map((tab) => {
                                    const Icon = tab.icon
                                    const isActive = activeTab === tab.key
                                    return (
                                        <motion.button
                                            key={tab.key}
                                            type="button"
                                            onClick={() => handleTabChange(tab.key)}
                                            whileHover={{ y: -2, scale: 1.01 }}
                                            whileTap={{ scale: 0.98 }}
                                            className={`group relative overflow-hidden rounded-2xl px-4 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-300 ${
                                                isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {isActive && (
                                                <motion.span
                                                    layoutId="classifierTabHighlight"
                                                    className={`absolute inset-0 rounded-2xl bg-white/90 backdrop-blur-sm ${tab.accent.glow}`}
                                                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                                                />
                                            )}
                                            <span className="relative flex items-start gap-3">
                                                <span
                                                    className={`relative mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl text-white transition ${
                                                        isActive ? tab.accent.icon : 'bg-slate-200 text-slate-500'
                                                    }`}
                                                >
                                                    <Icon size={18} variant="Bold" />
                                                    {isActive && (
                                                        <motion.span
                                                            layoutId="tabIconAura"
                                                            className="absolute inset-0 rounded-xl border border-white/30"
                                                            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                                                        />
                                                    )}
                                                </span>
                                                <span className="flex-1">
                                                    <span className={`block text-sm font-semibold ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
                                                        {tab.label}
                                                    </span>
                                                    <span className="mt-0.5 block text-xs font-medium text-slate-500">{tab.description}</span>
                                                </span>
                                            </span>
                                        </motion.button>
                                    )
                                })}
                            </div>
                        </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'workflow' && (
                            <motion.div
                                key="workflow"
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="space-y-6"
                            >
                                {currentView === 'upload' && renderUploadView()}
                                {currentView === 'input' && renderInputView()}
                                {currentView === 'processing' && renderProcessingView()}
                                {currentView === 'output' && renderOutputView()}
                            </motion.div>
                        )}

                        {activeTab === 'cloud' && (
                            <motion.div
                                key="cloud"
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="space-y-6"
                            >
                                <motion.div
                                    layout
                                    className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200/60 bg-gradient-to-r from-blue-50 via-white to-slate-50 px-5 py-4 text-sm text-slate-700 shadow-[0_32px_70px_-45px_rgba(37,99,235,0.55)]"
                                >
                                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Cloud workspace
                                    </span>
                                    <span className="text-slate-600">
                                        Upload external classifier outputs or manage saved exports without leaving this screen.
                                    </span>
                                </motion.div>
                                <div className="grid gap-6 xl:grid-cols-2">
                                    <motion.div layout className="space-y-4 rounded-3xl border border-white/60 bg-white/90 p-4 shadow-[0_24px_60px_-35px_rgba(37,99,235,0.22)] backdrop-blur">
                                        <ManualCloudUploader onUploadSuccess={() => { void loadHistory() }} />
                                    </motion.div>
                                    <motion.div layout className="space-y-4 rounded-3xl border border-white/60 bg-white/90 p-4 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.15)] backdrop-blur">
                                        <ClassifierCloudManager />
                                    </motion.div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'history' && (
                            <motion.div
                                key="history"
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -16 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="space-y-6"
                            >
                                <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <motion.div
                                        layout
                                        className="rounded-3xl border border-white/70 bg-gradient-to-br from-white via-slate-50 to-slate-100/90 p-5 shadow-[0_30px_70px_-45px_rgba(15,23,42,0.5)]"
                                        whileHover={{ y: -4, scale: 1.01 }}
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Events Logged</div>
                                        <div className="mt-2 text-2xl font-bold text-slate-900">{historyLoading ? '--' : historySummary.events}</div>
                                        <div className="mt-1 text-xs text-slate-500">Cloud saves, manual uploads, and classifier runs</div>
                                    </motion.div>
                                    <motion.div
                                        layout
                                        className="rounded-3xl border border-white/70 bg-gradient-to-br from-white via-slate-50 to-slate-100/90 p-5 shadow-[0_30px_70px_-45px_rgba(37,99,235,0.45)]"
                                        whileHover={{ y: -4, scale: 1.01 }}
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Products/Run</div>
                                        <div className="mt-2 text-2xl font-bold text-slate-900">
                                            {historyLoading ? '--' : historySummary.totalProducts.toLocaleString()}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">Average batch size per classification</div>
                                    </motion.div>
                                    <motion.div
                                        layout
                                        className="rounded-3xl border border-white/70 bg-gradient-to-br from-white via-emerald-50 to-white p-5 shadow-[0_30px_70px_-45px_rgba(16,185,129,0.5)]"
                                        whileHover={{ y: -4, scale: 1.01 }}
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Successful Labels</div>
                                        <div className="mt-2 text-2xl font-bold text-emerald-600">
                                            {historyLoading ? '--' : historySummary.successful.toLocaleString()}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {historyLoading
                                                ? 'Captured totals updating...'
                                                : `${historySummary.failed.toLocaleString()} issues flagged for review`}
                                        </div>
                                    </motion.div>
                                    <motion.div
                                        layout
                                        className="rounded-3xl border border-white/70 bg-gradient-to-br from-white via-amber-50 to-white p-5 shadow-[0_30px_70px_-45px_rgba(245,158,11,0.4)]"
                                        whileHover={{ y: -4, scale: 1.01 }}
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Activity</div>
                                        <div className="mt-2 text-base font-semibold text-slate-900">
                                            {historyLoading
                                                ? 'Loading...'
                                                : historySummary.lastTimestamp
                                                    ? formatDateTime(historySummary.lastTimestamp)
                                                    : 'No activity recorded yet'}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">Stay on top of recent classifier events</div>
                                    </motion.div>
                                </motion.div>
                                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="flex-1">
                                        <h3 className="text-sm font-semibold text-slate-900">Classification History Timeline</h3>
                                        <p className="mt-0.5 text-xs text-slate-600">
                                            {historyEvents.length === 0 
                                                ? 'No events recorded yet'
                                                : `${historyEvents.length} event${historyEvents.length === 1 ? '' : 's'} in history`}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={loadHistory}
                                            disabled={historyLoading}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {historyLoading ? 'Refreshing...' : 'Refresh'}
                                        </button>
                                        <button
                                            onClick={handleClearHistory}
                                            disabled={historyLoading || historyEvents.length === 0}
                                            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Clear History
                                        </button>
                                    </div>
                                </div>
                                <ClassificationHistoryTimeline
                                    events={historyEvents}
                                    loading={historyLoading}
                                    error={historyError}
                                    onRefresh={loadHistory}
                                    emptyDescription="Run a classification job or upload manual results to populate this timeline."
                                />
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </div>
                </div>

                {showCrawlerDataSelector && (
                    <CrawlerDataSelector onDataLoad={handleCrawlerDataLoad} onClose={() => setShowCrawlerDataSelector(false)} />
                )}

                {showKeys && <ApiKeysModal open={showKeys} onClose={() => setShowKeys(false)} />}

                {showDownloadModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                        <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
                            <h3 className="mb-4 text-lg font-bold text-gray-900">Download Classification Results</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">Supermarket Name *</label>
                                    <div className="flex gap-2 mb-2">
                                        <button
                                            type="button"
                                            onClick={() => setDownloadConfig((prev) => ({ ...prev, supermarket: 'keells' }))}
                                            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                                                downloadConfig.supermarket.toLowerCase() === 'keells'
                                                    ? 'bg-green-600 text-white border-green-600'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                            }`}
                                        >
                                            Keells
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDownloadConfig((prev) => ({ ...prev, supermarket: 'cargills' }))}
                                            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                                                downloadConfig.supermarket.toLowerCase() === 'cargills'
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                            }`}
                                        >
                                            Cargills
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={downloadConfig.supermarket}
                                        onChange={(e) => setDownloadConfig((prev) => ({ ...prev, supermarket: e.target.value }))}
                                        placeholder="e.g., keells, cargills, arpico"
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                    <p className="mt-1 text-xs text-gray-500">This will be used in the filename</p>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">Custom Name (Optional)</label>
                                    <input
                                        type="text"
                                        value={downloadConfig.customName}
                                        onChange={(e) => setDownloadConfig((prev) => ({ ...prev, customName: e.target.value }))}
                                        placeholder="e.g., batch1, morning_scan, seafood_products"
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={downloadConfig.useCurrentDate}
                                            onChange={(e) => setDownloadConfig((prev) => ({ ...prev, useCurrentDate: e.target.checked }))}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Use current date</span>
                                    </label>

                                    {!downloadConfig.useCurrentDate && (
                                        <input
                                            type="date"
                                            value={downloadConfig.classificationDate}
                                            onChange={(e) => setDownloadConfig((prev) => ({ ...prev, classificationDate: e.target.value }))}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                                        />
                                    )}
                                </div>

                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    <p className="mb-1 text-xs text-gray-600">Filename preview:</p>
                                    <p className="break-all font-mono text-sm text-gray-800">
                                        {(() => {
                                            const parts: string[] = []
                                            const supermarket = downloadConfig.supermarket.trim() || 'supermarket'
                                            parts.push(supermarket.toLowerCase().replace(/[^a-z0-9]/g, '_'))
                                            if (downloadConfig.customName.trim()) {
                                                parts.push(downloadConfig.customName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase())
                                            }
                                            parts.push('classification')

                                            const dateStr = downloadConfig.useCurrentDate
                                                ? new Date().toISOString().split('T')[0].replace(/-/g, '')
                                                : downloadConfig.classificationDate.replace(/-/g, '') || 'YYYYMMDD'
                                            parts.push(dateStr)

                                            return `${parts.join('_')}.json`
                                        })()}
                                    </p>
                                </div>

                                <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-3">
                                    <input
                                        type="checkbox"
                                        checked={saveToCloudAfterDownload}
                                        onChange={(e) => setSaveToCloudAfterDownload(e.target.checked)}
                                        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">Save to cloud after download</p>
                                        <p className="text-xs text-gray-600">Keeps a copy in Firebase so you can load it later from Product Uploads.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <button
                                    onClick={() => setShowDownloadModal(false)}
                                    className="sm:flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveResultsToCloudOnly}
                                    disabled={!outputData.length || isSavingToCloud || isDownloadingResults}
                                    className="sm:flex-1 rounded-lg border border-blue-500 px-4 py-2 text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                                >
                                    {isSavingToCloud ? 'Saving...' : 'Save to Cloud'}
                                </button>
                                <button
                                    onClick={handleEnhancedDownload}
                                    disabled={!downloadConfig.supermarket.trim() || !outputData.length || isDownloadingResults || isSavingToCloud}
                                    className="sm:flex-1 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                                >
                                    {isDownloadingResults ? 'Preparing...' : saveToCloudAfterDownload ? 'Download & Save' : 'Download'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </PageContent>

            {/* Model Settings Modal */}
            {showModelSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6">
                        <h3 className="mb-4 text-lg font-bold text-gray-900">Model Settings</h3>
                        <div className="space-y-4">
                            {allowedModelsLoading && (
                                <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">
                                    Loading allowed models...
                                </div>
                            )}
                            {allowedModelsError && !allowedModelsLoading && (
                                <div className="rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-800">
                                    {allowedModelsError}. Using fallback defaults.
                                </div>
                            )}
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">Groq</label>
                                <select
                                    value={selectedModels.groq || ''}
                                    onChange={(e) => handleModelChange('groq', e.target.value)}
                                    disabled={allowedModelsLoading || groqModels.length === 0}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                >
                                    {allowedModelsLoading && <option value="" disabled>Loading models...</option>}
                                    {!allowedModelsLoading && groqModels.length === 0 && <option value="" disabled>No models configured</option>}
                                    {!allowedModelsLoading && groqModels.map((model) => (
                                        <option key={model} value={model}>
                                            {model}
                                        </option>
                                    ))}
                                </select>
                                {!allowedModelsLoading && groqModels.length === 0 && (
                                    <p className="mt-1 text-xs text-gray-500">Add Groq models from Settings.</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">OpenRouter</label>
                                <select
                                    value={selectedModels.openrouter || ''}
                                    onChange={(e) => handleModelChange('openrouter', e.target.value)}
                                    disabled={allowedModelsLoading || openrouterModels.length === 0}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                >
                                    {allowedModelsLoading && <option value="" disabled>Loading models...</option>}
                                    {!allowedModelsLoading && openrouterModels.length === 0 && <option value="" disabled>No models configured</option>}
                                    {!allowedModelsLoading && openrouterModels.map((model) => (
                                        <option key={model} value={model}>
                                            {model}
                                        </option>
                                    ))}
                                </select>
                                {!allowedModelsLoading && openrouterModels.length === 0 && (
                                    <p className="mt-1 text-xs text-gray-500">Add OpenRouter models from Settings.</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">Cerebras</label>
                                <select
                                    value={selectedModels.cerebras || ''}
                                    onChange={(e) => handleModelChange('cerebras', e.target.value)}
                                    disabled={allowedModelsLoading || cerebrasModels.length === 0}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                >
                                    {allowedModelsLoading && <option value="" disabled>Loading models...</option>}
                                    {!allowedModelsLoading && cerebrasModels.length === 0 && <option value="" disabled>No models configured</option>}
                                    {!allowedModelsLoading && cerebrasModels.map((model) => (
                                        <option key={model} value={model}>
                                            {model}
                                        </option>
                                    ))}
                                </select>
                                {!allowedModelsLoading && cerebrasModels.length === 0 && (
                                    <p className="mt-1 text-xs text-gray-500">Add Cerebras models from Settings.</p>
                                )}
                                {!allowedModelsLoading && cerebrasModels.length === 1 && (
                                    <p className="mt-1 text-xs text-gray-500">Cerebras model is fixed for stability.</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">Gemini</label>
                                <select
                                    value={selectedModels.gemini || ''}
                                    onChange={(e) => handleModelChange('gemini', e.target.value)}
                                    disabled={allowedModelsLoading || geminiModels.length === 0}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                >
                                    {allowedModelsLoading && <option value="" disabled>Loading models...</option>}
                                    {!allowedModelsLoading && geminiModels.length === 0 && <option value="" disabled>No models configured</option>}
                                    {!allowedModelsLoading && geminiModels.map((model) => (
                                        <option key={model} value={model}>
                                            {model}
                                        </option>
                                    ))}
                                </select>
                                {!allowedModelsLoading && geminiModels.length === 0 && (
                                    <p className="mt-1 text-xs text-gray-500">Add Gemini models from Settings.</p>
                                )}
                            </div>
                        </div>
                        <div className="mt-6 flex space-x-3">
                            <button
                                onClick={() => setShowModelSettings(false)}
                                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default Classifier

"use client"

import { useState, useEffect, useCallback, useMemo, type ElementType } from 'react'
import { useGlobalToast } from '@/contexts/ToastContext'
import { CalendarEdit, DirectNotification, SearchNormal1, Setting4, Data, Trash, Refresh, Edit, CloseCircle, TickCircle } from 'iconsax-react'
import PageContent from '@/components/layout/PageContent'
import { OutlineButton, PrimaryButton } from '@/components/ui/Button'
import { API_BASE_URL } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHero } from '@/components/shared/PageHero'
import { PageHeader } from '@/components/layout/PageHeader'
import { GlassStatCard, type StatAccent } from '@/components/shared/GlassStatCard'
import { GlassSubTabs } from '@/components/shared/GlassSubTabs'
import { GlassFilterBar, type GlassFilterSelectConfig, type GlassFilterOption } from '@/components/shared/GlassFilterBar'

interface CacheEntry {
  cache_key: string
  original_name: string
  normalized_name: string
  result: {
    product_type: string | null
    brand_name: string
    variety: string | null
    price: string
    size: string | null
    product_name: string
    model_used: string
    status?: string
    complete_ai_response?: string
    image_url?: string
  }
  is_valid: boolean
  access_count: number
  timestamp: string
  last_accessed: string
  sample_price: string
  price_variations: string[]
}

interface CacheStats {
  total_entries: number
  valid_entries: number
  expired_entries: number
  cache_hits: number
  cache_misses: number
  fuzzy_matches: number
  hit_rate_percentage: number
  cache_file_size: string
}

interface CacheConfig {
  similarity_threshold: number
  fuzzy_threshold: number
  max_age_days: number
}

interface Suggestion {
  cached_name: string
  access_count: number
  similarity: number
  timestamp: string
  result: {
    product_type: string | null
    brand_name: string
    variety: string | null
    product_name: string
    price: string
    size: string | null
  }
}

type CacheStatCard = {
    key: string
    label: string
    value: string
    subtext: string
    accent: StatAccent
    icon: ElementType
}

type CacheTabKey = 'overview' | 'search'

function CacheManagement() {
    const { success, error: showError, warning, info, confirm } = useGlobalToast()
    
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
    const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'expired'>('all')
    const [editingEntry, setEditingEntry] = useState<CacheEntry | null>(null)
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [searchingProduct, setSearchingProduct] = useState('')
    const [activePanel, setActivePanel] = useState<CacheTabKey>('overview')
    const [deletingEntries, setDeletingEntries] = useState<Set<string>>(new Set())
    const [sortOrder, setSortOrder] = useState<'recent' | 'oldest' | 'hits'>('recent')
    
    // Configuration state
    const [config, setConfig] = useState<CacheConfig>({
        similarity_threshold: 0.85,
        fuzzy_threshold: 0.6,
        max_age_days: 30
    })
    const [showConfig, setShowConfig] = useState(false)
    const [tempConfig, setTempConfig] = useState<CacheConfig>(config)

    const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('checking')
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

    const apiBaseUrl = API_BASE_URL

    const formatNumber = useCallback((value?: number | null) => new Intl.NumberFormat('en-US').format(value ?? 0), [])

    const stats = useMemo(() => {
        const hitRateRaw = cacheStats?.hit_rate_percentage
        const hitRateNumeric = typeof hitRateRaw === 'number' ? hitRateRaw : parseFloat(String(hitRateRaw ?? 0))
        const hitRateValue = Number.isFinite(hitRateNumeric) ? `${hitRateNumeric.toFixed(2)}%` : `${hitRateRaw ?? '0'}%`

        return [
            {
                label: 'Total Entries',
                subtext: 'Cached responses stored',
                value: loading ? '...' : formatNumber(cacheStats?.total_entries ?? 0),
                color: 'indigo',
                icon: Data,
            },
            {
                label: 'Hit Rate',
                subtext: 'Resolved without models',
                value: loading ? '...' : hitRateValue,
                color: 'emerald',
                icon: DirectNotification,
            },
            {
                label: 'Storage Used',
                subtext: 'Current disk footprint',
                value: loading ? '...' : (cacheStats?.cache_file_size || '0 KB'),
                color: 'amber',
                icon: Setting4,
            },
            {
                label: 'Valid Entries',
                subtext: 'Ready for instant hits',
                value: loading ? '...' : formatNumber(cacheStats?.valid_entries ?? 0),
                color: 'blue',
                icon: TickCircle,
            },
        ]
    }, [cacheStats, loading, formatNumber])

    const backendStatusChip = useMemo(() => {
        switch (backendStatus) {
            case 'online':
                return {
                    label: 'Backend online',
                    chipClass: 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
                    dotClass: 'bg-emerald-300'
                }
            case 'offline':
                return {
                    label: 'Backend offline',
                    chipClass: 'border border-rose-400/40 bg-rose-500/10 text-rose-100',
                    dotClass: 'bg-rose-300'
                }
            default:
                return {
                    label: 'Checking status...',
                    chipClass: 'border border-amber-400/40 bg-amber-500/10 text-amber-100',
                    dotClass: 'bg-amber-300'
                }
        }
    }, [backendStatus])

    const sectionVariants = {
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0 },
    }

    const listItemVariants = {
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
    }

    useEffect(() => {
        loadCacheData()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps


    const loadCacheData = useCallback(async () => {
        console.log('Loading cache data...')
        setLoading(true)
        setError(null)
        
        try {
            // Add cache-busting timestamp
            const timestamp = Date.now()
            
            // PARALLEL LOADING: Fetch all data simultaneously
            const [statusResult, statsResult, entriesResult, configResult] = await Promise.allSettled([
                checkBackendStatus(),
                fetch(`${apiBaseUrl}/api/cache/stats?t=${timestamp}`),
                fetch(`${apiBaseUrl}/api/cache/entries?t=${timestamp}`),
                fetch(`${apiBaseUrl}/api/cache/config`)
            ])

            // Handle status check
            if (statusResult.status === 'fulfilled') {
                console.log('Backend status checked')
            }

            // Handle stats response
            if (statsResult.status === 'fulfilled' && statsResult.value.ok) {
                const stats = await statsResult.value.json()
                console.log('Cache stats loaded:', stats)
                setCacheStats(stats)
                setBackendStatus('online')
            } else {
                throw new Error('Failed to load cache stats')
            }

            // Handle entries response
            if (entriesResult.status === 'fulfilled' && entriesResult.value.ok) {
                const data = await entriesResult.value.json()
                console.log('Cache entries loaded:', data.entries?.length, 'entries')
                setCacheEntries(data.entries || [])
            } else {
                throw new Error('Failed to load cache entries')
            }

            // Handle config response
            if (configResult.status === 'fulfilled' && configResult.value.ok) {
                const configData = await configResult.value.json()
                setConfig(configData)
                setTempConfig(configData)
            }
        } catch (err) {
            console.error('Error loading cache data:', err)
            setBackendStatus('offline')
            setError(err instanceof Error ? err.message : 'Failed to load cache data')
            // Set fallback data
            setCacheStats({
                total_entries: 0,
                valid_entries: 0,
                expired_entries: 0,
                cache_hits: 0,
                cache_misses: 0,
                fuzzy_matches: 0,
                hit_rate_percentage: 0,
                cache_file_size: '0 KB'
            })
            setCacheEntries([])
        } finally {
            setLoading(false)
            setLastRefreshedAt(new Date())
            console.log('Cache data loading completed')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBaseUrl])

    useEffect(() => {
        if (!autoRefresh) {
            return
        }
        const interval = setInterval(() => {
            loadCacheData()
        }, 60000)
        return () => clearInterval(interval)
    }, [autoRefresh, loadCacheData])

    const loadCacheConfig = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/api/cache/config`)
            if (response.ok) {
                const configData = await response.json()
                setConfig(configData)
                setTempConfig(configData)
            }
        } catch (err) {
            console.error('Failed to load cache config:', err)
        }
    }

    const handleSearchProduct = async () => {
        if (!searchingProduct.trim()) {
            setSuggestions([])
            return
        }

        try {
            const response = await fetch(`${apiBaseUrl}/api/cache/suggestions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_name: searchingProduct })
            })

            if (response.ok) {
                const data = await response.json()
                setSuggestions(data.suggestions || [])
            }
        } catch (err) {
            setError(`Failed to search products: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
    }

    const updateConfiguration = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/api/cache/configure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tempConfig)
            })

            if (response.ok) {
                setConfig(tempConfig)
                setShowConfig(false)
                loadCacheData()
            } else {
                throw new Error('Failed to update configuration')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update configuration')
        }
    }

    const updateCacheEntry = async (entry: CacheEntry) => {
        try {
            const response = await fetch(`${apiBaseUrl}/api/cache/entry`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cache_key: entry.cache_key,
                    updated_result: entry.result
                })
            })

            if (response.ok) {
                setEditingEntry(null)
                loadCacheData()
                return true
            } else {
                throw new Error('Failed to update entry')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update entry')
            return false
        }
    }

    const deleteCacheEntry = async (cacheKey: string) => {
        const confirmed = await confirm(
            'Delete Cache Entry',
            'Are you sure you want to delete this cache entry?'
        )
        if (!confirmed) {
            return
        }

        console.log('Deleting cache entry:', cacheKey)
        setError(null) // Clear any previous errors
        
        // Add to deleting set
        setDeletingEntries(prev => new Set(prev).add(cacheKey))

        try {
            const response = await fetch(`${apiBaseUrl}/api/cache/entry`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cache_key: cacheKey })
            })

            console.log('Delete response status:', response.status)
            const responseText = await response.text()
            console.log('Delete response:', responseText)

            if (response.ok) {
                console.log('Delete successful, reloading cache data...')
                await loadCacheData()
                console.log('Cache data reloaded')
            } else {
                throw new Error(`Failed to delete entry: ${responseText}`)
            }
        } catch (err) {
            console.error('Delete error:', err)
            setError(err instanceof Error ? err.message : 'Failed to delete entry')
        } finally {
            // Remove from deleting set
            setDeletingEntries(prev => {
                const newSet = new Set(prev)
                newSet.delete(cacheKey)
                return newSet
            })
        }
    }

    const cleanupCache = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/api/cache/cleanup`, {
                method: 'POST'
            })

            if (response.ok) {
                const data = await response.json()
                success('Cache Cleanup', data.message)
                loadCacheData()
            } else {
                throw new Error('Failed to cleanup cache')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to cleanup cache')
        }
    }

    const clearCache = async () => {
        const confirmed = await confirm(
            'Clear All Cache',
            'Are you sure you want to clear ALL cache entries? This cannot be undone!'
        )
        if (!confirmed) {
            return
        }

        try {
            const response = await fetch(`${apiBaseUrl}/api/cache/clear`, {
                method: 'POST'
            })

            if (response.ok) {
                const data = await response.json()
                success('Cache Cleared', data.message)
                loadCacheData()
            } else {
                throw new Error('Failed to clear cache')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear cache')
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString()
    }

    const filteredEntries = useMemo(() => {
        const query = searchTerm.toLowerCase().trim()
        const matches = cacheEntries.filter(entry => {
            const matchesSearch = !query ||
                entry.original_name.toLowerCase().includes(query) ||
                (entry.result.product_type && entry.result.product_type.toLowerCase().includes(query)) ||
                (entry.result.brand_name && entry.result.brand_name.toLowerCase().includes(query))

            const matchesStatus = filterStatus === 'all' ||
                (filterStatus === 'valid' && entry.is_valid) ||
                (filterStatus === 'expired' && !entry.is_valid)

            return matchesSearch && matchesStatus
        })

        const sorted = [...matches].sort((a, b) => {
            if (sortOrder === 'recent') {
                return new Date(b.last_accessed).getTime() - new Date(a.last_accessed).getTime()
            }
            if (sortOrder === 'oldest') {
                return new Date(a.last_accessed).getTime() - new Date(b.last_accessed).getTime()
            }
            return b.access_count - a.access_count
        })

        return sorted
    }, [cacheEntries, searchTerm, filterStatus, sortOrder])

    const statusOptions: GlassFilterOption[] = [
        { value: 'all', label: 'All entries' },
        { value: 'valid', label: 'Valid only' },
        { value: 'expired', label: 'Expired only' }
    ]

    const sortOptions: GlassFilterOption[] = [
        { value: 'recent', label: 'Most recent' },
        { value: 'oldest', label: 'Oldest first' },
        { value: 'hits', label: 'Most accessed' }
    ]

    const cacheFilterSelects: GlassFilterSelectConfig[] = [
        {
            label: 'Entry status',
            value: filterStatus,
            options: statusOptions,
            onChange: (value) => setFilterStatus(value as 'all' | 'valid' | 'expired')
        },
        {
            label: 'Sort by',
            value: sortOrder,
            options: sortOptions,
            onChange: (value) => setSortOrder(value as 'recent' | 'oldest' | 'hits')
        }
    ]

    const lastRefreshedLabel = useMemo(() => (
        lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
    ), [lastRefreshedAt])

    const cacheTabs = useMemo(() => [
        {
            key: 'overview' as const,
            label: 'Cache Overview',
            description: `${filteredEntries.length} of ${cacheEntries.length} entries visible`,
            icon: Data,
            accentGradient: 'bg-gradient-to-br from-indigo-500/10 via-white to-transparent'
        },
        {
            key: 'search' as const,
            label: 'Smart Search',
            description: suggestions.length ? `${suggestions.length} suggestions ready` : 'Similarity + fuzzy lookup',
            icon: SearchNormal1,
            accentGradient: 'bg-gradient-to-br from-emerald-500/10 via-white to-transparent',
            badgeValue: suggestions.length ? suggestions.length : undefined,
            badgeClassName: 'bg-emerald-500'
        }
    ], [cacheEntries.length, filteredEntries.length, suggestions.length])

    const checkBackendStatus = async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/api/health`)
            if (response.ok) {
                setBackendStatus('online')
            } else {
                setBackendStatus('offline')
            }
        } catch (err) {
            setBackendStatus('offline')
        }
    }

    return (
        <div>
            <PageHeader 
                title="Cache Control" 
                subtitle="Manage classification cache" 
                icon={Data}
                onRefresh={() => void loadCacheData()} 
            />
            <PageContent>
                <div className='space-y-6'>
                    <PageHero
                        category="Cache Management"
                        title="Classification Cache Control"
                        description="Monitor cache health, tune similarity thresholds, and curate stored predictions without leaving this dashboard."
                        badges={
                            <>
                                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium ${backendStatusChip.chipClass}`}>
                                    <span className={`h-2 w-2 rounded-full ${backendStatusChip.dotClass}`} />
                                    {backendStatusChip.label}
                                </span>
                                <span className='inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-600'>
                                    <CalendarEdit size={16} className='text-slate-500' />
                                    Max age {config.max_age_days} days
                                </span>
                            </>
                        }
                    >
                        <div className="mt-6 flex items-center gap-2">
                            <button 
                                className='all-center h-10 w-10 duration-200 hover:bg-gray-100 rounded-xl'
                                onClick={() => setActivePanel((panel) => panel === 'search' ? 'overview' : 'search')}
                                title="Search"
                            >
                                <SearchNormal1 size={16} />
                            </button>

                            <button 
                                className='all-center h-10 w-10 duration-200 hover:bg-gray-100 rounded-xl'
                                onClick={() => setShowConfig(true)}
                                title="Settings"
                            >
                                <Setting4 size={16} />
                            </button>

                            <OutlineButton 
                                className='h-10 gap-2 px-4 duration-200 hover:bg-orange-100 rounded-xl text-xs all-center text-orange-600 border-orange-200'
                                onClick={cleanupCache}
                            >
                                <Trash size={16} />
                                <span className='hidden md:inline'>Cleanup</span>
                            </OutlineButton>

                            <PrimaryButton 
                                className='h-10 gap-2 bg-red-500 hidden px-4 duration-200 text-white rounded-xl text-xs md:flex items-center justify-center'
                                onClick={clearCache}
                            >
                                <Trash size={16} />
                                <span className='hidden md:inline'>Clear All</span>
                            </PrimaryButton>
                        </div>
                    </PageHero>

                    {/* Stat Cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <GlassStatCard 
                            label={stats[0].label} 
                            value={String(stats[0].value)} 
                            subtext={stats[0].subtext} 
                            accent="indigo" 
                            icon={stats[0].icon} 
                        />
                        <GlassStatCard 
                            label={stats[1].label} 
                            value={String(stats[1].value)} 
                            subtext={stats[1].subtext} 
                            accent="emerald" 
                            icon={stats[1].icon} 
                        />
                        <GlassStatCard 
                            label={stats[2].label} 
                            value={String(stats[2].value)} 
                            subtext={stats[2].subtext} 
                            accent="amber" 
                            icon={stats[2].icon} 
                        />
                        <GlassStatCard 
                            label={stats[3].label} 
                            value={String(stats[3].value)} 
                            subtext={stats[3].subtext} 
                            accent="blue" 
                            icon={stats[3].icon} 
                        />
                    </div>

                    {/* Error Display */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className='rounded-2xl border border-rose-200 bg-rose-50/90 px-5 py-4 shadow-sm'
                            >
                                <div className='flex items-start gap-3'>
                                    <div className='mt-0.5 rounded-full bg-rose-100 p-1.5'>
                                        <CloseCircle size={16} className='text-rose-500' />
                                    </div>
                                    <div className='flex-1'>
                                        <p className='text-sm font-semibold text-rose-700'>Cache operation failed</p>
                                        <p className='text-sm text-rose-600'>{error}</p>
                                    </div>
                                    <button
                                        onClick={() => setError(null)}
                                        className='rounded-full bg-rose-100 p-1.5 text-rose-500 transition hover:bg-rose-200 hover:text-rose-600'
                                    >
                                        <CloseCircle size={14} />
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className='space-y-6'>
                        <GlassSubTabs
                            tabs={cacheTabs}
                            activeKey={activePanel}
                            onChange={setActivePanel}
                            layoutId='cache-management-tabs'
                            columnsClassName='grid-cols-1 md:grid-cols-2'
                        />

                        {activePanel === 'overview' && (
                            <GlassFilterBar
                                searchPlaceholder='Search original name, product type, or brand'
                                searchValue={searchTerm}
                                onSearchChange={setSearchTerm}
                                selects={cacheFilterSelects}
                                onRefresh={() => void loadCacheData()}
                                autoRefresh={autoRefresh}
                                onAutoRefreshChange={setAutoRefresh}
                                lastRefreshedLabel={lastRefreshedLabel}
                            />
                        )}

                        {activePanel === 'search' && (
                            <motion.div
                                key='search-panel'
                                variants={sectionVariants}
                                initial='hidden'
                                animate='visible'
                                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className='rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-6 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60'
                            >
                                <div className='flex flex-wrap items-center justify-between gap-3'>
                                    <div>
                                        <h3 className='text-base font-semibold text-slate-900'>Smart Cache Search</h3>
                                        <p className='text-sm text-slate-500'>Surface near matches instantly to ground new entries or debug fuzzy hits.</p>
                                    </div>
                                    <span className='inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600'>
                                        <SearchNormal1 size={14} />
                                        Using similarity {config.similarity_threshold} / fuzzy {config.fuzzy_threshold}
                                    </span>
                                </div>
                                <div className='mt-4 flex flex-col gap-3 md:flex-row'>
                                    <div className='relative flex-1'>
                                        <SearchNormal1 size={16} className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' />
                                        <input
                                            type="text"
                                            placeholder="Search cached product names or brands..."
                                            value={searchingProduct}
                                            onChange={(e) => setSearchingProduct(e.target.value)}
                                            className='w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm text-slate-700 shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
                                        />
                                    </div>
                                    <div className='flex gap-2'>
                                        <button 
                                            onClick={handleSearchProduct}
                                            className='inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
                                        >
                                            <SearchNormal1 size={16} />
                                            Search
                                        </button>
                                        <button
                                            onClick={() => { setSearchingProduct(''); setSuggestions([]) }}
                                            className='inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50'
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                                <AnimatePresence>
                                    {suggestions.length > 0 && (
                                        <motion.div
                                            key='suggestions'
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.25 }}
                                            className='mt-5 space-y-2'
                                        >
                                            <p className='text-sm font-medium text-slate-600'>Suggested cache hits</p>
                                            {suggestions.map((suggestion, index) => (
                                                <motion.div
                                                    key={`${suggestion.cached_name}-${index}`}
                                                    variants={listItemVariants}
                                                    initial='hidden'
                                                    animate='visible'
                                                    transition={{ duration: 0.25, delay: index * 0.04 }}
                                                    className='rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-inner'
                                                >
                                                    <div className='flex flex-wrap items-start justify-between gap-3'>
                                                        <div>
                                                            <p className='text-sm font-semibold text-slate-900'>{suggestion.cached_name}</p>
                                                            <p className='text-xs text-slate-500'>
                                                                {suggestion.result.product_type || 'Unknown Type'} • {suggestion.result.brand_name} • {suggestion.result.variety || 'No Variety'}
                                                            </p>
                                                        </div>
                                                        <span className='inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600'>
                                                            {Math.round(suggestion.similarity * 100)}% match
                                                        </span>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </div>
                    {/* Cache Configuration Summary */}
                    <motion.div
                        variants={sectionVariants}
                        initial='hidden'
                        animate='visible'
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        className='rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-6 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60'
                    >
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                            <div>
                                <h3 className='text-base font-semibold text-slate-900'>Current configuration</h3>
                                <p className='text-sm text-slate-500'>Live thresholds steering cache hits, fuzziness, and expiry rules.</p>
                            </div>
                            <button 
                                onClick={() => setShowConfig(true)}
                                className='inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10'
                            >
                                <Setting4 size={16} />
                                Edit configuration
                            </button>
                        </div>
                        <div className='mt-5 grid grid-cols-1 gap-4 md:grid-cols-3'>
                            <motion.div
                                variants={listItemVariants}
                                initial='hidden'
                                animate='visible'
                                className='relative overflow-hidden rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-50 via-white to-white px-5 py-4'
                            >
                                <div className='flex items-center justify-between'>
                                    <span className='text-sm font-semibold text-blue-700'>Similarity threshold</span>
                                    <span className='rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-600'>Cache hits</span>
                                </div>
                                <p className='mt-4 text-3xl font-semibold text-blue-700'>{config.similarity_threshold}</p>
                                <p className='mt-1 text-xs text-blue-600'>
                                    {config.similarity_threshold >= 0.95 ? 'Very strict (high precision)' : 
                                     config.similarity_threshold >= 0.85 ? 'Balanced matching' : 'Lenient matching'}
                                </p>
                            </motion.div>
                            <motion.div
                                variants={listItemVariants}
                                initial='hidden'
                                animate='visible'
                                className='relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 via-white to-white px-5 py-4'
                            >
                                <div className='flex items-center justify-between'>
                                    <span className='text-sm font-semibold text-emerald-700'>Fuzzy threshold</span>
                                    <span className='rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-600'>Suggestions</span>
                                </div>
                                <p className='mt-4 text-3xl font-semibold text-emerald-700'>{config.fuzzy_threshold}</p>
                                <p className='mt-1 text-xs text-emerald-600'>
                                    {config.fuzzy_threshold >= 0.7 ? 'High relevance only' : 
                                     config.fuzzy_threshold >= 0.5 ? 'Balanced suggestions' : 'Broad coverage'}
                                </p>
                            </motion.div>
                            <motion.div
                                variants={listItemVariants}
                                initial='hidden'
                                animate='visible'
                                className='relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-white px-5 py-4'
                            >
                                <div className='flex items-center justify-between'>
                                    <span className='text-sm font-semibold text-amber-700'>Max age</span>
                                    <span className='rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-600'>Expiry</span>
                                </div>
                                <p className='mt-4 text-3xl font-semibold text-amber-700'>{config.max_age_days}</p>
                                <p className='mt-1 text-xs text-amber-600'>
                                    {config.max_age_days <= 14 ? 'Fresh results prioritised' : 
                                     config.max_age_days <= 30 ? 'Balanced retention' : 'Long-term retention'}
                                </p>
                            </motion.div>
                        </div>
                    </motion.div>

                    {activePanel === 'overview' && (
                        <motion.div
                            variants={sectionVariants}
                            initial='hidden'
                            animate='visible'
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                            className='rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-6 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60'
                        >
                            <div className='flex flex-wrap items-center justify-between gap-3'>
                                <div>
                                    <h3 className='text-base font-semibold text-slate-900'>Cache entries</h3>
                                    <p className='text-sm text-slate-500'>Review, edit, or remove cached classifier decisions.</p>
                                </div>
                                <p className='text-xs font-medium text-slate-500'>{filteredEntries.length} of {cacheEntries.length} entries</p>
                            </div>

                            {loading ? (
                                <div className='mt-6 grid gap-3 md:grid-cols-2'>
                                    {Array.from({ length: 6 }).map((_, index) => (
                                        <div key={`cache-skeleton-${index}`} className='rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-inner animate-pulse'>
                                            <div className='h-4 w-3/4 rounded bg-slate-200 mb-3'></div>
                                            <div className='h-3 w-1/2 rounded bg-slate-200 mb-2'></div>
                                            <div className='h-3 w-1/3 rounded bg-slate-200'></div>
                                            <div className='mt-5 h-2 w-full rounded bg-slate-200'></div>
                                        </div>
                                    ))}
                                </div>
                            ) : filteredEntries.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className='mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center'
                                >
                                    <Data size={36} className='text-slate-400' />
                                    <p className='mt-3 text-sm font-semibold text-slate-600'>No cache entries found</p>
                                    <p className='mt-1 text-xs text-slate-500'>
                                        {cacheEntries.length === 0 ? 'Cache entries will appear once new classifications are cached.' : 'Try adjusting your filters or search query.'}
                                    </p>
                                </motion.div>
                            ) : (
                                <div className='mt-6 grid gap-4 lg:grid-cols-2'>
                                    {filteredEntries.map((entry, index) => (
                                        <motion.div
                                            key={entry.cache_key}
                                            variants={listItemVariants}
                                            initial='hidden'
                                            animate='visible'
                                            transition={{ duration: 0.25, delay: index * 0.03 }}
                                            className='group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg'
                                        >
                                            <div className='absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/40 via-primary/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100' />
                                            <div className='flex flex-wrap items-start justify-between gap-3'>
                                                <div className='space-y-2'>
                                                    <h4 className='text-sm font-semibold text-slate-900'>{entry.original_name}</h4>
                                                    <div className='flex flex-wrap gap-2 text-xs text-slate-500'>
                                                        <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600'>
                                                            {entry.result.product_type || 'Unknown type'}
                                                        </span>
                                                        {entry.result.brand_name && (
                                                            <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600'>
                                                                {entry.result.brand_name}
                                                            </span>
                                                        )}
                                                        {entry.result.variety && (
                                                            <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600'>
                                                                {entry.result.variety}
                                                            </span>
                                                        )}
                                                        {entry.result.size && (
                                                            <span className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600'>
                                                                {entry.result.size}
                                                            </span>
                                                        )}
                                                        {entry.result.price && (
                                                            <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-600'>
                                                                {entry.result.price}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className='flex items-center gap-2'>
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                        entry.is_valid ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                                                    }`}>
                                                        <span className='h-2 w-2 rounded-full bg-current opacity-70' />
                                                        {entry.is_valid ? 'Valid' : 'Expired'}
                                                    </span>
                                                    <button 
                                                        onClick={() => setEditingEntry(entry)}
                                                        className='rounded-lg border border-slate-200 bg-white p-2 text-primary transition hover:border-primary/40 hover:bg-primary/10'
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => deleteCacheEntry(entry.cache_key)}
                                                        disabled={deletingEntries.has(entry.cache_key)}
                                                        className={`rounded-lg border p-2 transition ${
                                                            deletingEntries.has(entry.cache_key) 
                                                                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed' 
                                                                : 'border-rose-200 bg-rose-50 text-rose-500 hover:border-rose-300 hover:bg-rose-100'
                                                        }`}
                                                    >
                                                        <Trash size={16} className={deletingEntries.has(entry.cache_key) ? 'animate-pulse' : ''} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className='mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500'>
                                                <span>Accessed {entry.access_count} time{entry.access_count !== 1 ? 's' : ''}</span>
                                                <span>Last accessed {formatDate(entry.last_accessed)}</span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>

                {/* Configuration Modal */}
                {showConfig && (
                    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
                        <div className='bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto'>
                            <div className='flex justify-between items-center mb-6'>
                                <div>
                                    <h3 className='text-lg font-semibold text-gray-800'>Cache Configuration</h3>
                                    <p className='text-sm text-gray-600 mt-1'>Fine-tune cache behavior for optimal performance</p>
                                </div>
                                <button 
                                    onClick={() => setShowConfig(false)}
                                    className='text-gray-500 hover:text-gray-700'
                                >
                                    <CloseCircle size={20} />
                                </button>
                            </div>
                            
                            <div className='space-y-6'>
                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                                        Similarity Threshold
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={tempConfig.similarity_threshold}
                                        onChange={(e) => setTempConfig({...tempConfig, similarity_threshold: parseFloat(e.target.value)})}
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                                    />
                                    <div className='mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg'>
                                        <p className='text-xs text-blue-800 font-medium mb-1'>
                                            📏 Cache Hit Threshold (Current: {tempConfig.similarity_threshold})
                                        </p>
                                        <p className='text-xs text-blue-700'>
                                            Controls when products are considered &ldquo;the same&rdquo; for cache matching. 
                                            Higher values (0.95+) require very exact matches, lower values (0.80-0.90) allow more variation in wording.
                                        </p>
                                        <p className='text-xs text-blue-600 mt-1'>
                                            • 0.95+ = Very strict (recommended for production)
                                            • 0.85-0.94 = Moderate flexibility 
                                            • 0.80-0.84 = More lenient matching
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                                        Fuzzy Threshold
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={tempConfig.fuzzy_threshold}
                                        onChange={(e) => setTempConfig({...tempConfig, fuzzy_threshold: parseFloat(e.target.value)})}
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                                    />
                                    <div className='mt-2 p-3 bg-green-50 border border-green-200 rounded-lg'>
                                        <p className='text-xs text-green-800 font-medium mb-1'>
                                            🔍 Suggestion Threshold (Current: {tempConfig.fuzzy_threshold})
                                        </p>
                                        <p className='text-xs text-green-700'>
                                            Minimum similarity score for showing cache suggestions when searching. 
                                            This doesn&rsquo;t affect cache hits, only what suggestions are displayed to users.
                                        </p>
                                        <p className='text-xs text-green-600 mt-1'>
                                            • 0.7+ = Only very relevant suggestions
                                            • 0.5-0.69 = Moderate relevance
                                            • 0.3-0.49 = Include loosely related items
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                                        Max Age (Days)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={tempConfig.max_age_days}
                                        onChange={(e) => setTempConfig({...tempConfig, max_age_days: parseInt(e.target.value)})}
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                                    />
                                    <div className='mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg'>
                                        <p className='text-xs text-orange-800 font-medium mb-1'>
                                            ⏰ Cache Expiration (Current: {tempConfig.max_age_days} days)
                                        </p>
                                        <p className='text-xs text-orange-700'>
                                            How long cache entries remain valid before being considered expired. 
                                            Expired entries won&rsquo;t be used for cache hits but remain visible for review.
                                        </p>
                                        <p className='text-xs text-orange-600 mt-1'>
                                            • 7-14 days = Fresh data, frequent updates
                                            • 30 days = Balanced (recommended)
                                            • 60+ days = Long-term stability
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className='flex gap-3 mt-6'>
                                <button
                                    onClick={() => {
                                        setTempConfig(config)
                                        setShowConfig(false)
                                    }}
                                    className='flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50'
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={updateConfiguration}
                                    className='flex-1 bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90'
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Entry Modal */}
                {editingEntry && (
                    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
                        <div className='bg-white rounded-lg p-6 max-w-md w-full mx-4'>
                            <div className='flex justify-between items-center mb-4'>
                                <h3 className='text-lg font-semibold text-gray-800'>Edit Cache Entry</h3>
                                <button 
                                    onClick={() => setEditingEntry(null)}
                                    className='text-gray-500 hover:text-gray-700'
                                >
                                    <CloseCircle size={20} />
                                </button>
                            </div>
                            
                            <div className='space-y-4'>
                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Product Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editingEntry.original_name}
                                        readOnly
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50'
                                    />
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Product Type
                                    </label>
                                    <input
                                        type="text"
                                        value={editingEntry.result.product_type || ''}
                                        onChange={(e) => setEditingEntry({
                                            ...editingEntry,
                                            result: {...editingEntry.result, product_type: e.target.value}
                                        })}
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
                                    />
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Brand Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editingEntry.result.brand_name || ''}
                                        onChange={(e) => setEditingEntry({
                                            ...editingEntry,
                                            result: {...editingEntry.result, brand_name: e.target.value}
                                        })}
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
                                    />
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Variety
                                    </label>
                                    <input
                                        type="text"
                                        value={editingEntry.result.variety || ''}
                                        onChange={(e) => setEditingEntry({
                                            ...editingEntry,
                                            result: {...editingEntry.result, variety: e.target.value}
                                        })}
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
                                    />
                                </div>

                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Size
                                    </label>
                                    <input
                                        type="text"
                                        value={editingEntry.result.size || ''}
                                        onChange={(e) => setEditingEntry({
                                            ...editingEntry,
                                            result: {...editingEntry.result, size: e.target.value}
                                        })}
                                        className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
                                    />
                                </div>
                            </div>

                            <div className='flex gap-3 mt-6'>
                                <button
                                    onClick={() => setEditingEntry(null)}
                                    className='flex-1 border border-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-50'
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => updateCacheEntry(editingEntry)}
                                    className='flex-1 bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90'
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </PageContent>
        </div>
    )
}

export default CacheManagement

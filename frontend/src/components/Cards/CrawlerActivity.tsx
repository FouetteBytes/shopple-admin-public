"use client"

import React, { useState, useEffect } from 'react'
import { Global, Activity, TickCircle, CloseCircle, Clock, RefreshCircle, Send, DocumentUpload, ArrowUp } from 'iconsax-react'
import { useCentralStore } from '@/Store'
import { crawlerAPI } from '@/lib/api'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface CrawlerInfo {
    store: string;
    category: string;
    name: string;
    estimated_time: string;
    max_items: number;
    file: string;
}

interface CrawlerResult {
    store: string;
    category: string;
    count: number;
    completed_at: string;
    status: string;
    items: any[];
}

interface ActiveCrawler {
    store: string;
    category: string;
    status: string;
    progress?: number;
    products: number;
    lastRun: string;
    estimated_time?: string;
}

function CrawlerActivity() {
    const { crawlerStatus, setCrawlerStatus, setInputData } = useCentralStore()
    const [availableCrawlers, setAvailableCrawlers] = useState<CrawlerInfo[]>([])
    const [recentResults, setRecentResults] = useState<CrawlerResult[]>([])
    const [activeCrawlers, setActiveCrawlers] = useState<ActiveCrawler[]>([])
    const [systemStatus, setSystemStatus] = useState<string>('checking')
    const [isLoading, setIsLoading] = useState(false)
    const [isStealthRefresh, setIsStealthRefresh] = useState(false)
    const [lastUpdated, setLastUpdated] = useState<string>('')
    const router = useRouter()

    // Fetch all crawler data
    const fetchCrawlerData = async (stealthMode = false) => {
        if (stealthMode) {
            setIsStealthRefresh(true)
        } else {
            setIsLoading(true)
        }
        try {
            // PARALLEL LOADING: Fetch all crawler data simultaneously
            const [statusResult, statusesResult, availableResult, resultsResult] = await Promise.allSettled([
                crawlerAPI.getStatus(),
                crawlerAPI.getAllCrawlerStatuses(),
                crawlerAPI.getAvailableCrawlers(),
                crawlerAPI.getAllResults()
            ]);

            // Handle system status
            if (statusResult.status === 'fulfilled') {
                setSystemStatus(statusResult.value.available ? 'online' : 'offline')
            } else {
                setSystemStatus('offline')
            }
            
            // Handle active/running crawlers
            const activeList: ActiveCrawler[] = []
            if (statusesResult.status === 'fulfilled' && statusesResult.value.crawlers) {
                Object.entries(statusesResult.value.crawlers).forEach(([key, crawlerInfo]: [string, any]) => {
                    activeList.push({
                        store: crawlerInfo.store || key.split('_')[0] || 'Unknown',
                        category: crawlerInfo.category || key.split('_')[1] || 'Unknown',
                        status: crawlerInfo.status || 'unknown',
                        progress: crawlerInfo.progress || 0,
                        products: crawlerInfo.products_scraped || crawlerInfo.count || 0,
                        lastRun: crawlerInfo.last_run || crawlerInfo.start_time || new Date().toISOString(),
                        estimated_time: crawlerInfo.estimated_time
                    })
                })
            }
            setActiveCrawlers(activeList)
            
            // Handle available crawlers
            const crawlerList: CrawlerInfo[] = []
            if (availableResult.status === 'fulfilled' && availableResult.value.crawlers) {
                Object.entries(availableResult.value.crawlers).forEach(([store, categories]: [string, any]) => {
                    Object.entries(categories).forEach(([category, info]: [string, any]) => {
                        crawlerList.push({
                            store,
                            category,
                            name: info.name,
                            estimated_time: info.estimated_time,
                            max_items: info.max_items,
                            file: info.file
                        })
                    })
                })
            }
            setAvailableCrawlers(crawlerList)

            // Handle recent results
            const results = resultsResult.status === 'fulfilled' 
                ? Object.values(resultsResult.value.results || {}) as CrawlerResult[]
                : [];
            
            // Sort by completion time and take recent ones
            const sortedResults = results
                .filter(result => result.completed_at)
                .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
                .slice(0, 5)
            
            setRecentResults(sortedResults)

            // Calculate totals
            const totalProducts = results.reduce((sum, result) => sum + (result.count || 0), 0)
            const completedCrawls = results.filter(r => r.status === 'completed' || r.count > 0).length
            const successRate = results.length > 0 ? Math.round((completedCrawls / results.length) * 100) : 100
            const lastRun = sortedResults.length > 0 ? 
                new Date(sortedResults[0].completed_at).toLocaleString() : 'Never'

            // Update status with calculated values (get active crawlers from status result)
            const activeCrawlerCount = statusResult.status === 'fulfilled' 
                ? (statusResult.value.active_crawlers || 0)
                : 0;
            setCrawlerStatus({
                activeCrawlers: activeCrawlerCount,
                productsScraped: totalProducts,
                successRate: successRate,
                lastRun: lastRun
            })

            setLastUpdated(new Date().toLocaleTimeString())

        } catch (error) {
            console.error('Failed to fetch crawler data:', error)
            setSystemStatus('offline')
            setAvailableCrawlers([])
            setRecentResults([])
            setActiveCrawlers([])
        } finally {
            setIsLoading(false)
            setIsStealthRefresh(false)
        }
    }

    useEffect(() => {
        fetchCrawlerData()
        
        // Dynamic refresh interval: more frequent when crawlers are active
        const getRefreshInterval = () => {
            return activeCrawlers.length > 0 ? 10000 : 30000 // 10s when active, 30s when idle
        }
        
        const setupInterval = () => {
            const interval = setInterval(() => fetchCrawlerData(true), getRefreshInterval())
            return interval
        }
        
        const interval = setupInterval()
        return () => clearInterval(interval)
    }, [activeCrawlers.length]) // Re-setup interval when active crawlers change

    const handleSendToClassifier = async (result: CrawlerResult) => {
        try {
            // Load the actual crawler results data
            const fullResults = await crawlerAPI.getCrawlerResults(`${result.store}_${result.category}`)
            
            // Prepare products data
            const products = fullResults.products || result.items || []
            
            // Set the data in the store for the classifier
            setInputData(products)
            
            // Store data in localStorage for the classifier page to pick up
            localStorage.setItem('crawlerProducts', JSON.stringify(products))
            localStorage.setItem('crawlerProductsTimestamp', new Date().toISOString())
            
            // Mark this as a crawler-sourced classification for session tracking
            localStorage.setItem('classificationSource', 'crawler')
            localStorage.setItem('classificationCrawlerInfo', JSON.stringify({
                store: result.store,
                category: result.category,
                count: result.count
            }))
            
            // Store crawler source information for download naming
            localStorage.setItem('lastCrawlerInfo', JSON.stringify({
                store: result.store,
                category: result.category
            }))
            
            console.log('Sending to classifier:', products)
            
            // Navigate to classifier page using Next.js router
            router.push('/app/classifier')
            
        } catch (error) {
            console.error('Failed to load crawler results:', error)
            
            // Fallback to basic data if available
            const fallbackProducts = result.items || []
            if (fallbackProducts.length > 0) {
                setInputData(fallbackProducts)
                localStorage.setItem('crawlerProducts', JSON.stringify(fallbackProducts))
                localStorage.setItem('crawlerProductsTimestamp', new Date().toISOString())
                localStorage.setItem('lastCrawlerInfo', JSON.stringify({
                    store: result.store,
                    category: result.category
                }))
            }
            
            // Navigate anyway
            router.push('/app/classifier')
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'online':
                return <Activity size={14} className='text-green-500' />
            case 'offline':
                return <CloseCircle size={14} className='text-red-500' />
            default:
                return <Clock size={14} className='text-gray-400' />
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online': return 'bg-green-100 text-green-600'
            case 'offline': return 'bg-red-100 text-red-600'
            default: return 'bg-gray-100 text-gray-600'
        }
    }

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
            {/* header */}
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex items-center text-sm gap-2 min-w-0'>
                    <Global size={18} />
                    <p className='text-gray-800 font-medium truncate'>Crawler Activity</p>
                </div>
                <div className='flex items-center gap-2'>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(systemStatus)}`}>
                        {getStatusIcon(systemStatus)}
                        <span className='ml-1'>{systemStatus}</span>
                    </span>
                    <button 
                        onClick={() => fetchCrawlerData()}
                        disabled={isLoading}
                        className='p-1 rounded hover:bg-gray-100 transition-colors'
                        title='Refresh data'
                    >
                        <RefreshCircle 
                            size={14} 
                            className={`text-gray-500 ${isLoading ? 'animate-spin' : ''}`} 
                        />
                    </button>
                </div>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* content */}
            <div className='space-y-4'>
                {/* Overview stats */}
                <div className='grid grid-cols-2 gap-3'>
                    <div className='bg-gray-50 rounded-lg p-3 text-center'>
                        <p className='text-lg font-bold text-gray-800'>{crawlerStatus.activeCrawlers}</p>
                        <p className='text-xs text-gray-600'>Active Crawlers</p>
                    </div>
                    <div className='bg-gray-50 rounded-lg p-3 text-center'>
                        <p className='text-lg font-bold text-blue-600'>{availableCrawlers.length}</p>
                        <p className='text-xs text-gray-600'>Total Available</p>
                    </div>
                </div>

                {/* Active/Running Crawlers Section */}
                {activeCrawlers.length > 0 && (
                    <div>
                        <div className='flex items-center justify-between mb-3'>
                            <p className='text-xs text-gray-600 font-medium'>Running Crawlers</p>
                            <div className='flex items-center gap-1'>
                                <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse'></div>
                                <span className='text-xs text-green-600'>Live</span>
                            </div>
                        </div>
                        
                        <div className='space-y-2'>
                            {activeCrawlers.map((crawler, index) => (
                                <motion.div
                                    key={`${crawler.store}-${crawler.category}-active`}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.1 }}
                                    className='bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-3'
                                >
                                    <div className='flex items-center justify-between'>
                                        <div className='flex items-center gap-3 flex-1 min-w-0'>
                                            <div className='flex items-center gap-2'>
                                                {crawler.status === 'running' ? (
                                                    <Activity size={14} className='text-green-500 animate-pulse' />
                                                ) : crawler.status === 'completed' ? (
                                                    <TickCircle size={14} className='text-green-500' />
                                                ) : (
                                                    <Clock size={14} className='text-yellow-500' />
                                                )}
                                                <div className='flex-1 min-w-0'>
                                                    <p className='text-sm font-medium text-gray-800 truncate'>
                                                        {crawler.store} • {crawler.category}
                                                    </p>
                                                    <p className='text-xs text-gray-500'>
                                                        {crawler.products.toLocaleString()} products
                                                        {crawler.progress !== undefined && ` • ${Math.round(crawler.progress)}%`}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className='text-right flex-shrink-0'>
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                                crawler.status === 'running' ? 'bg-green-100 text-green-700' :
                                                crawler.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {crawler.status}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Progress bar for running crawlers */}
                                    {crawler.status === 'running' && crawler.progress !== undefined && (
                                        <div className='mt-2 w-full bg-gray-200 rounded-full h-1.5'>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${crawler.progress}%` }}
                                                transition={{ duration: 0.5 }}
                                                className='h-1.5 rounded-full bg-gradient-to-r from-green-400 to-green-500'
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Available Crawlers Section */}
                <div>
                    <div className='flex items-center justify-between mb-3'>
                        <p className='text-xs text-gray-600 font-medium'>Available Crawlers</p>
                        <Link 
                            href="/app/crawler"
                            className='flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors'
                        >
                            Manage
                            <ArrowUp size={10} />
                        </Link>
                    </div>
                    
                    {isLoading && !isStealthRefresh ? (
                        <div className='space-y-2'>
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className='animate-pulse bg-gray-50 rounded-lg p-3'>
                                    <div className='h-3 bg-gray-200 rounded w-3/4 mb-2'></div>
                                    <div className='h-2 bg-gray-200 rounded w-1/2'></div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className='space-y-2 max-h-32 overflow-y-auto pr-1'>
                            {availableCrawlers.slice(0, 6).map((crawler, index) => (
                                <motion.div
                                    key={`${crawler.store}-${crawler.category}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: index * 0.05 }}
                                    className='bg-gray-50 rounded-lg p-2 flex items-center justify-between gap-2'
                                >
                                    <div className='flex-1 min-w-0'>
                                        <p className='text-sm font-medium text-gray-800 truncate'>
                                            {crawler.store}
                                        </p>
                                        <p className='text-xs text-gray-500 truncate'>
                                            {crawler.category} • ~{crawler.estimated_time}
                                        </p>
                                    </div>
                                    <span className='text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full'>
                                        {crawler.max_items}
                                    </span>
                                </motion.div>
                            ))}
                            {availableCrawlers.length > 6 && (
                                <p className='text-xs text-gray-400 text-center py-1'>
                                    +{availableCrawlers.length - 6} more
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Recent Results Section */}
                <div>
                    <div className='flex items-center justify-between mb-3'>
                        <p className='text-xs text-gray-600 font-medium'>Latest Results</p>
                        {lastUpdated && (
                            <p className='text-xs text-gray-400'>Updated: {lastUpdated}</p>
                        )}
                    </div>
                    
                    {isLoading && !isStealthRefresh ? (
                        <div className='space-y-2'>
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className='animate-pulse bg-gray-50 rounded-lg p-3'>
                                    <div className='h-3 bg-gray-200 rounded w-3/4 mb-2'></div>
                                    <div className='h-2 bg-gray-200 rounded w-1/2'></div>
                                </div>
                            ))}
                        </div>
                    ) : recentResults.length > 0 ? (
                        <div className='space-y-2'>
                            {recentResults.slice(0, 3).map((result, index) => (
                                <motion.div
                                    key={`${result.store}-${result.category}-${result.completed_at}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className='bg-gray-50 rounded-lg p-3'
                                >
                                    <div className='flex items-center justify-between'>
                                        <div className='flex items-center space-x-2 flex-1 min-w-0'>
                                            <TickCircle size={14} className='text-green-500 flex-shrink-0' />
                                            <div className='flex-1 min-w-0'>
                                                <p className='text-sm font-medium text-gray-800 truncate'>
                                                    {result.store} - {result.category}
                                                </p>
                                                <p className='text-xs text-gray-500 truncate'>
                                                    {result.count} products • {new Date(result.completed_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleSendToClassifier(result)}
                                            className='flex items-center space-x-1 px-2 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg transition-colors flex-shrink-0'
                                        >
                                            <Send size={10} />
                                            <span>Classify</span>
                                        </motion.button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className='text-center py-4'>
                            <DocumentUpload size={24} className='text-gray-300 mx-auto mb-2' />
                            <p className='text-xs text-gray-500'>No recent results</p>
                        </div>
                    )}
                </div>

                {/* System Summary */}
                <div className='bg-blue-50 rounded-lg p-3'>
                    <div className='flex items-center justify-between mb-2'>
                        <span className='text-sm font-medium text-gray-800'>System Summary</span>
                        <TickCircle size={16} className='text-green-500' />
                    </div>
                    <p className='text-xs text-gray-600'>
                        Products Scraped: {crawlerStatus.productsScraped.toLocaleString()} • 
                        Success Rate: {crawlerStatus.successRate}%
                    </p>
                    <p className='text-xs text-gray-500 mt-1'>
                        Last activity: {crawlerStatus.lastRun || 'Never'}
                    </p>
                    <div className='mt-2 w-full bg-gray-200 rounded-full h-1.5'>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${crawlerStatus.successRate}%` }}
                            transition={{ duration: 1 }}
                            className='h-1.5 rounded-full bg-green-500'
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default CrawlerActivity

"use client"

import React, { useState, useEffect } from 'react'
import { Global, Activity, TickCircle, CloseCircle, Clock, RefreshCircle, Send, DocumentUpload, ArrowUp } from 'iconsax-react'
import { useCentralStore } from '@/Store'
import { crawlerAPI } from '@/lib/api'
import { motion } from 'framer-motion'
import Link from 'next/link'

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

function CrawlerActivity() {
    const { crawlerStatus, setCrawlerStatus, setActivePage } = useCentralStore()
    const [availableCrawlers, setAvailableCrawlers] = useState<CrawlerInfo[]>([])
    const [recentResults, setRecentResults] = useState<CrawlerResult[]>([])
    const [systemStatus, setSystemStatus] = useState<string>('checking')
    const [isLoading, setIsLoading] = useState(false)
    const [lastUpdated, setLastUpdated] = useState<string>('')

    // Fetch all crawler data
    const fetchCrawlerData = async () => {
        setIsLoading(true)
        try {
            // Get system status
            const statusResponse = await crawlerAPI.getStatus()
            setSystemStatus(statusResponse.available ? 'online' : 'offline')
            
            // Get available crawlers
            const availableResponse = await crawlerAPI.getAvailableCrawlers()
            const crawlerList: CrawlerInfo[] = []
            
            Object.entries(availableResponse.crawlers || {}).forEach(([store, categories]: [string, any]) => {
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
            setAvailableCrawlers(crawlerList)

            // Get recent results
            const resultsResponse = await crawlerAPI.getAllResults()
            const results = Object.values(resultsResponse.results || {}) as CrawlerResult[]
            
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

            // Update status with calculated values
            setCrawlerStatus({
                activeCrawlers: statusResponse.active_crawlers || 0,
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
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchCrawlerData()
        // Refresh every 30 seconds
        const interval = setInterval(fetchCrawlerData, 30000)
        return () => clearInterval(interval)
    }, [])

    const handleSendToClassifier = (result: CrawlerResult) => {
        // Navigate to classifier and set the data
        setActivePage('CLASSIFIER')
        // Optional: pre-populate the classifier with crawler results.
        console.log('Sending to classifier:', result)
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
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <Global size={18} />
                    <p className='text-gray-800 font-medium'>Crawler Activity</p>
                </div>
                <div className='flex items-center gap-2'>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(systemStatus)}`}>
                        {getStatusIcon(systemStatus)}
                        <span className='ml-1'>{systemStatus}</span>
                    </span>
                    <button 
                        onClick={fetchCrawlerData}
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
                    
                    {isLoading ? (
                        <div className='space-y-2'>
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className='animate-pulse bg-gray-50 rounded-lg p-3'>
                                    <div className='h-3 bg-gray-200 rounded w-3/4 mb-2'></div>
                                    <div className='h-2 bg-gray-200 rounded w-1/2'></div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className='space-y-2 max-h-32 overflow-y-auto'>
                            {availableCrawlers.slice(0, 6).map((crawler, index) => (
                                <motion.div
                                    key={`${crawler.store}-${crawler.category}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: index * 0.05 }}
                                    className='bg-gray-50 rounded-lg p-2 flex items-center justify-between'
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
                    
                    {isLoading ? (
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

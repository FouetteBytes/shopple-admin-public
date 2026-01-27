/*
"use client"

import React, { useState, useEffect } from 'react'
import { Global, Activity, TickCircle, CloseCircle, Clock, RefreshCircle, Send, DocumentUpload } from 'iconsax-react'
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
            
            // Update crawler status with real data
            setCrawlerStatus({
                activeCrawlers: statusResponse.active_crawlers || 0,
                productsScraped: crawlerStatus.productsScraped, // Will be updated from results
                successRate: crawlerStatus.successRate, // Will be calculated from results
                lastRun: crawlerStatus.lastRun
            })

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
*/
/*
    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
        <div className='p-4 bg-white rounded-lg shadow-sm'>
            {/* header
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <Global size={18} />
                    <p className='text-gray-800 font-medium'>Crawler Activity</p>
                </div>
                <div className='flex items-center gap-2'>
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
                    <div className={`px-2 py-1 rounded-lg text-xs ${
                        crawlerStatus.activeCrawlers > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                    }`}>
                        {crawlerStatus.activeCrawlers} Active
                    </div>
                </div>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* content 
            <div className='space-y-4'>
                {/* Overview stats 
                <div className='grid grid-cols-2 gap-3'>
                    <div className='bg-gray-50 rounded-lg p-3 text-center'>
                        <p className='text-lg font-bold text-gray-800'>{crawlerStatus.productsScraped.toLocaleString()}</p>
                        <p className='text-xs text-gray-600'>Products Scraped</p>
                    </div>
                    <div className='bg-gray-50 rounded-lg p-3 text-center'>
                        <p className='text-lg font-bold text-green-600'>{crawlerStatus.successRate}%</p>
                        <p className='text-xs text-gray-600'>Success Rate</p>
                    </div>
                </div>

                {/* Crawler list 
                <div className='space-y-3'>
                    <div className='flex items-center justify-between'>
                        <p className='text-xs text-gray-600 font-medium'>Recent Crawlers</p>
                        {lastUpdated && (
                            <p className='text-xs text-gray-400'>Updated: {lastUpdated}</p>
                        )}
                    </div>
                    
                    {isLoading ? (
                        <div className='flex items-center justify-center py-4'>
                            <RefreshCircle size={20} className='text-gray-400 animate-spin' />
                            <span className='ml-2 text-sm text-gray-500'>Loading crawler data...</span>
                        </div>
                    ) : crawlerData.length === 0 ? (
                        <div className='text-center py-4'>
                            <Global size={32} className='mx-auto text-gray-300 mb-2' />
                            <p className='text-sm text-gray-500'>No crawlers found</p>
                            <p className='text-xs text-gray-400'>Start crawling to see activity here</p>
                        </div>
                    ) : (
                        crawlerData.slice(0, 4).map((crawler, index) => (
                            <motion.div
                                key={`${crawler.store}_${crawler.category}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: index * 0.1 }}
                                className='flex items-center justify-between p-3 bg-gray-50 rounded-lg'
                            >
                                <div className='flex items-center gap-3'>
                                    {getStatusIcon(crawler.status)}
                                    <div>
                                        <p className='text-sm font-medium text-gray-800'>
                                            {crawler.store} • {crawler.category}
                                        </p>
                                        <p className='text-xs text-gray-500'>{crawler.products.toLocaleString()} products</p>
                                    </div>
                                </div>
                                <div className='text-right'>
                                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(crawler.status)}`}>
                                        {crawler.status}
                                    </span>
                                    <p className='text-xs text-gray-500 mt-1'>
                                        {crawler.lastRun === 'Never' ? 'Never' : 
                                         new Date(crawler.lastRun).toLocaleString()}
                                    </p>
                                </div>
                            </motion.div>
                        ))
                    )}
                    
                    {crawlerData.length > 4 && (
                        <p className='text-xs text-gray-500 text-center'>
                            ...and {crawlerData.length - 4} more crawlers
                        </p>
                    )}
                </div>

                {/* Last crawl info 
                <div className='bg-blue-50 rounded-lg p-3'>
                    <div className='flex items-center justify-between mb-2'>
                        <span className='text-sm font-medium text-gray-800'>System Summary</span>
                        <TickCircle size={16} className='text-green-500' />
                    </div>
                    <p className='text-xs text-gray-600'>
                        Last activity: {crawlerStatus.lastRun || 'Never'} • 
                        Total: {crawlerStatus.productsScraped.toLocaleString()} products scraped
                    </p>
                    <div className='mt-2 w-full bg-gray-200 rounded-full h-1.5'>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${crawlerStatus.successRate}%` }}
                            transition={{ duration: 1 }}
                            className='h-1.5 rounded-full bg-green-500'
                        />
                    </div>
                    <p className='text-xs text-gray-500 mt-1'>
                        {crawlerStatus.successRate}% success rate
                    </p>
                </div>

                {/* Quick actions 
                <div className='flex gap-2'>
                    <button 
                        onClick={() => window.open('/app/crawler', '_blank')}
                        className='flex-1 text-xs py-2 px-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors'
                    >
                        Manage Crawlers
                    </button>
                    <button 
                        onClick={fetchCrawlerData}
                        disabled={isLoading}
                        className='text-xs py-2 px-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50'
                    >
                        {isLoading ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default CrawlerActivity

*/
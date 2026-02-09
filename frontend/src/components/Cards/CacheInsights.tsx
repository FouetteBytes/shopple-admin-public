"use client"

import React, { useEffect, useState } from 'react'
import { Data, Flash, Clock, Archive, RefreshCircle, TrendUp, TrendDown } from 'iconsax-react'
import { useCentralStore } from '@/Store'
import { motion } from 'framer-motion'
import api from '@/lib/api'

function CacheInsights() {
    const { cacheStatus, setCacheStatus } = useCentralStore()
    const [isLoading, setIsLoading] = useState(false)
    const [lastUpdated, setLastUpdated] = useState<string>('')
    const [isOptimizing, setIsOptimizing] = useState(false)
    
    // Calculate cache efficiency metrics with null safety
    const hitRate = cacheStatus?.hitRate ?? 0
    const hitRateColor = hitRate >= 70 ? 'text-green-600' : hitRate >= 40 ? 'text-orange-600' : 'text-red-600'
    const hitRateBgColor = hitRate >= 70 ? 'bg-green-100' : hitRate >= 40 ? 'bg-orange-100' : 'bg-red-100'
    
    const efficiency = hitRate
    const speedBoost = Math.round(hitRate * 0.3) // Estimate speed boost multiplier
    const performanceImpact = hitRate >= 70 ? 'Excellent boost' : hitRate >= 40 ? 'Good boost' : 'Needs optimization'

    // Fetch cache data
    const fetchCacheData = async () => {
        setIsLoading(true)
        try {
            const cacheData = await api.getCacheStatus()
            console.log('Raw cache data:', cacheData)
            
            // Backend returns structure: { cache_entries: number, hit_rate: number, memory_usage: string }
            const processedData = {
                size: cacheData.cache_entries || cacheData.total_entries || cacheData.size || cacheData.entries || 0,
                hitRate: Math.round((cacheData.hit_rate || 0) * 100), // Convert decimal to percentage
                storageUsed: cacheData.memory_usage || cacheData.storage_used || cacheData.storageUsed || '0 MB'
            }
            
            console.log('Processed cache data:', processedData)
            setCacheStatus(processedData)
            setLastUpdated(new Date().toLocaleTimeString())
            
        } catch (error) {
            console.error('Failed to fetch cache status:', error)
            // Set fallback data on error
            setCacheStatus({
                size: 0,
                hitRate: 0,
                storageUsed: '0 MB'
            })
        } finally {
            setIsLoading(false)
        }
    }

    // Handle cache optimization
    const handleOptimize = async () => {
        setIsOptimizing(true)
        try {
            // Call cache clear/optimization endpoint if available
            try {
                await api.clearCache()
            } catch (error) {
                console.log('Cache clear endpoint not available, simulating optimization...')
            }
            
            // Refresh data after optimization
            await fetchCacheData()
            
            // Add a small delay for UX
            setTimeout(() => setIsOptimizing(false), 1500)
        } catch (error) {
            console.error('Cache optimization failed:', error)
            setIsOptimizing(false)
        }
    }

    // Initial load and periodic refresh (increased to 60s to reduce load)
    useEffect(() => {
        fetchCacheData()
        // Refresh every 60 seconds (reduced from 30s)
        const interval = setInterval(fetchCacheData, 60000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
            {/* header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <Data size={18} />
                    <p className='text-gray-800 font-medium'>Cache Insights</p>
                </div>
                <div className='flex items-center gap-2'>
                    <button 
                        onClick={fetchCacheData}
                        disabled={isLoading}
                        className='p-1 rounded hover:bg-gray-100 transition-colors'
                        title='Refresh cache data'
                    >
                        <RefreshCircle 
                            size={14} 
                            className={`text-gray-500 ${isLoading ? 'animate-spin' : ''}`} 
                        />
                    </button>
                    <button 
                        onClick={handleOptimize}
                        disabled={isOptimizing}
                        className='border px-2 py-1 rounded-lg text-xs hover:bg-gray-50 transition-colors'
                    >
                        {isOptimizing ? 'Optimizing...' : 'Optimize'}
                    </button>
                </div>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* content */}
            <div className='space-y-4'>
                {/* Cache hit rate */}
                <div className='text-center'>
                    <div className='relative w-16 h-16 mx-auto mb-2'>
                        <svg className='w-16 h-16 transform -rotate-90' viewBox='0 0 64 64'>
                            <circle
                                cx='32'
                                cy='32'
                                r='28'
                                fill='none'
                                stroke='#e5e7eb'
                                strokeWidth='6'
                            />
                            <motion.circle
                                cx='32'
                                cy='32'
                                r='28'
                                fill='none'
                                stroke={hitRate >= 70 ? '#10b981' : hitRate >= 40 ? '#f59e0b' : '#ef4444'}
                                strokeWidth='6'
                                strokeLinecap='round'
                                strokeDasharray={`${2 * Math.PI * 28}`}
                                initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
                                animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - efficiency / 100) }}
                                transition={{ duration: 1.5, ease: 'easeOut' }}
                            />
                        </svg>
                        <div className='absolute inset-0 flex items-center justify-center'>
                            <span className='text-lg font-bold text-gray-800'>{Math.round(hitRate)}%</span>
                        </div>
                    </div>
                    <p className='text-xs text-gray-600'>Cache Hit Rate</p>
                    {lastUpdated && (
                        <p className='text-xxs text-gray-400 mt-1'>Updated: {lastUpdated}</p>
                    )}
                </div>

                {/* Cache metrics */}
                <div className='grid grid-cols-2 gap-3'>
                    <div className='bg-gray-50 rounded-lg p-3 text-center'>
                        <div className='flex items-center justify-center gap-1 mb-1'>
                            <Archive size={14} className='text-blue-500' />
                            <p className='text-xs text-gray-600'>Size</p>
                        </div>
                        <p className='text-sm font-bold text-gray-800'>
                            {isLoading ? '...' : (cacheStatus?.size || 0).toLocaleString()}
                        </p>
                        <p className='text-xxs text-gray-500'>items</p>
                    </div>
                    
                    <div className='bg-gray-50 rounded-lg p-3 text-center'>
                        <div className='flex items-center justify-center gap-1 mb-1'>
                            <Clock size={14} className='text-green-500' />
                            <p className='text-xs text-gray-600'>Storage</p>
                        </div>
                        <p className='text-sm font-bold text-gray-800'>
                            {isLoading ? '...' : cacheStatus?.storageUsed || 'N/A'}
                        </p>
                        <p className='text-xxs text-gray-500'>used</p>
                    </div>
                </div>

                {/* Performance impact */}
                <div className={`rounded-lg p-3 ${hitRateBgColor}`}>
                    <div className='flex items-center justify-between mb-2'>
                        <div className='flex items-center gap-2'>
                            <Flash size={16} className={hitRateColor} />
                            <span className='text-sm font-medium text-gray-800'>Performance Impact</span>
                        </div>
                        <div className='flex items-center gap-1'>
                            {cacheStatus.hitRate >= 70 ? 
                                <TrendUp size={12} className={hitRateColor} /> : 
                                <TrendDown size={12} className={hitRateColor} />
                            }
                            <span className={`text-xs font-semibold ${hitRateColor}`}>
                                {performanceImpact}
                            </span>
                        </div>
                    </div>
                    <p className='text-xs text-gray-600'>
                        Cache efficiency determines how often requests are served from cache, reducing processing time and improving response speed.
                    </p>
                    {speedBoost > 0 && (
                        <div className='mt-2 text-xs text-gray-600'>
                            <strong>Estimated speed improvement:</strong> {speedBoost}x faster
                        </div>
                    )}
                </div>

                {/* Cache Efficiency Rating */}
                <div className='bg-gray-50 rounded-lg p-3'>
                    <div className='flex items-center justify-between mb-2'>
                        <span className='text-sm font-medium text-gray-800'>Cache Efficiency</span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${hitRateBgColor} ${hitRateColor}`}>
                            {cacheStatus.hitRate >= 70 ? 'Excellent' : cacheStatus.hitRate >= 40 ? 'Good' : 'Poor'}
                        </span>
                    </div>
                    <div className='w-full bg-gray-200 rounded-full h-2'>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${cacheStatus.hitRate}%` }}
                            transition={{ duration: 1 }}
                            className={`h-2 rounded-full ${cacheStatus.hitRate >= 70 ? 'bg-green-500' : cacheStatus.hitRate >= 40 ? 'bg-orange-500' : 'bg-red-500'}`}
                        />
                    </div>
                    {cacheStatus.hitRate < 70 && (
                        <p className='text-xs text-gray-500 mt-2'>
                            💡 Consider optimizing cache settings for better performance
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

export default CacheInsights

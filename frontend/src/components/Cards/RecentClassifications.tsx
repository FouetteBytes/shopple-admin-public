"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { DocumentUpload, ShoppingCart, TickCircle, CloseCircle, Calendar } from 'iconsax-react'
import { useCentralStore } from '@/Store'
import { motion } from 'framer-motion'

function RecentClassifications() {
    const { classificationHistory, setClassificationHistory } = useCentralStore()
    const [isLoading, setIsLoading] = useState(true)
    
    // Load classification history from localStorage on component mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedHistory = localStorage.getItem('classificationHistory')
            if (savedHistory) {
                try {
                    const history = JSON.parse(savedHistory)
                    setClassificationHistory(history)
                } catch (error) {
                    console.error('Failed to load classification history:', error)
                }
            }
        }
        setIsLoading(false)
    }, [setClassificationHistory])
    
    // Get recent 5 classifications
    const recentClassifications = classificationHistory.slice(-5).reverse()

    const getStatusIcon = (session: any) => {
        if (session.failureCount > session.successCount) {
            return <CloseCircle size={16} variant='Bold' className='text-red-500' />
        }
        return <TickCircle size={16} variant='Bold' className='text-green-500' />
    }

    const getModelBadgeColor = (model: string) => {
        if (model?.includes('GROQ') || model?.includes('groq')) return 'bg-blue-100 text-blue-600'
        if (model?.includes('CEREBRAS') || model?.includes('cerebras')) return 'bg-purple-100 text-purple-600'
        if (model?.includes('GEMINI') || model?.includes('gemini')) return 'bg-green-100 text-green-600'
        if (model?.includes('OPENROUTER') || model?.includes('openrouter')) return 'bg-orange-100 text-orange-600'
        if (model === 'CACHE' || model?.includes('cache')) return 'bg-yellow-100 text-yellow-600'
        return 'bg-gray-100 text-gray-600'
    }

    const formatTimeAgo = (timestamp: string) => {
        const now = new Date()
        const sessionTime = new Date(timestamp)
        const diffMs = now.getTime() - sessionTime.getTime()
        const diffMins = Math.floor(diffMs / (1000 * 60))
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        return `${diffDays}d ago`
    }

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
            {/* header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <DocumentUpload size={18} />
                    <p className='text-gray-800 font-medium'>Recent Classifications</p>
                </div>
                <Link
                    href="/app/classifier?tab=history"
                    className='border px-2 py-1 rounded-lg text-xs text-gray-600 transition hover:bg-gray-100 hover:text-gray-900'
                >
                    Open history
                </Link>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* content */}
            <div className='space-y-3'>
                {isLoading ? (
                    <div className='space-y-2'>
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className='animate-pulse bg-gray-50 rounded-lg p-3'>
                                <div className='h-4 bg-gray-200 rounded w-3/4 mb-2'></div>
                                <div className='h-3 bg-gray-200 rounded w-1/2'></div>
                            </div>
                        ))}
                    </div>
                ) : recentClassifications.length === 0 ? (
                    <div className='text-center py-6'>
                        <ShoppingCart size={32} className='mx-auto text-gray-300 mb-2' />
                        <p className='text-sm text-gray-400'>No classifications yet</p>
                        <p className='text-xs text-gray-400'>Start classifying products to see results here</p>
                    </div>
                ) : (
                    recentClassifications.map((session, index) => (
                        <motion.div
                            key={session.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.1 }}
                            className='bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-all cursor-pointer'
                        >
                            <div className='flex items-center justify-between mb-2'>
                                <div className='flex items-center gap-2'>
                                    {getStatusIcon(session)}
                                    <span className='text-sm font-medium text-gray-800'>
                                        {session.productsCount} products classified
                                    </span>
                                </div>
                                <div className='flex items-center gap-2'>
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${getModelBadgeColor(session.modelUsed)}`}>
                                        {session.modelUsed || 'Mixed'}
                                    </span>
                                    <span className='text-xs text-gray-400 flex items-center gap-1'>
                                        <Calendar size={10} />
                                        {formatTimeAgo(session.timestamp)}
                                    </span>
                                </div>
                            </div>
                            <div className='flex items-center justify-between text-xs text-gray-500'>
                                <div className='flex items-center gap-3'>
                                    <span className='text-green-600'>✓ {session.successCount} success</span>
                                    {session.failureCount > 0 && (
                                        <span className='text-red-600'>✗ {session.failureCount} failed</span>
                                    )}
                                    <span>⏱ {session.duration}</span>
                                </div>
                                <span className={`px-1 py-0.5 rounded text-xs ${
                                    session.source === 'crawler' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    {session.source}
                                </span>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    )
}

export default RecentClassifications

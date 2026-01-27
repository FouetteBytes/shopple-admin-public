"use client"

import React from 'react'
import { Activity, Timer, PlayCircle, PauseCircle } from 'iconsax-react'
import { useCentralStore } from '@/Store'

function ProcessingQueue() {
    const { 
        inputData, 
        outputData, 
        isProcessing, 
        progress, 
        currentProduct,
        currentStep,
        processingStats
    } = useCentralStore()

    const queueLength = inputData.length
    const processedCount = outputData.length
    const remainingCount = queueLength - processedCount

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
            {/* header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <Activity size={18} />
                    <p className='text-gray-800 font-medium'>Processing Queue</p>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                    isProcessing ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                    {isProcessing ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                    {isProcessing ? 'Processing' : 'Idle'}
                </div>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* content */}
            <div className='space-y-4'>
                {/* Queue status */}
                {isProcessing ? (
                    <div className='space-y-3'>
                        <div className='flex justify-between items-center'>
                            <span className='text-sm text-gray-700'>Current Product</span>
                            <span className='text-xs text-gray-500'>{Math.round(progress)}%</span>
                        </div>
                        <div className='bg-gray-200 rounded-full h-2'>
                            <div 
                                className='bg-blue-500 h-2 rounded-full transition-all duration-300'
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className='bg-blue-50 rounded-lg p-3'>
                            <p className='text-sm font-medium text-gray-800 truncate'>
                                {currentProduct || 'Preparing...'}
                            </p>
                            <p className='text-xs text-blue-600'>{currentStep || 'Initializing classification...'}</p>
                        </div>
                    </div>
                ) : (
                    <div className='text-center py-4'>
                        <PauseCircle size={32} className='mx-auto text-gray-300 mb-2' />
                        <p className='text-sm text-gray-600'>No active processing</p>
                        <p className='text-xs text-gray-500'>Queue is empty</p>
                    </div>
                )}

                {/* Queue metrics */}
                <div className='grid grid-cols-3 gap-3'>
                    <div className='text-center'>
                        <p className='text-lg font-bold text-gray-800'>{queueLength}</p>
                        <p className='text-xs text-gray-600'>Total</p>
                    </div>
                    <div className='text-center'>
                        <p className='text-lg font-bold text-green-600'>{processedCount}</p>
                        <p className='text-xs text-gray-600'>Processed</p>
                    </div>
                    <div className='text-center'>
                        <p className='text-lg font-bold text-orange-600'>{remainingCount}</p>
                        <p className='text-xs text-gray-600'>Remaining</p>
                    </div>
                </div>

                {/* Performance stats */}
                {processingStats.successful + processingStats.failed > 0 && (
                    <div className='bg-gray-50 rounded-lg p-3'>
                        <div className='flex items-center justify-between mb-2'>
                            <span className='text-sm font-medium text-gray-800'>Session Stats</span>
                            <Timer size={14} className='text-gray-400' />
                        </div>
                        <div className='space-y-1'>
                            <div className='flex justify-between text-xs'>
                                <span className='text-gray-600'>Average Time</span>
                                <span className='font-medium text-gray-800'>{processingStats.avgTime}</span>
                            </div>
                            <div className='flex justify-between text-xs'>
                                <span className='text-gray-600'>Success Rate</span>
                                <span className='font-medium text-green-600'>
                                    {Math.round((processingStats.successful / (processingStats.successful + processingStats.failed)) * 100)}%
                                </span>
                            </div>
                            <div className='flex justify-between text-xs'>
                                <span className='text-gray-600'>Total Time</span>
                                <span className='font-medium text-gray-800'>{processingStats.totalTime}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Next in queue preview */}
                {!isProcessing && queueLength > 0 && (
                    <div className='border border-dashed border-gray-300 rounded-lg p-3'>
                        <p className='text-xs text-gray-600 mb-2'>Next in Queue</p>
                        <div className='space-y-1'>
                            {inputData.slice(0, 3).map((product, index) => (
                                <div key={index} className='flex items-center justify-between'>
                                    <span className='text-sm text-gray-700 truncate'>
                                        {product.name || 'Unnamed Product'}
                                    </span>
                                    <span className='text-xs text-gray-500'>#{index + 1}</span>
                                </div>
                            ))}
                            {queueLength > 3 && (
                                <p className='text-xs text-gray-500'>...and {queueLength - 3} more</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ProcessingQueue

"use client"

import React from 'react'
import { Cpu, Activity, Flash, Timer } from 'iconsax-react'
import { useCentralStore } from '@/Store'
import { motion } from 'framer-motion'

function AIModelPerformance() {
    const { modelStats, processingStats, isProcessing } = useCentralStore()
    
    const totalModelUses = modelStats.groq + modelStats.cerebras + modelStats.gemini + modelStats.openrouter
    
    const modelData = [
        { name: 'Groq', uses: modelStats.groq, color: 'bg-blue-500', percentage: totalModelUses > 0 ? (modelStats.groq / totalModelUses) * 100 : 0 },
        { name: 'Cerebras', uses: modelStats.cerebras, color: 'bg-purple-500', percentage: totalModelUses > 0 ? (modelStats.cerebras / totalModelUses) * 100 : 0 },
        { name: 'Gemini', uses: modelStats.gemini, color: 'bg-green-500', percentage: totalModelUses > 0 ? (modelStats.gemini / totalModelUses) * 100 : 0 },
        { name: 'OpenRouter', uses: modelStats.openrouter, color: 'bg-orange-500', percentage: totalModelUses > 0 ? (modelStats.openrouter / totalModelUses) * 100 : 0 },
    ]

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
            {/* header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <Cpu size={18} />
                    <p className='text-gray-800 font-medium'>AI Model Performance</p>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                    isProcessing ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                }`}>
                    <Activity size={12} />
                    {isProcessing ? 'Active' : 'Idle'}
                </div>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* content */}
            <div className='space-y-4'>
                {/* Model usage breakdown */}
                <div className='space-y-3'>
                    {modelData.map((model, index) => (
                        <div key={model.name} className='space-y-1'>
                            <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-2'>
                                    <div className={`w-2 h-2 rounded-full ${model.color}`} />
                                    <span className='text-sm text-gray-800 font-medium'>{model.name}</span>
                                </div>
                                <div className='flex items-center gap-2'>
                                    <span className='text-xs text-gray-600'>{model.uses} uses</span>
                                    <span className='text-xs text-gray-500'>{model.percentage.toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className='w-full bg-gray-200 rounded-full h-1.5'>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${model.percentage}%` }}
                                    transition={{ duration: 0.8, delay: index * 0.1 }}
                                    className={`h-1.5 rounded-full ${model.color}`}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <hr className='bg-gray-400' />

                {/* Performance metrics */}
                <div className='grid grid-cols-2 gap-4'>
                    <div className='text-center'>
                        <div className='flex items-center justify-center gap-1 mb-1'>
                            <Flash size={14} className='text-yellow-500' />
                            <p className='text-xs text-gray-600'>Avg Speed</p>
                        </div>
                        <p className='text-lg font-bold text-gray-800'>{processingStats.avgTime}</p>
                    </div>
                    
                    <div className='text-center'>
                        <div className='flex items-center justify-center gap-1 mb-1'>
                            <Timer size={14} className='text-blue-500' />
                            <p className='text-xs text-gray-600'>Model Switches</p>
                        </div>
                        <p className='text-lg font-bold text-gray-800'>{modelStats.switches}</p>
                    </div>
                </div>

                {/* Success rate indicator */}
                <div className='bg-gray-50 rounded-lg p-3'>
                    <div className='flex items-center justify-between mb-2'>
                        <span className='text-xs text-gray-600'>Success Rate</span>
                        <span className='text-xs font-semibold text-gray-800'>
                            {processingStats.successful + processingStats.failed > 0 
                                ? Math.round((processingStats.successful / (processingStats.successful + processingStats.failed)) * 100)
                                : 100}%
                        </span>
                    </div>
                    <div className='w-full bg-gray-200 rounded-full h-2'>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ 
                                width: `${processingStats.successful + processingStats.failed > 0 
                                    ? (processingStats.successful / (processingStats.successful + processingStats.failed)) * 100
                                    : 100}%` 
                            }}
                            transition={{ duration: 1 }}
                            className='h-2 rounded-full bg-green-500'
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default AIModelPerformance

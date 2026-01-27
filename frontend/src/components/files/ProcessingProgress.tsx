"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Activity, Cpu, Timer } from 'iconsax-react'

interface ProcessingProgressProps {
  progress: number
  currentProduct: string
  currentModel: string
  processingLogs: string[]
  modelStats: {
    groq: number
    gemini: number
    openrouter: number
    e2b: number
    fallback_1b: number
    switches: number
  }
  processingStats: {
    totalTime: string
    avgTime: string
    successful: number
    failed: number
  }
  isProcessing: boolean
}

const ProcessingProgress: React.FC<ProcessingProgressProps> = ({
  progress,
  currentProduct,
  currentModel,
  processingLogs,
  modelStats,
  processingStats,
  isProcessing
}) => {
  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Processing Status</h3>
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <div className="flex items-center gap-2 text-green-600">
                <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Processing</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span className="text-sm font-medium">Idle</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Overall Progress</span>
            <span className="font-medium text-gray-800">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div
              className="bg-primary h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Current Processing */}
        {currentProduct && (
          <div className="mt-4 p-3 bg-violet-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} className="text-primary" />
              <span className="text-sm font-medium text-gray-800">Currently Processing</span>
            </div>
            <p className="text-sm text-gray-700 truncate">{currentProduct}</p>
            {currentModel && (
              <div className="flex items-center gap-2 mt-1">
                <Cpu size={14} className="text-gray-500" />
                <span className="text-xs text-gray-600">Model: {currentModel}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Usage Stats */}
        <div className="bg-white rounded-lg border p-4">
          <h4 className="font-medium text-gray-800 mb-3">Model Usage</h4>
          <div className="space-y-2">
            {Object.entries(modelStats).map(([model, count]) => (
              <div key={model} className="flex justify-between items-center">
                <span className="text-sm text-gray-600 capitalize">{model.replace('_', ' ')}</span>
                <span className="text-sm font-medium text-gray-800">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Processing Stats */}
        <div className="bg-white rounded-lg border p-4">
          <h4 className="font-medium text-gray-800 mb-3">Performance</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Time</span>
              <span className="text-sm font-medium text-gray-800">{processingStats.totalTime}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Avg Time/Product</span>
              <span className="text-sm font-medium text-gray-800">{processingStats.avgTime}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Successful</span>
              <span className="text-sm font-medium text-green-600">{processingStats.successful}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Failed</span>
              <span className="text-sm font-medium text-red-600">{processingStats.failed}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Processing Logs */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer size={20} className="text-gray-600" />
            <h4 className="font-medium text-gray-800">Processing Logs</h4>
          </div>
          <span className="text-xs text-gray-500">{processingLogs.length} entries</span>
        </div>
        
        <div className="p-4 max-h-64 overflow-y-auto">
          {processingLogs.length === 0 ? (
            <div className="text-center py-4">
              <Timer size={32} className="mx-auto text-gray-400 mb-2" />
              <p className="text-gray-600 text-sm">No processing logs yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {processingLogs.slice(-50).map((log, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.01 }}
                  className="text-xs text-gray-700 font-mono py-1 px-2 bg-gray-50 rounded"
                >
                  {log}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProcessingProgress

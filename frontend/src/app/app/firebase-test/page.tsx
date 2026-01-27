"use client"

import React, { useState, useEffect } from 'react'
import { realFirebaseService } from '@/services/realFirebaseService'

export default function FirebaseTestPage() {
    const [connectionStatus, setConnectionStatus] = useState<any>(null)
    const [realStats, setRealStats] = useState<any>(null)
    const [projectInfo, setProjectInfo] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const testFirebase = async () => {
            setLoading(true)
            
            try {
                // Get project info
                const info = realFirebaseService.getProjectInfo()
                setProjectInfo(info)
                
                // Test connection
                const connection = await realFirebaseService.testConnection()
                setConnectionStatus(connection)
                
                // Get real stats
                const stats = await realFirebaseService.getRealOperationsStats()
                setRealStats(stats)
                
            } catch (error) {
                console.error('Firebase test failed:', error)
            } finally {
                setLoading(false)
            }
        }

        testFirebase()
    }, [])

    if (loading) {
        return (
            <div className="p-8">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Testing Firebase connection...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-8 space-y-6">
            <div className="bg-white rounded-lg border p-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Firebase Connection Test</h1>
                
                {/* Project Info */}
                <div className="mb-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Project Configuration</h2>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600">Project ID</label>
                                <p className="text-sm text-gray-800">{projectInfo?.projectId || 'Not configured'}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600">Auth Domain</label>
                                <p className="text-sm text-gray-800">{projectInfo?.authDomain || 'Not configured'}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600">Storage Bucket</label>
                                <p className="text-sm text-gray-800">{projectInfo?.storageBucket || 'Not configured'}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600">SDK Initialized</label>
                                <p className="text-sm text-gray-800">{projectInfo?.isInitialized ? 'Yes' : 'No'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Connection Status */}
                <div className="mb-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Connection Status</h2>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-3 h-3 rounded-full ${
                                connectionStatus?.connected ? 'bg-green-500' : 'bg-red-500'
                            }`}></div>
                            <span className="text-sm font-medium">
                                {connectionStatus?.connected ? 'Connected' : 'Connection Failed'}
                            </span>
                        </div>
                        {connectionStatus?.error && (
                            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                                <strong>Error:</strong> {connectionStatus.error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Real Firebase Data */}
                <div className="mb-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">
                        Real Firebase Operations Data
                        {realStats?.isConnected && (
                            <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                LIVE DATA
                            </span>
                        )}
                    </h2>
                    <div className="bg-gray-50 rounded-lg p-4">
                        {realStats ? (
                            <div className="space-y-4">
                                {/* Operations Summary */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-blue-600">{realStats.reads.toLocaleString()}</p>
                                        <p className="text-xs text-gray-600">Reads</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-green-600">{realStats.writes.toLocaleString()}</p>
                                        <p className="text-xs text-gray-600">Writes</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-orange-600">{realStats.updates.toLocaleString()}</p>
                                        <p className="text-xs text-gray-600">Updates</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-purple-600">{realStats.totalOperations.toLocaleString()}</p>
                                        <p className="text-xs text-gray-600">Total Operations</p>
                                    </div>
                                </div>

                                {/* Collections Breakdown */}
                                {realStats.collections && Object.keys(realStats.collections).length > 0 && (
                                    <div>
                                        <h3 className="text-md font-medium text-gray-800 mb-2">Collections Data</h3>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            {Object.entries(realStats.collections).map(([collection, count]: [string, any]) => (
                                                <div key={collection} className="bg-white p-3 rounded border">
                                                    <p className="text-sm font-medium text-gray-800">{collection}</p>
                                                    <p className="text-lg font-bold text-gray-600">{count.toLocaleString()} docs</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Additional Info */}
                                <div className="border-t pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <label className="font-medium text-gray-600">Total Documents</label>
                                            <p className="text-gray-800">{realStats.totalDocuments?.toLocaleString() || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <label className="font-medium text-gray-600">Last Operation</label>
                                            <p className="text-gray-800">{realStats.lastOperation || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <label className="font-medium text-gray-600">Connection Status</label>
                                            <p className="text-gray-800">{realStats.isConnected ? 'Connected' : 'Disconnected'}</p>
                                        </div>
                                        {realStats.error && (
                                            <div>
                                                <label className="font-medium text-gray-600">Error</label>
                                                <p className="text-red-600">{realStats.error}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-600">No data available</p>
                        )}
                    </div>
                </div>

                {/* Raw Data Debug */}
                <div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">Raw Debug Data</h2>
                    <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto">
                        <pre>{JSON.stringify({
                            projectInfo,
                            connectionStatus,
                            realStats
                        }, null, 2)}</pre>
                    </div>
                </div>
            </div>
        </div>
    )
}

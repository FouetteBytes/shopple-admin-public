'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Database,
    HardDrive,
    RefreshCw,
    Trash2,
    Search,
    FileText,
    AlertCircle,
    CheckCircle,
    Loader2,
    TrendingUp,
    Package
} from 'lucide-react';
import { systemAPI } from '@/lib/api';

interface StorageStats {
    index: string;
    docs_count: number;
    store_size: string;
    store_size_bytes: number;
    heap_percent: number;
    policy_name: string;
    oldest_doc_age: string;
}

interface ProductIndexStats {
    index: string;
    docs_count: number;
    store_size: string;
    available: boolean;
}

export default function OpenSearchStorage() {
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [productStats, setProductStats] = useState<ProductIndexStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const [isReindexing, setIsReindexing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const fetchStats = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [auditRes, productRes] = await Promise.all([
                systemAPI.getOpenSearchStorage().catch((e) => { console.error('Audit fetch error:', e); return null; }),
                systemAPI.getProductIndexStats().catch((e) => { console.error('Product stats fetch error:', e); return null; })
            ]);
            
            console.log('Audit response:', auditRes);
            console.log('Product response:', productRes);
            
            // The API returns data directly, not wrapped in a data property
            if (auditRes?.success) {
                setStorageStats({
                    index: 'shopple-logs',
                    docs_count: auditRes.doc_count || 0,
                    store_size: `${auditRes.store_size_mb || 0} MB`,
                    store_size_bytes: auditRes.store_size_bytes || 0,
                    heap_percent: auditRes.heap_percent || 0,
                    policy_name: 'audit-logs',
                    oldest_doc_age: auditRes.needs_cleanup ? 'Cleanup needed' : 'Healthy'
                });
            }
            if (productRes?.success) {
                setProductStats({
                    index: 'shopple-products',
                    docs_count: productRes.doc_count || 0,
                    store_size: `${productRes.store_size_mb || 0} MB`,
                    available: productRes.available !== false
                });
            }
            
            if (!auditRes?.success && !productRes?.success) {
                setError('Unable to fetch OpenSearch statistics');
            }
        } catch (err) {
            console.error('Fetch stats error:', err);
            setError('Failed to connect to OpenSearch');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const showNotification = (type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    };

    const handleOptimize = async () => {
        setIsOptimizing(true);
        try {
            const result = await systemAPI.optimizeOpenSearchStorage();
            if (result.success) {
                showNotification('success', 'Storage optimized successfully');
                fetchStats();
            } else {
                showNotification('error', result.message || 'Optimization failed');
            }
        } catch {
            showNotification('error', 'Failed to optimize storage');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleCleanup = async () => {
        if (!confirm('This will delete the oldest 30% of audit logs. Continue?')) return;
        
        setIsCleaning(true);
        try {
            const result = await systemAPI.cleanupOpenSearchStorage(30);
            if (result.success) {
                showNotification('success', `Cleaned up ${result.deleted_count || 0} old records`);
                fetchStats();
            } else {
                showNotification('error', result.message || 'Cleanup failed');
            }
        } catch {
            showNotification('error', 'Failed to cleanup storage');
        } finally {
            setIsCleaning(false);
        }
    };

    const handleReindex = async () => {
        if (!confirm('This will reindex all products to OpenSearch. This may take a few minutes. Continue?')) return;
        
        setIsReindexing(true);
        try {
            const result = await systemAPI.reindexProducts();
            if (result.success) {
                showNotification('success', `Reindexed ${result.indexed_count || 0} products`);
                fetchStats();
            } else {
                showNotification('error', result.message || 'Reindex failed');
            }
        } catch {
            showNotification('error', 'Failed to reindex products');
        } finally {
            setIsReindexing(false);
        }
    };

    const getHeapColor = (percent: number) => {
        if (percent < 50) return 'bg-green-500';
        if (percent < 75) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
            {/* Header */}
            <div className="p-6 border-b border-gray-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-lg">
                            <Database size={20} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">OpenSearch Storage</h2>
                            <p className="text-sm text-gray-500">Audit logs & product search index</p>
                        </div>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={fetchStats}
                        disabled={isLoading}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={18} className={`text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
                    </motion.button>
                </div>
            </div>

            {/* Notification */}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`mx-6 mt-4 p-3 rounded-lg flex items-center gap-2 ${
                            notification.type === 'success'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                    >
                        {notification.type === 'success' ? (
                            <CheckCircle size={16} />
                        ) : (
                            <AlertCircle size={16} />
                        )}
                        <span className="text-sm font-medium">{notification.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content */}
            <div className="p-6 space-y-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={24} className="animate-spin text-primary" />
                    </div>
                ) : error ? (
                    <div className="text-center py-8">
                        <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
                        <p className="text-gray-500">{error}</p>
                        <button
                            onClick={fetchStats}
                            className="mt-4 text-sm text-primary hover:underline"
                        >
                            Try again
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Audit Logs Section */}
                        {storageStats && (
                            <div className="space-y-4">
                                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                                    <FileText size={16} className="text-blue-500" />
                                    Audit Logs Index
                                </h3>
                                
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {/* Heap Usage */}
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrendingUp size={14} className="text-gray-400" />
                                            <span className="text-xs text-gray-500">Heap Usage</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-800">
                                            {storageStats.heap_percent}%
                                        </div>
                                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${storageStats.heap_percent}%` }}
                                                transition={{ duration: 0.5 }}
                                                className={`h-full rounded-full ${getHeapColor(storageStats.heap_percent)}`}
                                            />
                                        </div>
                                    </div>

                                    {/* Documents */}
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FileText size={14} className="text-gray-400" />
                                            <span className="text-xs text-gray-500">Documents</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-800">
                                            {storageStats.docs_count.toLocaleString()}
                                        </div>
                                    </div>

                                    {/* Store Size */}
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <HardDrive size={14} className="text-gray-400" />
                                            <span className="text-xs text-gray-500">Store Size</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-800">
                                            {storageStats.store_size}
                                        </div>
                                    </div>

                                    {/* Oldest Doc */}
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FileText size={14} className="text-gray-400" />
                                            <span className="text-xs text-gray-500">Oldest Doc</span>
                                        </div>
                                        <div className="text-sm font-medium text-gray-800 truncate">
                                            {storageStats.oldest_doc_age || 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleOptimize}
                                        disabled={isOptimizing}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                                    >
                                        {isOptimizing ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <RefreshCw size={16} />
                                        )}
                                        Optimize Storage
                                    </motion.button>
                                    
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleCleanup}
                                        disabled={isCleaning}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                                    >
                                        {isCleaning ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <Trash2 size={16} />
                                        )}
                                        Cleanup Old Logs
                                    </motion.button>
                                </div>
                            </div>
                        )}

                        {/* Divider */}
                        {storageStats && productStats && (
                            <div className="border-t border-gray-100" />
                        )}

                        {/* Product Index Section */}
                        {productStats && (
                            <div className="space-y-4">
                                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                                    <Package size={16} className="text-green-500" />
                                    Product Search Index
                                </h3>
                                
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {/* Status */}
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Search size={14} className="text-gray-400" />
                                            <span className="text-xs text-gray-500">Status</span>
                                        </div>
                                        <div className={`text-lg font-bold ${productStats.available ? 'text-green-600' : 'text-red-600'}`}>
                                            {productStats.available ? 'Active' : 'Unavailable'}
                                        </div>
                                    </div>

                                    {/* Products Indexed */}
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Package size={14} className="text-gray-400" />
                                            <span className="text-xs text-gray-500">Products Indexed</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-800">
                                            {productStats.docs_count.toLocaleString()}
                                        </div>
                                    </div>

                                    {/* Index Size */}
                                    <div className="bg-gray-50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <HardDrive size={14} className="text-gray-400" />
                                            <span className="text-xs text-gray-500">Index Size</span>
                                        </div>
                                        <div className="text-2xl font-bold text-gray-800">
                                            {productStats.store_size || '0 B'}
                                        </div>
                                    </div>
                                </div>

                                {/* Reindex Button */}
                                <div className="pt-2">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleReindex}
                                        disabled={isReindexing}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
                                    >
                                        {isReindexing ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <RefreshCw size={16} />
                                        )}
                                        Reindex All Products
                                    </motion.button>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Rebuilds the product search index from Firestore. Use this after bulk imports.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {!storageStats && !productStats && (
                            <div className="text-center py-8">
                                <Database size={32} className="mx-auto mb-3 text-gray-300" />
                                <p className="text-gray-500">No OpenSearch data available</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </motion.div>
    );
}

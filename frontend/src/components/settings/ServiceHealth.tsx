"use client"

import React, { useEffect, useState } from 'react'
import { Refresh, Play, Stop, Monitor, Cpu, Flash } from 'iconsax-react'
import { systemAPI } from '@/lib/api'
import { useGlobalToast } from '@/contexts/ToastContext'
import { Loader2, Server, Activity, Clock, Power } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ServiceStatus {
    id: string
    name: string
    container_name: string
    status: 'online' | 'offline'
    uptime: string | null
}

export function ServiceHealth({ searchQuery }: { searchQuery?: string }) {
    const [services, setServices] = useState<ServiceStatus[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [restartingId, setRestartingId] = useState<string | null>(null)
    const [dockerError, setDockerError] = useState<string | null>(null)
    const { success, error } = useGlobalToast()

    const filteredServices = services.filter(s => 
        !searchQuery || 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        s.container_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.status.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const fetchServices = async () => {
        try {
            setIsLoading(true)
            setDockerError(null)
            const data = await systemAPI.getServicesStatus()
            if (data.error) {
                setDockerError(data.error)
                setServices([])
            } else if (data.services) {
                setServices(data.services)
            }
        } catch (err: any) {
            console.error('Failed to fetch services:', err)
            setDockerError(err?.message || 'Failed to load service status')
            error('Error', 'Failed to load service status')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchServices()
        const interval = setInterval(fetchServices, 30000) // Refresh every 30s
        return () => clearInterval(interval)
    }, [])

    const handleRestart = async (serviceId: string) => {
        if (restartingId) return
        
        if (!confirm(`Are you sure you want to restart the ${serviceId} service? This may interrupt ongoing tasks.`)) {
            return
        }

        setRestartingId(serviceId)
        try {
            await systemAPI.restartService(serviceId)
            success('Restarting', `Service ${serviceId} restarting...`)
            // Wait a bit before refreshing to allow container to stop/start
            setTimeout(fetchServices, 5000)
        } catch (err) {
            console.error('Failed to restart service:', err)
            error('Error', `Failed to restart ${serviceId}`)
        } finally {
            setRestartingId(null)
        }
    }

    const getStatusColor = (status: string) => {
        return status === 'online' 
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
            : 'text-rose-700 bg-rose-50 border-rose-200'
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-gray-900">Service Status</h3>
                    <p className="text-sm text-gray-500">Monitor and manage system services and containers.</p>
                </div>
                <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={fetchServices}
                    disabled={isLoading}
                    className="p-2 text-gray-500 hover:bg-white hover:shadow-sm hover:text-primary rounded-xl transition-all border border-transparent hover:border-gray-200"
                    title="Refresh status"
                >
                    <Refresh size={20} className={isLoading ? 'animate-spin' : ''} />
                </motion.button>
            </div>

            <div className="grid gap-4">
                {isLoading && (
                    <div className="text-center py-12">
                        <Loader2 size={32} className="mx-auto mb-3 text-primary animate-spin" />
                        <p className="text-sm text-gray-500">Loading services...</p>
                    </div>
                )}
                
                <AnimatePresence mode='wait'>
                    {!isLoading && filteredServices.map((service, index) => (
                        <motion.div 
                            key={service.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="group relative overflow-hidden bg-white/60 backdrop-blur-sm border border-white/60 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md hover:bg-white/80 transition-all"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl border shadow-sm ${service.status === 'online' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                                    <Server size={24} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-gray-900">{service.name}</h4>
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(service.status)}`}>
                                            {service.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Monitor size={12} />
                                            {service.container_name}
                                        </span>
                                        {service.uptime && (
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} />
                                                Uptime: {service.uptime}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleRestart(service.id)}
                                    disabled={!!restartingId}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-primary disabled:opacity-50 transition-colors"
                                >
                                    {restartingId === service.id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Refresh size={14} />
                                    )}
                                    Restart
                                </motion.button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
                
                {filteredServices.length === 0 && !isLoading && (
                    <div className="text-center py-12 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                        <Server size={32} className="mx-auto mb-3 text-gray-300" />
                        {dockerError ? (
                            <div>
                                <p className="text-gray-900 font-medium mb-2">Docker Connection Issue</p>
                                <p className="text-sm text-gray-500 mb-4">{dockerError}</p>
                                <div className="text-xs text-gray-400 bg-gray-100/50 rounded-lg p-3 max-w-md mx-auto">
                                    <p className="font-medium mb-1">To fix:</p>
                                    <p>Stop the containers and rebuild with: <code className="bg-white px-1.5 py-0.5 rounded">docker-compose up --build</code></p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-500">{searchQuery ? 'No matching services found' : 'No services found'}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

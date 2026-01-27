import { Monitor, Cpu, Ram, Setting2, Refresh, Warning2 } from 'iconsax-react'
import { useEffect, useState } from 'react'
import { API_BASE_URL } from '@/lib/api'

// Simple utility for class names
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ')

interface ResourceStats {
    cpu_percent: number
    memory_usage_mb: number
    memory_limit_mb: number
    memory_percent: number
    name: string
    status: string
}

interface SystemResources {
    system: {
        cpu: {
            usage_percent: number
            count: number
        }
        memory: {
            total: number
            available: number
            used: number
            percent: number
        }
    }
    containers: ResourceStats[]
    crawler_config: {
        max_concurrent_crawlers: number
    }
}

export default function ResourceMonitor() {
    const [stats, setStats] = useState<SystemResources | null>(null)
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [showConfig, setShowConfig] = useState(false)
    const [concurrency, setConcurrency] = useState<number>(2)

    const fetchStats = async () => {
        try {
            // Using existing API_BASE_URL or fallback to empty (same-origin)
            let baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : (process.env.NEXT_PUBLIC_BACKEND_URL || '')
            if (baseUrl && !baseUrl.endsWith('/api') && !baseUrl.includes('/api/')) {
                baseUrl = `${baseUrl}/api`
            } else if (!baseUrl) {
                baseUrl = '/api'  // Same-origin for K8s/Ingress
            }
            
            const res = await fetch(`${baseUrl}/system/resources`, {
                credentials: 'include',
            })
            if (res.ok) {
                const data = await res.json()
                if (data.success) {
                    setStats(data)
                    // Only update local concurrency state from server if we're not currently editing it
                    if (!showConfig) {
                        setConcurrency(data.crawler_config?.max_concurrent_crawlers || 2)
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch resource stats", e)
        } finally {
            setLoading(false)
        }
    }

    const updateConfig = async () => {
        setUpdating(true)
        try {
            let baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : (process.env.NEXT_PUBLIC_BACKEND_URL || '')
            if (baseUrl && !baseUrl.endsWith('/api') && !baseUrl.includes('/api/')) {
                baseUrl = `${baseUrl}/api`
            } else if (!baseUrl) {
                baseUrl = '/api'  // Same-origin for K8s/Ingress
            }
            const res = await fetch(`${baseUrl}/system/crawler-config`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ max_concurrent_crawlers: concurrency })
            })
            if (res.ok) {
                const data = await res.json()
                if (data.success) {
                    setShowConfig(false)
                    fetchStats() // Refresh immediately
                }
            }
        } catch (e) {
            console.error("Failed to update config", e)
        } finally {
            setUpdating(false)
        }
    }

    useEffect(() => {
        fetchStats()
        const interval = setInterval(fetchStats, 30000) // Poll every 30s (reduced from 5s to avoid overloading local cluster)
        return () => clearInterval(interval)
    }, [])

    if (loading && !stats) return (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
    )

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col h-full shadow-sm hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-row items-center justify-between pb-4 space-y-0">
                <div className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Monitor size={20} className="text-primary" />
                    Resource Monitor
                </div>
                <div className="flex gap-1">
                    <button 
                        onClick={() => setShowConfig(!showConfig)}
                        className={cn("p-1.5 rounded-md hover:bg-slate-100 transition-colors text-slate-500", showConfig && "bg-slate-100 text-primary")}
                        title="Configure Limits"
                    >
                        <Setting2 size={18} />
                    </button>
                    <button 
                        onClick={() => fetchStats()}
                        className="p-1.5 rounded-md hover:bg-slate-100 transition-colors text-slate-500"
                        title="Refresh Now"
                    >
                        <Refresh size={18} />
                    </button>
                </div>
            </div>
            
            <div className="flex-1 space-y-4">
                {/* Host Stats */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
                            <Cpu size={14} />
                            <span>Host CPU</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-slate-800">{stats?.system.cpu.usage_percent ?? 0}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                            <div 
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-500",
                                    (stats?.system.cpu.usage_percent ?? 0) > 80 ? "bg-rose-500" : 
                                    (stats?.system.cpu.usage_percent ?? 0) > 50 ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${stats?.system.cpu.usage_percent ?? 0}%` }}
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
                            <Ram size={14} />
                            <span>Host RAM</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold text-slate-800">{stats?.system.memory.percent ?? 0}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                            <div 
                                className={cn(
                                    "h-1.5 rounded-full transition-all duration-500",
                                    (stats?.system.memory.percent ?? 0) > 80 ? "bg-rose-500" : 
                                    (stats?.system.memory.percent ?? 0) > 60 ? "bg-amber-500" : "bg-blue-500"
                                )}
                                style={{ width: `${stats?.system.memory.percent ?? 0}%` }}
                            />
                        </div>
                    </div>
                </div>
                
                {/* Config Panel */}
                {showConfig && (
                    <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl animate-in fade-in slide-in-from-top-1">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-blue-900">Max Concurrent Crawlers</span>
                            <span className="text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                                Active: {stats?.crawler_config.max_concurrent_crawlers}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <input 
                                type="range" 
                                min="1" 
                                max="8" 
                                value={concurrency} 
                                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                                className="flex-1 accent-primary h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer" 
                            />
                            <span className="w-6 text-center text-sm font-bold text-blue-800">{concurrency}</span>
                        </div>
                        <button 
                            onClick={updateConfig}
                            disabled={updating}
                            className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                            {updating && <Refresh size={12} className="animate-spin" />}
                            Apply Limit
                        </button>
                    </div>
                )}

                {/* Container List */}
                <div className="space-y-0.5">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 pl-1">Services</h3>
                    {stats?.containers.map(c => (
                        <div key={c.name} className="flex items-center justify-between py-2 px-1 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 rounded-lg transition-colors">
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-slate-700 truncate max-w-[120px]" title={c.name}>
                                    {c.name.replace('shopple-', '')}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className={cn("w-1.5 h-1.5 rounded-full", c.status === 'running' ? "bg-emerald-500" : "bg-rose-500")} />
                                    <span className="text-[10px] text-slate-400 capitalize">{c.status}</span>
                                </div>
                            </div>
                            <div className="flex gap-4 text-right">
                                <div className="flex flex-col items-end w-12">
                                    <span className={cn("text-xs font-mono font-medium", c.cpu_percent > 50 ? "text-amber-600" : "text-slate-600")}>
                                        {c.cpu_percent}%
                                    </span>
                                    <span className="text-[10px] text-slate-400">CPU</span>
                                </div>
                                <div className="flex flex-col items-end w-16">
                                    <span className="text-xs font-mono font-medium text-slate-600">
                                        {Math.round(c.memory_usage_mb)} MB
                                    </span>
                                    <span className="text-[10px] text-slate-400">RAM</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {(!stats?.containers || stats.containers.length === 0) && (
                        <div className="text-center py-4 text-xs text-slate-400 flex flex-col items-center gap-1">
                            <Warning2 size={16} />
                            <span>No container stats available</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

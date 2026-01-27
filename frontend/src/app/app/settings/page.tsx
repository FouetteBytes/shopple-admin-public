"use client"

import { useCentralStore } from '@/Store'
import { PageHeader } from '@/components/layout/PageHeader';
import PageNavbar, { PageNavbarIconButton, PageNavbarLeftContent, PageNavbarRightContent } from '@/components/layout/PageNavbar'
import { Setting4, ArrowLeft, Save2, RefreshCircle, Notification, SecuritySafe, Cpu, Data } from 'iconsax-react'
import { Key as KeyIcon, Loader2, Plus, Sparkles, X, Server } from 'lucide-react'
import { useGlobalToast } from '@/contexts/ToastContext'
import ApiKeysModal from '@/components/shared/ApiKeysModal'
import PageContent from '@/components/layout/PageContent'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { OutlineButton } from '@/components/ui/Button'
import Link from 'next/link'
import { keysAPI } from '@/lib/api'
import { GlassStatCard, type StatAccent } from '@/components/shared/GlassStatCard'
import { GlassSubTabs } from '@/components/shared/GlassSubTabs'
import { GlassFilterBar, type GlassFilterSelectConfig, type GlassFilterOption } from '@/components/shared/GlassFilterBar'
import { PageHero } from '@/components/shared/PageHero';
import { ServiceHealth } from '@/components/settings/ServiceHealth';
import OpenSearchStorage from '@/components/settings/OpenSearchStorage';
import { motion, AnimatePresence } from 'framer-motion'

interface Settings {
    ai: {
        modelProvider: string
        temperature: number
        maxTokens: number
        enableCaching: boolean
    }
    system: {
        autoSave: boolean
        notificationsEnabled: boolean
        darkMode: boolean
        refreshInterval: number
    }
    cache: {
        maxSize: string
        ttl: number
        autoOptimize: boolean
    }
    security: {
        sessionTimeout: number
        enableAuditLog: boolean
        requireAuth: boolean
    }
}

type SettingsTabKey = 'ai' | 'system' | 'cache' | 'security' | 'services'

const PROVIDER_ORDER = ['groq', 'openrouter', 'gemini', 'cerebras'] as const
type ProviderId = typeof PROVIDER_ORDER[number]
const PROVIDER_META: Record<ProviderId, { title: string; selectLabel: string; description: string; accent: string }> = {
    groq: {
        title: 'Groq',
        selectLabel: 'Groq (Fast)',
        description: 'High-speed reasoning models tuned for your primary cascade.',
        accent: 'bg-blue-100 text-blue-700 border-blue-200'
    },
    openrouter: {
        title: 'OpenRouter',
        selectLabel: 'OpenRouter',
        description: 'Mix-and-match frontier models through the OpenRouter marketplace.',
        accent: 'bg-purple-100 text-purple-700 border-purple-200'
    },
    gemini: {
        title: 'Google Gemini',
        selectLabel: 'Google Gemini',
        description: 'Google’s multimodal models for structured, compliant responses.',
        accent: 'bg-amber-100 text-amber-700 border-amber-200'
    },
    cerebras: {
        title: 'Cerebras',
        selectLabel: 'Cerebras',
        description: 'Purpose-built deployments where low-latency hosting is critical.',
        accent: 'bg-emerald-100 text-emerald-700 border-emerald-200'
    }
}

const createEmptyModelMap = (): Record<ProviderId, string[]> => (
    PROVIDER_ORDER.reduce((acc, prov) => {
        acc[prov] = []
        return acc
    }, {} as Record<ProviderId, string[]>)
)

const createEmptyInputMap = (): Record<ProviderId, string> => (
    PROVIDER_ORDER.reduce((acc, prov) => {
        acc[prov] = ''
        return acc
    }, {} as Record<ProviderId, string>)
)

const createEmptyDefaultMap = (): Record<ProviderId, string | null> => (
    PROVIDER_ORDER.reduce((acc, prov) => {
        acc[prov] = null
        return acc
    }, {} as Record<ProviderId, string | null>)
)

const normalizeModelMap = (source: Partial<Record<string, string[]>> | null | undefined): Record<ProviderId, string[]> => (
    PROVIDER_ORDER.reduce((acc, prov) => {
        const values = Array.isArray(source?.[prov]) ? (source?.[prov] as string[]) : []
        const seen = new Set<string>()
        const cleaned: string[] = []
        values.forEach(item => {
            if (typeof item !== 'string') return
            const trimmed = item.trim()
            if (!trimmed) return
            const key = trimmed.toLowerCase()
            if (seen.has(key)) return
            seen.add(key)
            cleaned.push(trimmed)
        })
        cleaned.sort((a, b) => a.localeCompare(b))
        acc[prov] = cleaned
        return acc
    }, {} as Record<ProviderId, string[]>)
)

const areModelMapsEqual = (a: Record<ProviderId, string[]>, b: Record<ProviderId, string[]>) => (
    PROVIDER_ORDER.every(prov => {
        const listA = a[prov] || []
        const listB = b[prov] || []
        if (listA.length !== listB.length) return false
        return listA.every((value, index) => value === listB[index])
    })
)

function Settings() {
    const { success, error: showError, info } = useGlobalToast()
    const [settings, setSettings] = useState<Settings>({
        ai: {
            modelProvider: 'groq',
            temperature: 0.7,
            maxTokens: 1000,
            enableCaching: true
        },
        system: {
            autoSave: true,
            notificationsEnabled: true,
            darkMode: false,
            refreshInterval: 30
        },
        cache: {
            maxSize: '100MB',
            ttl: 3600,
            autoOptimize: true
        },
        security: {
            sessionTimeout: 60,
            enableAuditLog: true,
            requireAuth: false
        }
    })

    const [isSaving, setIsSaving] = useState(false)
    const [showKeys, setShowKeys] = useState(false)
    const [activeTab, setActiveTab] = useState<SettingsTabKey>('ai')
    const [persistenceEnabled, setPersistenceEnabled] = useState<boolean | null>(null)
    const [allowedModels, setAllowedModels] = useState<Record<ProviderId, string[]>>(() => createEmptyModelMap())
    const [savedModels, setSavedModels] = useState<Record<ProviderId, string[]>>(() => createEmptyModelMap())
    const [defaultModels, setDefaultModels] = useState<Record<ProviderId, string | null>>(() => createEmptyDefaultMap())
    const [savedDefaults, setSavedDefaults] = useState<Record<ProviderId, string | null>>(() => createEmptyDefaultMap())
    const [modelInputs, setModelInputs] = useState<Record<ProviderId, string>>(() => createEmptyInputMap())
    const [modelsSaving, setModelsSaving] = useState(false)
    const [modelsLoading, setModelsLoading] = useState(true)
    const [sectionFilter, setSectionFilter] = useState<'all' | SettingsTabKey>('all')
    const [providerFilter, setProviderFilter] = useState<'all' | ProviderId>('all')
    const [settingsSearch, setSettingsSearch] = useState('')
    const [settingsAutoRefresh, setSettingsAutoRefresh] = useState(false)
    const [lastSettingsRefresh, setLastSettingsRefresh] = useState<Date | null>(null)

    const handleSettingsRefresh = useCallback(() => {
        setLastSettingsRefresh(new Date())
    }, [])

    const handleTabChange = useCallback((key: SettingsTabKey) => {
        setActiveTab(key)
        setSectionFilter(key)
    }, [])

    useEffect(() => {
        handleSettingsRefresh()
    }, [handleSettingsRefresh])

    useEffect(() => {
        if (!settingsAutoRefresh) return
        const id = setInterval(handleSettingsRefresh, 120000)
        return () => clearInterval(id)
    }, [settingsAutoRefresh, handleSettingsRefresh])

    const modelsDirty = useMemo(() => !areModelMapsEqual(allowedModels, savedModels), [allowedModels, savedModels])
    const allListsEmpty = useMemo(() => (
        PROVIDER_ORDER.every(prov => (allowedModels[prov] || []).length === 0)
    ), [allowedModels])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setModelsLoading(true)
            try {
                const [statusSnapshot, models, defaults] = await Promise.all([
                    keysAPI.status(),
                    keysAPI.allowedModels(),
                    keysAPI.defaultModels().catch(() => ({} as Record<string, string | null>))
                ])
                if (cancelled) return
                setPersistenceEnabled(!!statusSnapshot?.persistence?.enabled)
                const normalized = normalizeModelMap(models)
                setAllowedModels(normalized)
                setSavedModels(normalized)
                
                // Set defaults
                const normDefaults = createEmptyDefaultMap()
                PROVIDER_ORDER.forEach(p => {
                    normDefaults[p] = defaults[p] || (normalized[p]?.length > 0 ? normalized[p][0] : null)
                })
                setDefaultModels(normDefaults)
                setSavedDefaults(normDefaults)
                setModelInputs(createEmptyInputMap())
            } catch (err: any) {
                if (cancelled) return
                setPersistenceEnabled(null)
                showError('Failed to load settings', err?.message || 'Unable to fetch model library.')
            } finally {
                if (!cancelled) {
                    setModelsLoading(false)
                }
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            // Simulate save operation
            await new Promise(resolve => setTimeout(resolve, 1000))
            // Save to backend when persistence is enabled.
            console.log('Settings saved:', settings)
        } catch (error) {
            console.error('Failed to save settings:', error)
        } finally {
            setIsSaving(false)
        }
    }

    const updateSetting = (category: keyof Settings, key: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [key]: value
            }
        }))
    }

    const handleAddModel = (provider: ProviderId) => {
        const value = (modelInputs[provider] || '').trim()
        if (!value) return
        let added = false
        setAllowedModels(prev => {
            const existing = prev[provider] || []
            const duplicate = existing.some(item => item.toLowerCase() === value.toLowerCase())
            if (duplicate) {
                info('Model already listed', `${value} is already available for ${PROVIDER_META[provider].title}.`)
                return prev
            }
            added = true
            const next = [...existing, value].sort((a, b) => a.localeCompare(b))
            return { ...prev, [provider]: next }
        })
        if (added) {
            setModelInputs(prev => ({ ...prev, [provider]: '' }))
        }
    }

    const handleRemoveModel = (provider: ProviderId, model: string) => {
        let removed = false
        setAllowedModels(prev => {
            const existing = prev[provider] || []
            if (!existing.includes(model)) {
                return prev
            }
            removed = true
            const next = existing.filter(item => item !== model)
            return { ...prev, [provider]: next }
        })
        if (defaultModels[provider] === model) {
            setDefaultModels(prev => ({ ...prev, [provider]: null }))
        }
    }

    const handleSetDefaultModel = (prov: ProviderId, model: string) => {
        setDefaultModels(prev => ({ ...prev, [prov]: model })) 
    }

    const handleSaveModels = async () => {
        if (modelsSaving) return
        setModelsSaving(true)
        try {
            const modelsPayload = PROVIDER_ORDER.reduce((acc, prov) => {
                const list = (allowedModels[prov] || []).map(item => item.trim()).filter(Boolean)
                const unique = Array.from(new Set(list)).sort((a, b) => a.localeCompare(b))
                acc[prov] = unique
                return acc
            }, {} as Record<ProviderId, string[]>)
            
            const payload = {
                models: modelsPayload,
                defaults: defaultModels
            }
            
            const response = await keysAPI.saveAllowedModels(payload)
            const normalized = normalizeModelMap(response.models)
            setAllowedModels(normalized)
            setSavedModels(normalized)
            setSavedDefaults(response.defaults ? (response.defaults as any) : defaultModels)

            setModelInputs(createEmptyInputMap())
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('allowed-models-updated', { detail: normalized }))
            }
            success('Model catalog updated', 'Allowed model list saved successfully.')
        } catch (err: any) {
            showError('Failed to save models', err?.message || 'Unable to update allowed models.')
        } finally {
            setModelsSaving(false)
        }
    }

    type SettingsStatCard = { key: string; label: string; value: string; subtext: string; accent: StatAccent }

    const totalAllowedModels = useMemo(() => (
        PROVIDER_ORDER.reduce((sum, prov) => sum + (allowedModels[prov]?.length ?? 0), 0)
    ), [allowedModels])

    const settingsStatCards = useMemo<SettingsStatCard[]>(() => {
        const providerId = settings.ai.modelProvider as ProviderId
        const providerLabel = PROVIDER_META[providerId]?.title ?? settings.ai.modelProvider
        return [
            {
                key: 'provider',
                label: 'Primary provider',
                value: providerLabel,
                subtext: 'Cascade source',
                accent: 'primary'
            },
            {
                key: 'cache',
                label: 'Cache TTL',
                value: `${Math.round(settings.cache.ttl / 60)} min`,
                subtext: 'Classifier cache layer',
                accent: 'amber'
            },
            {
                key: 'session',
                label: 'Session timeout',
                value: `${settings.security.sessionTimeout} min`,
                subtext: settings.security.enableAuditLog ? 'Audit logging enabled' : 'Audit log disabled',
                accent: 'emerald'
            },
            {
                key: 'models',
                label: 'Allowed models',
                value: totalAllowedModels.toString(),
                subtext: settings.ai.enableCaching ? 'Caching enabled' : 'Caching disabled',
                accent: 'blue'
            }
        ]
    }, [settings.ai.enableCaching, settings.ai.modelProvider, settings.cache.ttl, settings.security.enableAuditLog, settings.security.sessionTimeout, totalAllowedModels])

    const settingsTabs = useMemo(() => {
        const providerCount = PROVIDER_ORDER.filter(prov => (allowedModels[prov] || []).length > 0).length
        return [
            {
                key: 'ai' as const,
                label: 'AI Models',
                description: `${providerCount} providers configured`,
                icon: Cpu,
                accentGradient: 'bg-gradient-to-br from-indigo-500/15 via-white to-transparent'
            },
            {
                key: 'system' as const,
                label: 'System',
                description: settings.system.autoSave ? 'Auto-save enabled' : 'Manual mode',
                icon: Setting4,
                accentGradient: 'bg-gradient-to-br from-emerald-500/15 via-white to-transparent'
            },
            {
                key: 'cache' as const,
                label: 'Cache',
                description: `${settings.cache.maxSize} capacity`,
                icon: Data,
                accentGradient: 'bg-gradient-to-br from-amber-500/15 via-white to-transparent'
            },
            {
                key: 'security' as const,
                label: 'Security',
                description: settings.security.requireAuth ? 'Authentication required' : 'Auth optional',
                icon: SecuritySafe,
                accentGradient: 'bg-gradient-to-br from-rose-500/15 via-white to-transparent'
            },
            {
                key: 'services' as const,
                label: 'Services',
                description: 'Monitor system health',
                icon: Server,
                accentGradient: 'bg-gradient-to-br from-blue-500/15 via-white to-transparent'
            }
        ]
    }, [allowedModels, settings.cache.maxSize, settings.security.requireAuth, settings.system.autoSave])

    const sectionOptions = useMemo<GlassFilterOption[]>(() => ([
        { value: 'all', label: 'All sections' },
        { value: 'ai', label: 'AI models' },
        { value: 'system', label: 'System' },
        { value: 'cache', label: 'Cache' },
        { value: 'security', label: 'Security' }
    ]), [])

    const providerOptions = useMemo<GlassFilterOption[]>(() => ([
        { value: 'all', label: 'All providers' },
        ...PROVIDER_ORDER.map((prov) => ({ value: prov, label: PROVIDER_META[prov].title }))
    ]), [])

    const settingsFilterSelects: GlassFilterSelectConfig[] = useMemo(() => ([]), [])

    // Intuitive search: Switch tabs based on search query
    useEffect(() => {
        const query = settingsSearch.toLowerCase().trim()
        if (!query) return

        const keywords: Record<SettingsTabKey, string[]> = {
            ai: ['model', 'provider', 'token', 'temperature', 'cache', 'ai', 'groq', 'gemini', 'openrouter', 'cerebras'],
            system: ['save', 'notification', 'refresh', 'dark', 'system', 'auto'],
            cache: ['ttl', 'optimize', 'size', 'capacity', 'memory'],
            security: ['audit', 'auth', 'timeout', 'security', 'log', 'session'],
            services: ['health', 'status', 'service', 'monitor', 'redis', 'firebase']
        }

        for (const [tab, terms] of Object.entries(keywords)) {
            if (terms.some(term => query.includes(term))) {
                setActiveTab(tab as SettingsTabKey)
                return
            }
        }
    }, [settingsSearch])

    // Filter function for content visibility
    const searchMatchesContent = useCallback((content: string) => {
        const query = settingsSearch.toLowerCase().trim()
        if (!query) return true
        return content.toLowerCase().includes(query)
    }, [settingsSearch])

    const hasSearchQuery = settingsSearch.trim().length > 0

    const providerOrderForDisplay = useMemo(() => {
        const query = settingsSearch.trim().toLowerCase()
        if (providerFilter !== 'all') {
            return [providerFilter]
        }
        if (!query) {
            return PROVIDER_ORDER
        }
        return PROVIDER_ORDER.filter((prov) => {
            const models = allowedModels[prov] || []
            return models.some((model) => model.toLowerCase().includes(query))
        })
    }, [allowedModels, providerFilter, settingsSearch])

    return (
        <div>
            <PageHeader 
                title="Settings" 
                backUrl="/app/dashboard"
                icon={Setting4}
                hideSearch={true}
                hideNotification={true}
            >
                <button onClick={() => setShowKeys(true)} className='h-8 gap-1 bg-primary py-1 px-3 duration-200 text-white rounded-lg text-xs flex items-center justify-center'>
                    <KeyIcon size={16} /> API Keys
                </button>
                {persistenceEnabled !== null && (
                    persistenceEnabled ? (
                        <span className='hidden md:inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-200'>
                            <span className='w-1.5 h-1.5 rounded-full bg-green-600'></span>
                            Encrypted persistence
                        </span>
                    ) : (
                        <span className='hidden md:inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200' title='Set KEYSTORE_SECRET to enable encrypted persistence across restarts.'>
                            <span className='w-1.5 h-1.5 rounded-full bg-yellow-500'></span>
                            Memory-only
                        </span>
                    )
                )}
                <OutlineButton 
                    onClick={handleSave}
                    disabled={isSaving}
                    className='h-8 gap-1 bg-primary py-1 px-3 duration-200 text-white rounded-lg text-xs flex items-center justify-center'
                >
                    {isSaving ? (
                        <RefreshCircle size={16} className="animate-spin" />
                    ) : (
                        <Save2 size={16} />
                    )}
                    <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </OutlineButton>
            </PageHeader>

            <PageContent>
                {showKeys && (
                    <ApiKeysModal open={showKeys} onClose={() => setShowKeys(false)} />
                )}
                <div className='w-full space-y-6 px-2 md:px-4'>
                    <PageHero
                        title="System Settings"
                        description="Configure AI models and system preferences"
                        stats={[
                            {
                                label: 'Primary provider',
                                value: PROVIDER_META[settings.ai.modelProvider as ProviderId]?.title ?? settings.ai.modelProvider,
                                subtext: 'Cascade source',
                                icon: Cpu,
                                color: 'violet'
                            },
                            {
                                label: 'Cache TTL',
                                value: `${Math.round(settings.cache.ttl / 60)} min`,
                                subtext: 'Classifier cache layer',
                                icon: RefreshCircle,
                                color: 'amber'
                            },
                            {
                                label: 'Session timeout',
                                value: `${settings.security.sessionTimeout} min`,
                                subtext: settings.security.enableAuditLog ? 'Audit logging enabled' : 'Audit log disabled',
                                icon: SecuritySafe,
                                color: 'emerald'
                            },
                            {
                                label: 'Allowed models',
                                value: totalAllowedModels.toString(),
                                subtext: settings.ai.enableCaching ? 'Caching enabled' : 'Caching disabled',
                                icon: Setting4,
                                color: 'blue'
                            }
                        ]}
                    />

                    <GlassSubTabs
                        tabs={settingsTabs}
                        activeKey={activeTab}
                        onChange={handleTabChange}
                        layoutId='settings-tabs'
                        columnsClassName='grid-cols-1 md:grid-cols-5'
                    />

                    <GlassFilterBar
                        searchPlaceholder='Search settings (e.g. "cache", "models", "security")...'
                        searchValue={settingsSearch}
                        onSearchChange={setSettingsSearch}
                        selects={settingsFilterSelects}
                        onRefresh={handleSettingsRefresh}
                        autoRefresh={settingsAutoRefresh}
                        onAutoRefreshChange={setSettingsAutoRefresh}
                        lastRefreshedLabel={lastSettingsRefresh ? lastSettingsRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null}
                    />

                    <AnimatePresence mode='wait'>
                        {/* AI Models Settings */}
                        {activeTab === 'ai' && (
                            <motion.div
                                key="ai"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.2 }}
                                className='space-y-6'
                            >
                                {(!hasSearchQuery || searchMatchesContent('model provider temperature tokens caching')) && (
                                <div className='bg-white rounded-lg border p-6'>
                                <h3 className='text-lg font-medium text-gray-900 mb-4'>AI Model Configuration</h3>
                                
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                                            Model Provider
                                        </label>
                                        <select
                                            value={settings.ai.modelProvider}
                                            onChange={(e) => updateSetting('ai', 'modelProvider', e.target.value)}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                        >
                                            {PROVIDER_ORDER.map(prov => (
                                                <option key={prov} value={prov}>{PROVIDER_META[prov].selectLabel}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                                            Temperature: {settings.ai.temperature}
                                        </label>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={settings.ai.temperature}
                                            onChange={(e) => updateSetting('ai', 'temperature', parseFloat(e.target.value))}
                                            className='w-full'
                                        />
                                        <div className='flex justify-between text-xs text-gray-500 mt-1'>
                                            <span>Conservative</span>
                                            <span>Creative</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                                            Max Tokens
                                        </label>
                                        <input
                                            type="number"
                                            min="100"
                                            max="4000"
                                            value={settings.ai.maxTokens}
                                            onChange={(e) => updateSetting('ai', 'maxTokens', parseInt(e.target.value))}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                        />
                                    </div>

                                    <div className='flex items-center'>
                                        <input
                                            type="checkbox"
                                            id="enableCaching"
                                            checked={settings.ai.enableCaching}
                                            onChange={(e) => updateSetting('ai', 'enableCaching', e.target.checked)}
                                            className='h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                                        />
                                        <label htmlFor="enableCaching" className='ml-2 text-sm text-gray-700'>
                                            Enable AI Response Caching
                                        </label>
                                    </div>
                                </div>
                            </div>
                                )}

                            <div className='bg-white rounded-lg border p-6 space-y-6'>
                                <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
                                    <div>
                                        <div className='flex items-center gap-2'>
                                            <Sparkles size={18} className='text-primary' />
                                            <h3 className='text-lg font-medium text-gray-900'>Provider Model Library</h3>
                                        </div>
                                        <p className='text-sm text-gray-500 mt-1'>Curate which models appear in API key tests and server-side validation.</p>
                                    </div>
                                    <div className='flex items-center gap-3'>
                                        {modelsDirty && (
                                            <span className='inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200'>
                                                <span className='w-1.5 h-1.5 rounded-full bg-amber-600'></span>
                                                Unsaved edits
                                            </span>
                                        )}
                                        <button
                                            onClick={handleSaveModels}
                                            disabled={!modelsDirty || modelsSaving}
                                            className='inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-white bg-primary disabled:opacity-60 disabled:cursor-not-allowed'
                                        >
                                            {modelsSaving ? <Loader2 size={16} className='animate-spin' /> : <Save2 size={16} />}
                                            Save library
                                        </button>
                                    </div>
                                </div>

                                {modelsLoading ? (
                                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                        {PROVIDER_ORDER.map(prov => (
                                            <div key={`skeleton-${prov}`} className='animate-pulse border rounded-lg p-4 bg-gray-50/80 h-44'>
                                                <div className='h-4 w-28 bg-gray-200 rounded mb-3'></div>
                                                <div className='h-3 w-full bg-gray-200 rounded mb-2'></div>
                                                <div className='h-3 w-3/4 bg-gray-200 rounded'></div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        {allListsEmpty && (
                                            <div className='border border-amber-200 bg-amber-50 text-amber-700 text-xs px-3 py-2 rounded-md'>
                                                Add at least one model across providers to keep connectivity tests available.
                                            </div>
                                        )}
                                        {providerOrderForDisplay.length === 0 ? (
                                            <div className='rounded-lg border border-dashed border-gray-200 bg-white/70 px-4 py-6 text-center text-sm text-gray-500'>
                                                No providers match the current filters.
                                            </div>
                                        ) : (
                                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                                {providerOrderForDisplay.map(prov => {
                                                    const models = allowedModels[prov] || []
                                                    const query = settingsSearch.trim().toLowerCase()
                                                    const visibleModels = query ? models.filter(model => model.toLowerCase().includes(query)) : models
                                                    return (
                                                        <div key={prov} className='border rounded-lg p-4 bg-gray-50'>
                                                            <div className='flex items-center justify-between gap-2'>
                                                                <div className='flex flex-col'>
                                                                    <span className='text-sm font-semibold text-gray-900'>{PROVIDER_META[prov].title}</span>
                                                                    <span className='text-xs text-gray-500'>{PROVIDER_META[prov].description}</span>
                                                                </div>
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PROVIDER_META[prov].accent}`}>
                                                                    {models.length} {models.length === 1 ? 'model' : 'models'}
                                                                </span>
                                                            </div>

                                                            <div className='mt-3 flex flex-wrap gap-2 min-h-[28px]'>
                                                                {visibleModels.length === 0 ? (
                                                                    <span className='text-xs text-gray-500 italic'>
                                                                        {query ? 'No models match your search.' : 'No models yet. Add one below.'}
                                                                    </span>
                                                                ) : (
                                                                    visibleModels.map(model => (
                                                                        <span key={model} className='group inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-gray-200 bg-white shadow-sm'>
                                                                            <span>{model}</span>
                                                                            <button
                                                                                onClick={() => handleRemoveModel(prov, model)}
                                                                                className='text-gray-400 hover:text-red-500 transition disabled:opacity-50'
                                                                                title='Remove model'
                                                                                disabled={modelsSaving}
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        </span>
                                                                    ))
                                                                )}
                                                            </div>

                                                            <div className='mt-4 flex flex-col gap-3'>
                                                                <div className='flex items-center gap-2'>
                                                                    <div className='flex-1 flex items-center gap-2'>
                                                                        <input
                                                                            type='text'
                                                                            value={modelInputs[prov] || ''}
                                                                            onChange={(e) => setModelInputs(prev => ({ ...prev, [prov]: e.target.value }))}
                                                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddModel(prov) } }}
                                                                            placeholder='Add model id...'
                                                                            className='flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
                                                                            disabled={modelsSaving}
                                                                        />
                                                                        <button
                                                                            onClick={() => handleAddModel(prov)}
                                                                            className='inline-flex items-center gap-1 px-3 py-2 text-xs font-medium border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50'
                                                                            disabled={modelsSaving || !(modelInputs[prov] || '').trim().length}
                                                                        >
                                                                            <Plus size={14} />
                                                                            Add
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {models.length > 0 && (
                                                                    <div className='flex items-center gap-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100'>
                                                                        <label className='text-[10px] font-semibold text-blue-700 uppercase tracking-wide whitespace-nowrap px-1'>
                                                                            Default Model
                                                                        </label>
                                                                        <select
                                                                            value={defaultModels[prov] || ''}
                                                                            onChange={(e) => handleSetDefaultModel(prov, e.target.value)}
                                                                            className='w-full bg-white border border-blue-200 text-gray-700 text-xs rounded shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 py-1.5 px-2'
                                                                            disabled={modelsSaving}
                                                                        >
                                                                            <option value="" disabled>Select default...</option>
                                                                            {models.map(m => (
                                                                                <option key={m} value={m}>{m} {m === defaultModels[prov] ? '(Active)' : ''}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}

                                <p className='text-xs text-gray-500 border-t pt-4 mt-4'>
                                    These choices drive testing dropdowns and validation when classification runs. Keep each list focused on the models your team trusts.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* System Settings */}
                    {activeTab === 'system' && (
                        <motion.div
                            key="system"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2 }}
                            className='space-y-6'
                        >
                            <div className='bg-white rounded-lg border p-6'>
                                <h3 className='text-lg font-medium text-gray-900 mb-4'>System Preferences</h3>
                                
                                <div className='space-y-6'>
                                    {(!hasSearchQuery || searchMatchesContent('auto save automatically')) && (
                                    <div className='flex items-center justify-between'>
                                        <div>
                                            <h4 className='text-sm font-medium text-gray-900'>Auto-save</h4>
                                            <p className='text-sm text-gray-500'>Automatically save changes</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={settings.system.autoSave}
                                            onChange={(e) => updateSetting('system', 'autoSave', e.target.checked)}
                                            className='h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                                        />
                                    </div>
                                    )}

                                    {(!hasSearchQuery || searchMatchesContent('notifications notify system')) && (
                                    <div className='flex items-center justify-between'>
                                        <div>
                                            <h4 className='text-sm font-medium text-gray-900'>Notifications</h4>
                                            <p className='text-sm text-gray-500'>Receive system notifications</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={settings.system.notificationsEnabled}
                                            onChange={(e) => updateSetting('system', 'notificationsEnabled', e.target.checked)}
                                            className='h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                                        />
                                    </div>
                                    )}

                                    {(!hasSearchQuery || searchMatchesContent('dashboard refresh interval seconds')) && (
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                                            Dashboard Refresh Interval (seconds)
                                        </label>
                                        <select
                                            value={settings.system.refreshInterval}
                                            onChange={(e) => updateSetting('system', 'refreshInterval', parseInt(e.target.value))}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                        >
                                            <option value={15}>15 seconds</option>
                                            <option value={30}>30 seconds</option>
                                            <option value={60}>1 minute</option>
                                            <option value={300}>5 minutes</option>
                                        </select>
                                    </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Services Settings */}
                    {activeTab === 'services' && (
                        <motion.div
                            key="services"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2 }}
                            className='space-y-6'
                        >
                            <ServiceHealth />
                            <OpenSearchStorage />
                        </motion.div>
                    )}

                    {/* Cache Settings */}
                    {activeTab === 'cache' && (
                        <motion.div
                            key="cache"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2 }}
                            className='space-y-6'
                        >
                            <div className='bg-white rounded-lg border p-6'>
                                <h3 className='text-lg font-medium text-gray-900 mb-4'>Cache Management</h3>
                                
                                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                                    {(!hasSearchQuery || searchMatchesContent('maximum cache size capacity')) && (
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                                            Maximum Cache Size
                                        </label>
                                        <select
                                            value={settings.cache.maxSize}
                                            onChange={(e) => updateSetting('cache', 'maxSize', e.target.value)}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                        >
                                            <option value="50MB">50 MB</option>
                                            <option value="100MB">100 MB</option>
                                            <option value="200MB">200 MB</option>
                                            <option value="500MB">500 MB</option>
                                        </select>
                                    </div>
                                    )}

                                    {(!hasSearchQuery || searchMatchesContent('time to live ttl seconds expiry')) && (
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                                            Time to Live (seconds)
                                        </label>
                                        <input
                                            type="number"
                                            min="300"
                                            max="86400"
                                            value={settings.cache.ttl}
                                            onChange={(e) => updateSetting('cache', 'ttl', parseInt(e.target.value))}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                        />
                                    </div>
                                    )}

                                    {(!hasSearchQuery || searchMatchesContent('automatic cache optimization optimize')) && (
                                    <div className='md:col-span-2'>
                                        <div className='flex items-center'>
                                            <input
                                                type="checkbox"
                                                id="autoOptimize"
                                                checked={settings.cache.autoOptimize}
                                                onChange={(e) => updateSetting('cache', 'autoOptimize', e.target.checked)}
                                                className='h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                                            />
                                            <label htmlFor="autoOptimize" className='ml-2 text-sm text-gray-700'>
                                                Enable automatic cache optimization
                                            </label>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Security Settings */}
                    {activeTab === 'security' && (
                        <motion.div
                            key="security"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2 }}
                            className='space-y-6'
                        >
                            <div className='bg-white rounded-lg border p-6'>
                                <h3 className='text-lg font-medium text-gray-900 mb-4'>Security Configuration</h3>
                                
                                <div className='space-y-6'>
                                    {(!hasSearchQuery || searchMatchesContent('session timeout minutes')) && (
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>
                                            Session Timeout (minutes)
                                        </label>
                                        <input
                                            type="number"
                                            min="15"
                                            max="480"
                                            value={settings.security.sessionTimeout}
                                            onChange={(e) => updateSetting('security', 'sessionTimeout', parseInt(e.target.value))}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                        />
                                    </div>
                                    )}

                                    {(!hasSearchQuery || searchMatchesContent('audit logging log activities')) && (
                                    <div className='flex items-center justify-between'>
                                        <div>
                                            <h4 className='text-sm font-medium text-gray-900'>Audit Logging</h4>
                                            <p className='text-sm text-gray-500'>Log all system activities</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={settings.security.enableAuditLog}
                                            onChange={(e) => updateSetting('security', 'enableAuditLog', e.target.checked)}
                                            className='h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                                        />
                                    </div>
                                    )}

                                    {(!hasSearchQuery || searchMatchesContent('require authentication auth user')) && (
                                    <div className='flex items-center justify-between'>
                                        <div>
                                            <h4 className='text-sm font-medium text-gray-900'>Require Authentication</h4>
                                            <p className='text-sm text-gray-500'>Enable user authentication</p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={settings.security.requireAuth}
                                            onChange={(e) => updateSetting('security', 'requireAuth', e.target.checked)}
                                            className='h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                                        />
                                    </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </div>
            </PageContent>
        </div>
    )
}

export default Settings

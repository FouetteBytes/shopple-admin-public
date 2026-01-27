import { motion } from 'framer-motion'
import { Activity, ArrowUp2, DocumentText1, Eye, Play, Stop, Trash } from 'iconsax-react'
import type { ReactNode, RefObject } from 'react'

import CrawlerCard from '@/components/crawler/CrawlerCard'
import { crawlerAPI } from '@/lib/api'
import type { ScheduleBatchMode } from '@/types/crawler'

import type { CrawlerInfo, CrawlerStatus, FileViewerState, GroupControlState } from '@/app/app/crawler/types'

type ToastHandler = (title: string, description: string) => void

type LimitUpdater = {
    max?: number
    crawlAll?: boolean
    headless?: boolean
}

type MonitorTabProps = {
    loading: boolean
    allCrawlers: CrawlerInfo[]
    activeCrawlers: Record<string, any>
    recentActivity: any[]
    startBatchMode: ScheduleBatchMode
    groupLaunching: string | null
    setGroupLaunching: (value: string | null) => void
    categoryLaunching: string | null
    setCategoryLaunching: (value: string | null) => void
    startingAll: boolean
    setStartingAll: (value: boolean) => void
    getGroupCounts: Record<string, number>
    info: ToastHandler
    success: ToastHandler
    warning: ToastHandler
    showError: ToastHandler
    quickRefresh: () => void
    buildSpecsFromCrawlers: (filter: (crawler: CrawlerInfo) => boolean) => Array<{ store: string; category: string; max_items?: number; headless_mode?: boolean }>
    selectedStoreLaunch: string
    setSelectedStoreLaunch: (value: string) => void
    selectedCategoryLaunch: string
    setSelectedCategoryLaunch: (value: string) => void
    storeGroupConfig: GroupControlState
    categoryGroupConfig: GroupControlState
    handleStoreGroupMaxChange: (value: string) => void
    handleCategoryGroupMaxChange: (value: string) => void
    handleStoreGroupCrawlAllToggle: () => void
    handleCategoryGroupCrawlAllToggle: () => void
    handleStoreGroupHeadlessToggle: () => void
    handleCategoryGroupHeadlessToggle: () => void
    storeCrawlAllRef: RefObject<HTMLInputElement>
    storeHeadlessRef: RefObject<HTMLInputElement>
    categoryCrawlAllRef: RefObject<HTMLInputElement>
    categoryHeadlessRef: RefObject<HTMLInputElement>
    getUniqueStores: () => string[]
    getUniqueCategories: (stores?: string | string[]) => string[]
    formatNumber: (value: number) => string
    getStoreStyle: (store: string) => { chip: string; hover: string; gradient: string; cta: string }
    getStatusStyle: (status: string) => { className: string; label: string }
    getLimitFor: (store: string, category: string) => LimitUpdater
    setLimitFor: (store: string, category: string, updates: LimitUpdater) => void
    resolveMaxItems: (value: number | string | undefined, useAll: boolean) => number | undefined
    DEFAULT_MAX_ITEMS: number
    crawlerStatus: CrawlerStatus
    handleStartCrawler: (store: string, category: string) => Promise<void> | void
    handleStopCrawler: (crawlerId: string) => Promise<void> | void
    renderScheduleSection: () => ReactNode
    clearRecentActivity: () => Promise<void> | void
    viewFileContent: (store: string, filename: string, category?: string) => void
    loadFileAndSendToClassifier: (store: string, filename: string) => Promise<void> | void
    findResultKeyForActivity: (activity: any) => string | null
    removeRecentActivity: (activity: any) => Promise<void> | void
    sendFileToClassifier: (items: any[]) => Promise<void> | void
    crawlerResults: Record<string, any>
    setFileViewModal: (updater: FileViewerState | ((prev: FileViewerState) => FileViewerState)) => void
}

export const MonitorTab = ({
    loading,
    allCrawlers,
    activeCrawlers,
    recentActivity,
    startBatchMode,
    groupLaunching,
    setGroupLaunching,
    categoryLaunching,
    setCategoryLaunching,
    startingAll,
    setStartingAll,
    getGroupCounts,
    info,
    success,
    warning,
    showError,
    quickRefresh,
    buildSpecsFromCrawlers,
    selectedStoreLaunch,
    setSelectedStoreLaunch,
    selectedCategoryLaunch,
    setSelectedCategoryLaunch,
    storeGroupConfig,
    categoryGroupConfig,
    handleStoreGroupMaxChange,
    handleCategoryGroupMaxChange,
    handleStoreGroupCrawlAllToggle,
    handleCategoryGroupCrawlAllToggle,
    handleStoreGroupHeadlessToggle,
    handleCategoryGroupHeadlessToggle,
    storeCrawlAllRef,
    storeHeadlessRef,
    categoryCrawlAllRef,
    categoryHeadlessRef,
    getUniqueStores,
    getUniqueCategories,
    formatNumber,
    getStoreStyle,
    getStatusStyle,
    getLimitFor,
    setLimitFor,
    resolveMaxItems,
    DEFAULT_MAX_ITEMS,
    crawlerStatus,
    handleStartCrawler,
    handleStopCrawler,
    renderScheduleSection,
    clearRecentActivity,
    viewFileContent,
    loadFileAndSendToClassifier,
    findResultKeyForActivity,
    removeRecentActivity,
    sendFileToClassifier,
    crawlerResults,
    setFileViewModal,
}: MonitorTabProps) => {
    if (loading && allCrawlers.length === 0) {
        return (
            <div className='space-y-6'>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={`monitor-skeleton-${index}`} className='rounded-xl border border-slate-200/70 bg-white/80 px-4 py-4 shadow-sm animate-pulse supports-[backdrop-filter]:bg-white/60'>
                            <div className='mb-4 h-4 w-1/2 rounded bg-gray-200'></div>
                            <div className='space-y-2'>
                                <div className='h-3 w-3/4 rounded bg-gray-200'></div>
                                <div className='h-3 w-2/3 rounded bg-gray-200'></div>
                                <div className='h-3 w-1/2 rounded bg-gray-200'></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const keellsCrawlers = allCrawlers.filter(crawler => crawler.store === 'keells')
    const cargillsCrawlers = allCrawlers.filter(crawler => crawler.store === 'cargills')
    const activeEntries = Object.entries(activeCrawlers).filter(([, crawler]) => crawler.status === 'running' || crawler.status === 'starting')
    const completedActivities = recentActivity.filter(activity => activity.status === 'completed' || activity._isPseudo)
    const otherActivities = recentActivity.filter(activity => activity.status !== 'completed')

    const launchGroup = async (
        payload: Parameters<typeof crawlerAPI.startCrawlerGroup>[0],
        label: string,
        options: { spinnerKey?: string; spinnerTarget?: 'store' | 'category' | 'all'; estimated?: number } = {},
    ) => {
        try {
            const finalPayload = {
                ...payload,
                batch_mode: payload.batch_mode ?? startBatchMode,
            }

            if (options.spinnerTarget === 'store') {
                setGroupLaunching(options.spinnerKey || label)
            } else if (options.spinnerTarget === 'category') {
                setCategoryLaunching(options.spinnerKey || label)
            } else if (options.spinnerTarget === 'all') {
                setStartingAll(true)
            }

            const estimated = options.estimated ?? getGroupCounts['all']
            const modeLabel = finalPayload.batch_mode === 'sequential' ? 'sequentially' : 'in parallel'
            const countText = estimated ? ` (${formatNumber(estimated)} crawlers)` : ''
            info('Starting Crawler Group', `Launching ${label}${countText} ${modeLabel}.`)

            await crawlerAPI.startCrawlerGroup(finalPayload)
            success('Group Launch Started', `Started ${label}. Monitoring will update shortly.`)
            quickRefresh()
        } catch (error) {
            console.error('Failed to start crawler group:', error)
            const message = error instanceof Error ? error.message : 'Failed to start group'
            showError('Group Start Failed', message)
        } finally {
            if (options.spinnerTarget === 'store') {
                setGroupLaunching(null)
            } else if (options.spinnerTarget === 'category') {
                setCategoryLaunching(null)
            } else if (options.spinnerTarget === 'all') {
                setStartingAll(false)
            }
        }
    }

    const handleStoreLaunch = async (store: string) => {
        const specs = buildSpecsFromCrawlers(crawler => crawler.store === store)
        if (specs.length === 0) {
            warning('No Crawlers', `No crawlers configured for ${store}.`)
            return
        }
        await launchGroup(
            { mode: 'custom', crawlers: specs },
            `${store.charAt(0).toUpperCase() + store.slice(1)} store crawlers`,
            { spinnerTarget: 'store', spinnerKey: store, estimated: specs.length },
        )
    }

    const handleCategoryLaunch = async (category: string) => {
        const specs = buildSpecsFromCrawlers(crawler => crawler.category === category)
        if (specs.length === 0) {
            warning('No Crawlers', `No crawlers found for ${category}.`)
            return
        }
        await launchGroup(
            { mode: 'custom', crawlers: specs },
            `${category.replace('_', ' ')} category crawlers`,
            { spinnerTarget: 'category', spinnerKey: category, estimated: specs.length },
        )
    }

    const storeOptions = getUniqueStores()
    const categoryOptions = getUniqueCategories()
    const selectedStoreCount = selectedStoreLaunch ? getGroupCounts[`store::${selectedStoreLaunch}`] ?? 0 : 0
    const selectedCategoryCount = selectedCategoryLaunch ? getGroupCounts[`category::${selectedCategoryLaunch}`] ?? 0 : 0

    const scheduleSection = renderScheduleSection()

    const renderRunSettings = (
        scope: 'store' | 'category',
        config: GroupControlState,
        options: { onMaxChange: (value: string) => void; onCrawlAllToggle: () => void; onHeadlessToggle: () => void; disabled: boolean; refs: { crawlAll: RefObject<HTMLInputElement>; headless: RefObject<HTMLInputElement> } },
    ) => (
        <div className='mt-4 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-xs text-slate-600 supports-[backdrop-filter]:bg-white/60'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='font-semibold uppercase tracking-[0.18em] text-slate-500'>Run settings</span>
                {config.maxMixed && <span className='text-[11px] text-slate-400'>Mixed max items – updating will sync all crawlers</span>}
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-4'>
                <label className='flex items-center gap-2'>
                    <span className='text-slate-500'>Max items</span>
                    <input
                        type='text'
                        inputMode='numeric'
                        pattern='[0-9]*'
                        value={config.max}
                        onChange={(event) => options.onMaxChange(event.target.value)}
                        placeholder={config.maxMixed ? 'Mixed' : 'Default 50'}
                        disabled={config.crawlAll || options.disabled}
                        className='h-8 w-20 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100'
                    />
                </label>
                <label className='flex items-center gap-2'>
                    <input
                        ref={options.refs.crawlAll}
                        type='checkbox'
                        checked={config.crawlAll}
                        onChange={options.onCrawlAllToggle}
                        disabled={options.disabled}
                        className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                    />
                    Crawl all
                </label>
                <label className='flex items-center gap-2'>
                    <input
                        ref={options.refs.headless}
                        type='checkbox'
                        checked={config.headless}
                        onChange={options.onHeadlessToggle}
                        disabled={options.disabled}
                        className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                    />
                    Headless
                </label>
            </div>
        </div>
    )

    const renderCrawlerCard = (crawler: CrawlerInfo, storeLabel: string) => {
        const currentStatus = activeCrawlers[`${crawler.store}_${crawler.category}`] || crawler
        const statusKey = currentStatus.status || 'inactive'
        const isRunning = statusKey === 'running' || statusKey === 'starting'
        const isCompleted = statusKey === 'completed'
        const isInactive = statusKey === 'inactive'
        const storeStyle = getStoreStyle(crawler.store)
        const statusStyle = getStatusStyle(isInactive ? 'inactive' : statusKey)
        const limitConfig = getLimitFor(crawler.store, crawler.category)
        const useAll = (limitConfig.crawlAll ?? false) === true
        const targetMax = resolveMaxItems(limitConfig.max, useAll) ?? (crawler.config?.max_items ?? DEFAULT_MAX_ITEMS)
        const targetLabel = useAll ? 'Target: Unlimited' : `Target: Max ${targetMax}`
        const itemsFound = typeof currentStatus.items_found === 'number' ? formatNumber(currentStatus.items_found) : '—'
        const completedAt = currentStatus.timestamp ? new Date(currentStatus.timestamp) : null
        const lastRunLabel = completedAt
            ? `${completedAt.toLocaleDateString()} • ${completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'No recent runs'

        const actionConfig = isRunning
            ? {
                  mode: 'stop' as const,
                  label: 'Stop',
                  disabled: !currentStatus.crawler_id,
                  onClick: () => {
                      if (currentStatus.crawler_id) {
                          void handleStopCrawler(currentStatus.crawler_id)
                      }
                  },
              }
            : {
                  mode: 'start' as const,
                  label: isCompleted ? 'Restart' : 'Start',
                  disabled: !crawlerStatus.available,
                  onClick: () => void handleStartCrawler(crawler.store, crawler.category),
                  gradientClass: storeStyle.cta,
              }

        return (
            <CrawlerCard
                key={`${crawler.store}-${crawler.category}`}
                storeLabel={storeLabel}
                badgeText={crawler.config?.category || 'Products'}
                categoryLabel={crawler.config?.name || crawler.category.replace('_', ' ')}
                crawlerIdLabel={currentStatus.crawler_id || undefined}
                statusLabel={isInactive ? 'Ready' : statusStyle.label}
                statusClassName={statusStyle.className}
                itemsFoundLabel={itemsFound}
                lastRunLabel={lastRunLabel}
                targetLabel={targetLabel}
                maxValue={limitConfig.max !== undefined ? String(limitConfig.max) : ''}
                disableSettings={isRunning}
                onMaxChange={(value) => setLimitFor(crawler.store, crawler.category, { max: value ? Number(value) : undefined })}
                onToggleCrawlAll={(checked) => setLimitFor(crawler.store, crawler.category, { crawlAll: checked })}
                onToggleHeadless={(checked) => setLimitFor(crawler.store, crawler.category, { headless: checked })}
                crawlAllChecked={!!limitConfig.crawlAll}
                headlessChecked={limitConfig.headless ?? false}
                helperText={isRunning ? 'Crawler active now' : isCompleted ? 'Last run completed' : 'Standing by'}
                gradientClass={storeStyle.gradient}
                hoverClass={storeStyle.hover}
                storeChipClass={storeStyle.chip}
                action={actionConfig}
            />
        )
    }

    const renderCompletedActivityRow = (activity: any, index: number) => {
        const isPseudo = activity._isPseudo || false
        const itemCount = activity.items_found || activity.count || activity.total_products || (activity.items ? activity.items.length : 0) || 0
        const completedTime = activity.timestamp ? new Date(activity.timestamp) : null
        const isRecent = completedTime && new Date().getTime() - completedTime.getTime() < 24 * 60 * 60 * 1000
        const resultKey = findResultKeyForActivity(activity)

        const handleView = () => {
            if (isPseudo) {
                viewFileContent(activity.store, activity.output_file)
                return
            }
            if (resultKey && crawlerResults[resultKey]) {
                setFileViewModal({
                    open: true,
                    store: activity.store,
                    filename: `${resultKey}_results.json`,
                    content: crawlerResults[resultKey],
                })
            }
        }

        const handleSendToClassifier = () => {
            if (isPseudo) {
                void loadFileAndSendToClassifier(activity.store, activity.output_file)
                return
            }
            if (resultKey && crawlerResults[resultKey]?.items) {
                void sendFileToClassifier(crawlerResults[resultKey].items)
            }
        }

        return (
            <div key={`${activity.store}-${activity.category}-${index}`} className='rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='min-w-0'>
                        <p className='truncate text-sm font-semibold capitalize text-slate-900'>{activity.store}</p>
                        <p className='truncate text-xs capitalize text-slate-500'>{activity.category?.replace('_', ' ') || '—'}</p>
                        {isRecent && (
                            <span className='mt-1 inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium text-blue-700 bg-blue-100'>
                                New
                            </span>
                        )}
                    </div>
                    <div className='flex flex-col items-end gap-1'>
                        <span className='inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-green-700'>
                            completed
                        </span>
                        {isPseudo && (
                            <span className='inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-[11px] font-semibold text-yellow-700'>
                                 File Only
                            </span>
                        )}
                    </div>
                </div>
                <div className='mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600'>
                    <div className='rounded-lg bg-slate-50 px-3 py-2'>
                        <p className='text-[11px] uppercase tracking-wide text-slate-500'>Items</p>
                        <p className='text-sm font-semibold text-slate-900'>{itemCount}</p>
                    </div>
                    <div className='rounded-lg bg-slate-50 px-3 py-2'>
                        <p className='text-[11px] uppercase tracking-wide text-slate-500'>Completed</p>
                        <p className='text-sm font-semibold text-slate-900'>{completedTime ? completedTime.toLocaleDateString() : 'Unknown'}</p>
                        {completedTime && <p className='text-[11px] text-slate-500'>{completedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                    </div>
                    <div className='col-span-2 rounded-lg bg-slate-50 px-3 py-2'>
                        <p className='text-[11px] uppercase tracking-wide text-slate-500'>Crawler ID</p>
                        <p className='truncate font-mono text-xs text-slate-500'>{activity.crawler_id || '—'}</p>
                    </div>
                </div>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <button
                        onClick={handleView}
                        className='inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700'
                    >
                        <Eye size={16} />
                        View
                    </button>
                    {itemCount > 0 && (
                        <button
                            onClick={handleSendToClassifier}
                            className='inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90'
                        >
                            <ArrowUp2 size={16} />
                            Classify
                        </button>
                    )}
                    <button
                        onClick={() => void removeRecentActivity(activity)}
                        className='inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100'
                    >
                        <Trash size={16} />
                        Remove
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className='space-y-6'>
            {scheduleSection}

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <div className='mb-3 flex items-center justify-between gap-2'>
                        <h3 className='flex items-center gap-2 text-base font-semibold text-slate-900'>
                            <Play size={16} className='text-primary' />
                            Launch by store
                        </h3>
                        <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                            {formatNumber(selectedStoreCount)} crawlers
                        </span>
                    </div>
                    <p className='mb-4 text-xs text-slate-500'>Start every crawler for a selected retailer using the current execution mode.</p>
                    <div className='flex flex-col gap-3 sm:flex-row'>
                        <select
                            value={selectedStoreLaunch}
                            onChange={(event) => setSelectedStoreLaunch(event.target.value)}
                            className='h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                            disabled={storeOptions.length === 0}
                        >
                            {storeOptions.map((store: string) => (
                                <option key={store} value={store}>
                                    {store.charAt(0).toUpperCase() + store.slice(1)}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => void handleStoreLaunch(selectedStoreLaunch)}
                            disabled={!selectedStoreLaunch || selectedStoreCount === 0 || groupLaunching === selectedStoreLaunch}
                            className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
                        >
                            <Play size={16} className={groupLaunching === selectedStoreLaunch ? 'animate-spin text-white/70' : 'text-white'} />
                            {groupLaunching === selectedStoreLaunch ? 'Launching…' : 'Launch store'}
                        </button>
                    </div>
                    {renderRunSettings('store', storeGroupConfig, {
                        onMaxChange: handleStoreGroupMaxChange,
                        onCrawlAllToggle: handleStoreGroupCrawlAllToggle,
                        onHeadlessToggle: handleStoreGroupHeadlessToggle,
                        disabled: !selectedStoreLaunch,
                        refs: { crawlAll: storeCrawlAllRef, headless: storeHeadlessRef },
                    })}
                </div>

                <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <div className='mb-3 flex items-center justify-between gap-2'>
                        <h3 className='flex items-center gap-2 text-base font-semibold text-slate-900'>
                            <Play size={16} className='text-primary' />
                            Launch by category
                        </h3>
                        <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                            {formatNumber(selectedCategoryCount)} crawlers
                        </span>
                    </div>
                    <p className='mb-4 text-xs text-slate-500'>Kick off the chosen assortment across every store that supports it.</p>
                    <div className='flex flex-col gap-3 sm:flex-row'>
                        <select
                            value={selectedCategoryLaunch}
                            onChange={(event) => setSelectedCategoryLaunch(event.target.value)}
                            className='h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm capitalize focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                            disabled={categoryOptions.length === 0}
                        >
                            {categoryOptions.map((category: string) => (
                                <option key={category} value={category}>
                                    {category.replace('_', ' ')}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => void handleCategoryLaunch(selectedCategoryLaunch)}
                            disabled={!selectedCategoryLaunch || selectedCategoryCount === 0 || categoryLaunching === selectedCategoryLaunch}
                            className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
                        >
                            <Play size={16} className={categoryLaunching === selectedCategoryLaunch ? 'animate-spin text-white/70' : 'text-white'} />
                            {categoryLaunching === selectedCategoryLaunch ? 'Launching…' : 'Launch category'}
                        </button>
                    </div>
                    {renderRunSettings('category', categoryGroupConfig, {
                        onMaxChange: handleCategoryGroupMaxChange,
                        onCrawlAllToggle: handleCategoryGroupCrawlAllToggle,
                        onHeadlessToggle: handleCategoryGroupHeadlessToggle,
                        disabled: !selectedCategoryLaunch,
                        refs: { crawlAll: categoryCrawlAllRef, headless: categoryHeadlessRef },
                    })}
                </div>
            </div>

            {activeEntries.length > 0 && (
                <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                        <h3 className='text-lg font-semibold text-slate-900'>Active Crawlers</h3>
                        <span className='text-xs font-medium text-slate-500'>{formatNumber(activeEntries.length)} running</span>
                    </div>
                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                        {activeEntries.map(([crawlerId, crawler]) => {
                            const storeStyle = getStoreStyle(crawler.store)
                            const statusStyle = getStatusStyle(crawler.status)
                            const limitConfig = getLimitFor(crawler.store, crawler.category)
                            const useAll = limitConfig.crawlAll ?? false
                            const resolvedMax = resolveMaxItems(limitConfig.max, useAll)
                            const target =
                                crawler.max_items ||
                                crawler.config?.max_items ||
                                crawler.config?.target_items ||
                                crawler.config?.items_limit ||
                                (crawler.progress && crawler.items_found
                                    ? Math.round((crawler.items_found / (crawler.progress || 1)) * 100)
                                    : resolvedMax || null)

                            let progressPercent = 0
                            if (typeof crawler.items_found === 'number' && target) {
                                progressPercent = Math.min(100, (crawler.items_found / target) * 100)
                            } else if (typeof crawler.progress === 'number') {
                                progressPercent = Math.max(0, Math.min(100, crawler.progress))
                            } else if (typeof crawler.items_found === 'number' && crawler.items_found > 0) {
                                const estimatedTarget = 100
                                progressPercent = Math.min(100, (crawler.items_found / estimatedTarget) * 100)
                            }

                            const startedAt = crawler.start_time ? new Date(crawler.start_time) : null
                            const targetLabel = useAll ? 'Target: Unlimited' : `Target: Max ${resolvedMax ?? DEFAULT_MAX_ITEMS}`

                            return (
                                <motion.div
                                    key={crawlerId}
                                    layout
                                    whileHover={{ y: -4, scale: 1.01 }}
                                    className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all duration-200 supports-[backdrop-filter]:bg-white/60 ${storeStyle.hover}`}
                                >
                                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${storeStyle.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

                                    <div className='relative flex items-start justify-between gap-3'>
                                        <div>
                                            <div className='flex items-center gap-2'>
                                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${storeStyle.chip}`}>
                                                    {crawler.store}
                                                </span>
                                                <span className='text-xs font-medium text-slate-500'>ID: {crawlerId}</span>
                                            </div>
                                            <h4 className='mt-3 text-base font-semibold text-slate-900 capitalize'>{crawler.category.replace('_', ' ')}</h4>
                                            {crawler.current_step && <p className='mt-1 text-xs font-medium text-slate-500'>{crawler.current_step}</p>}
                                        </div>
                                        <div className={`relative rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyle.className}`}>
                                            {statusStyle.label}
                                        </div>
                                    </div>

                                    <div className='relative mt-4 grid gap-3 sm:grid-cols-2'>
                                        <div className='rounded-xl border border-white/60 bg-white/90 p-3 shadow-inner shadow-slate-200/40'>
                                            <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500'>Items Found</p>
                                            <p className='mt-2 text-xl font-semibold text-slate-900'>
                                                {typeof crawler.items_found === 'number' ? formatNumber(crawler.items_found) : '—'}
                                                {typeof crawler.items_found === 'number' && target && (
                                                    <span className='ml-1 text-sm font-medium text-slate-400'>/ {formatNumber(target)}</span>
                                                )}
                                            </p>
                                        </div>
                                        <div className='rounded-xl border border-white/60 bg-white/90 p-3 shadow-inner shadow-slate-200/40'>
                                            <p className='text-[11px] font-semibold uppercase tracking-wide text-slate-500'>Progress</p>
                                            <div className='mt-3 flex items-center gap-3'>
                                                <div className='h-2 flex-1 rounded-full bg-slate-200/80'>
                                                    <motion.div initial={false} animate={{ width: `${progressPercent}%` }} className='h-2 rounded-full bg-primary' />
                                                </div>
                                                <span className='text-sm font-semibold text-slate-700'>{Math.round(progressPercent)}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className='relative mt-4 rounded-xl border border-dashed border-slate-200 bg-white/85 p-3'>
                                        <div className='flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-600'>
                                            <span className='text-slate-700'>Run settings</span>
                                            <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>{targetLabel}</span>
                                        </div>
                                        <div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600'>
                                            <input
                                                type='number'
                                                min={1}
                                                placeholder='Max items'
                                                value={limitConfig.max !== undefined ? String(limitConfig.max) : ''}
                                                onChange={(e) => {
                                                    const raw = e.target.value
                                                    const num = raw ? Math.max(1, Number(raw)) : undefined
                                                    setLimitFor(crawler.store, crawler.category, { max: num })
                                                }}
                                                disabled={crawler.status === 'running' || crawler.status === 'starting'}
                                                className='h-9 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100'
                                            />
                                            <label className='flex items-center gap-2 font-medium'>
                                                <input
                                                    type='checkbox'
                                                    checked={!!limitConfig.crawlAll}
                                                    onChange={(e) => setLimitFor(crawler.store, crawler.category, { crawlAll: e.target.checked })}
                                                    disabled={crawler.status === 'running' || crawler.status === 'starting'}
                                                    className='h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed'
                                                />
                                                Crawl all
                                            </label>
                                            <label className='flex items-center gap-2 font-medium'>
                                                <input
                                                    type='checkbox'
                                                    checked={limitConfig.headless ?? false}
                                                    onChange={(e) => setLimitFor(crawler.store, crawler.category, { headless: e.target.checked })}
                                                    disabled={crawler.status === 'running' || crawler.status === 'starting'}
                                                    className='h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed'
                                                />
                                                Headless
                                            </label>
                                        </div>
                                    </div>

                                    <div className='relative mt-4 flex flex-wrap items-center gap-3'>
                                        {crawler.status === 'running' ? (
                                            <button onClick={() => void handleStopCrawler(crawlerId)} className='flex-1 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md'>
                                                <Stop size={14} className='mr-1 inline' />
                                                Stop
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => void handleStartCrawler(crawler.store, crawler.category)}
                                                disabled={!crawlerStatus.available}
                                                className={`flex-1 rounded-lg bg-gradient-to-r ${storeStyle.cta} px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500`}
                                            >
                                                <Play size={14} className='mr-1 inline' />
                                                {crawler.status === 'completed' ? 'Restart' : 'Start'}
                                            </button>
                                        )}
                                        {startedAt && <span className='text-xs font-medium text-slate-500'>Started {startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                                    </div>
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            )}

            <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                <div className='mb-4 flex items-center justify-between gap-3'>
                    <h3 className='flex items-center gap-2 text-lg font-semibold text-slate-900'>
                        <span className='inline-block h-3 w-3 rounded-full bg-blue-500'></span>
                        Keells Crawlers
                    </h3>
                    <span className='text-xs font-medium text-slate-500'>{formatNumber(keellsCrawlers.length)} configured</span>
                </div>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                    {keellsCrawlers.map(crawler => renderCrawlerCard(crawler, 'Keells'))}
                </div>
            </div>

            <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                <div className='mb-4 flex items-center justify-between gap-3'>
                    <h3 className='flex items-center gap-2 text-lg font-semibold text-slate-900'>
                        <span className='inline-block h-3 w-3 rounded-full bg-orange-500'></span>
                        Cargills Crawlers
                    </h3>
                    <span className='text-xs font-medium text-slate-500'>{formatNumber(cargillsCrawlers.length)} configured</span>
                </div>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                    {cargillsCrawlers.map(crawler => renderCrawlerCard(crawler, 'Cargills'))}
                </div>
            </div>

            {completedActivities.length > 0 && (
                <div className='space-y-4 rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                        <div className='flex items-center gap-3'>
                            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-sm'>
                                <Activity size={20} />
                            </div>
                            <div>
                                <h3 className='text-lg font-semibold text-slate-900'>Crawler Results ({formatNumber(completedActivities.length)})</h3>
                                <p className='text-sm text-slate-500'>Latest completed runs with preserved telemetry</p>
                            </div>
                        </div>
                        <button onClick={() => void clearRecentActivity()} className='inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100'>
                            <Trash size={16} />
                            Clear All
                        </button>
                    </div>

                    <div className='hidden overflow-hidden rounded-xl border border-slate-200 bg-white lg:block'>
                        <div className='overflow-x-auto'>
                            <table className='w-full text-sm'>
                                <thead className='bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500'>
                                    <tr>
                                        <th className='px-6 py-3 text-left'>Store / Category</th>
                                        <th className='px-6 py-3 text-left'>Status</th>
                                        <th className='px-6 py-3 text-left'>Items Found</th>
                                        <th className='px-6 py-3 text-left'>Completed</th>
                                        <th className='px-6 py-3 text-left'>Crawler ID</th>
                                        <th className='px-6 py-3 text-right'>Actions</th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-200 bg-white'>
                                    {completedActivities.slice(0, 50).map((activity, index) => {
                                        const isPseudo = activity._isPseudo || false
                                        const itemCount = activity.items_found || activity.count || activity.total_products || (activity.items ? activity.items.length : 0) || 0
                                        const completedTime = activity.timestamp ? new Date(activity.timestamp) : null
                                        const isRecent = completedTime && new Date().getTime() - completedTime.getTime() < 24 * 60 * 60 * 1000
                                        const resultKey = findResultKeyForActivity(activity)

                                        return (
                                            <tr key={`${activity.store}-${activity.category}-${index}`} className='transition-colors hover:bg-slate-50'>
                                                <td className='whitespace-nowrap px-6 py-4'>
                                                    <div className='flex items-center space-x-3'>
                                                        <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-purple-100'>
                                                            <DocumentText1 size={18} className='text-blue-600' />
                                                        </div>
                                                        <div>
                                                            <div className='flex items-center gap-2'>
                                                                <span className='text-sm font-semibold capitalize text-slate-900'>{activity.store}</span>
                                                                <span className='text-slate-300'>-</span>
                                                                <span className='text-sm capitalize text-slate-600'>{activity.category?.replace('_', ' ')}</span>
                                                            </div>
                                                            {isRecent && (
                                                                <span className='mt-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100'>
                                                                    New
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className='whitespace-nowrap px-6 py-4'>
                                                    <div className='flex flex-col gap-1'>
                                                        <span className='inline-flex w-fit items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700'>completed</span>
                                                        {isPseudo && (
                                                            <span className='inline-flex w-fit items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700'> File Only</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className='whitespace-nowrap px-6 py-4'>
                                                    <div className='text-sm font-semibold text-slate-900'>{itemCount}</div>
                                                </td>
                                                <td className='whitespace-nowrap px-6 py-4'>
                                                    <div className='text-sm text-slate-700'>
                                                        {completedTime ? (
                                                            <>
                                                                <div>{completedTime.toLocaleDateString()}</div>
                                                                <div className='text-xs text-slate-500'>
                                                                    {completedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            'Unknown'
                                                        )}
                                                    </div>
                                                </td>
                                                <td className='px-6 py-4'>
                                                    <div className='max-w-xs truncate text-xs font-mono text-slate-500' title={activity.crawler_id}>
                                                        {activity.crawler_id}
                                                    </div>
                                                </td>
                                                <td className='whitespace-nowrap px-6 py-4 text-right'>
                                                    <div className='flex items-center justify-end gap-2'>
                                                        <button
                                                            onClick={() => {
                                                                if (isPseudo) {
                                                                    viewFileContent(activity.store, activity.output_file)
                                                                } else if (resultKey && crawlerResults[resultKey]) {
                                                                    setFileViewModal({
                                                                        open: true,
                                                                        store: activity.store,
                                                                        filename: `${resultKey}_results.json`,
                                                                        content: crawlerResults[resultKey],
                                                                    })
                                                                }
                                                            }}
                                                            className='rounded-lg p-2 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600'
                                                            title='View'
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        {itemCount > 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    if (isPseudo) {
                                                                        void loadFileAndSendToClassifier(activity.store, activity.output_file)
                                                                    } else if (resultKey && crawlerResults[resultKey]?.items) {
                                                                        void sendFileToClassifier(crawlerResults[resultKey].items)
                                                                    }
                                                                }}
                                                                className='flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90'
                                                                title='Send to Classifier'
                                                            >
                                                                <ArrowUp2 size={16} />
                                                                <span>Send to Classifier</span>
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={async (e) => {
                                                                e.stopPropagation()
                                                                await removeRecentActivity(activity)
                                                            }}
                                                            className='rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500'
                                                            title='Remove from recent activities'
                                                        >
                                                            <Trash size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className='space-y-3 lg:hidden'>{completedActivities.slice(0, 50).map(renderCompletedActivityRow)}</div>

                    {completedActivities.length > 50 && <p className='text-center text-sm text-slate-500'>Showing 50 of {formatNumber(completedActivities.length)} total results</p>}
                </div>
            )}

            {otherActivities.length > 0 && (
                <div className='space-y-4 rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                        <div className='flex items-center gap-3'>
                            <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-sm'>
                                <Activity size={20} />
                            </div>
                            <div>
                                <h3 className='text-lg font-semibold text-slate-900'>Other Recent Activity</h3>
                                <p className='text-sm text-slate-500'>Running and failed crawler activities</p>
                            </div>
                        </div>
                        <button onClick={() => void clearRecentActivity()} className='inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-100'>
                            <Trash size={16} />
                            Clear All
                        </button>
                    </div>

                    <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
                        {otherActivities.map((activity, index) => {
                            const itemCount = activity.items_found || activity.count || activity.total_products || (activity.items ? activity.items.length : 0) || 0
                            const activityTime = activity.timestamp ? new Date(activity.timestamp) : null
                            const isRecent = activityTime && new Date().getTime() - activityTime.getTime() < 24 * 60 * 60 * 1000

                            return (
                                <div key={`${activity.store}-${activity.category}-${index}`} className='group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg supports-[backdrop-filter]:bg-white/60'>
                                    <div className='pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-b from-orange-50/60 via-transparent to-red-50/50' />

                                    <div className='mb-4 flex items-start justify-between gap-3'>
                                        <div className='flex-1'>
                                            <div className='mb-1 flex items-center gap-2'>
                                                <h4 className='text-base font-semibold capitalize text-slate-900'>{activity.store}</h4>
                                                <span className='text-slate-300'>•</span>
                                                <span className='text-sm capitalize text-slate-600'>{activity.category?.replace('_', ' ')}</span>
                                            </div>
                                            <p className='font-mono text-xs text-slate-500'>{activity.crawler_id}</p>
                                        </div>

                                        <div className='flex items-center gap-2'>
                                            <div
                                                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                                                    activity.status === 'running'
                                                        ? 'border-green-200 bg-green-100 text-green-700'
                                                        : activity.status === 'error'
                                                        ? 'border-red-200 bg-red-100 text-red-700'
                                                        : activity.status === 'starting'
                                                        ? 'border-blue-200 bg-blue-100 text-blue-700'
                                                        : 'border-slate-200 bg-slate-100 text-slate-700'
                                                }`}
                                            >
                                                {activity.status === 'running'
                                                    ? ' Running'
                                                    : activity.status === 'error'
                                                    ? '❌ Error'
                                                    : activity.status === 'starting'
                                                    ? '⏳ Starting'
                                                    : activity.status}
                                            </div>
                                            {isRecent && <div className='rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700'>New</div>}
                                        </div>
                                    </div>

                                    <div className='mb-4 grid grid-cols-2 gap-4'>
                                        <div className='rounded-xl bg-slate-50 p-3'>
                                            <div className='flex items-center gap-2'>
                                                <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100'>
                                                    <DocumentText1 size={16} className='text-orange-600' />
                                                </div>
                                                <div>
                                                    <p className='text-xs text-slate-500'>Items Found</p>
                                                    <p className='text-lg font-semibold text-slate-900'>{itemCount}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className='rounded-xl bg-slate-50 p-3'>
                                            <div className='flex items-center gap-2'>
                                                <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100'>
                                                    <DocumentText1 size={16} className='text-slate-600' />
                                                </div>
                                                <div>
                                                    <p className='text-xs text-slate-500'>Started</p>
                                                    <p className='text-xs font-medium text-slate-800'>{activityTime ? activityTime.toLocaleDateString() : 'Unknown'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className='flex gap-2'>
                                        {activity.status === 'error' && (
                                            <button
                                                onClick={() => void handleStartCrawler(activity.store, activity.category)}
                                                disabled={!crawlerStatus.available}
                                                className='flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-60'
                                            >
                                                <Play size={16} />
                                                Retry
                                            </button>
                                        )}

                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation()
                                                await removeRecentActivity(activity)
                                            }}
                                            className='rounded-lg p-2.5 text-slate-400 transition-colors hover:bg-slate-100/80 hover:text-slate-600'
                                            title='Remove this activity from history'
                                        >
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

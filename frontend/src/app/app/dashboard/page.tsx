"use client"

import { useCentralStore } from '@/Store'
import PageNavbar, { PageNavbarIconButton, PageNavbarLeftContent, PageNavbarPrimaryButton, PageNavbarRightContent } from '@/components/layout/PageNavbar'
import { Add, CalendarEdit, DirectNotification, SearchNormal1, DocumentUpload, Data, Activity, Cpu } from 'iconsax-react'
import PageContent from '@/components/layout/PageContent'
import RecentClassifications from '@/components/Cards/RecentClassifications'
import AIModelPerformance from '@/components/Cards/AIModelPerformance'
import CacheInsights from '@/components/Cards/CacheInsights'
import QuickActions from '@/components/Cards/QuickActions'
import SystemHealth from '@/components/Cards/SystemHealth'
import ProcessingQueue from '@/components/Cards/ProcessingQueue'
import CrawlerActivity from '@/components/Cards/CrawlerActivity'
import TimeTracker from '@/components/Cards/TimeTracker'
import Notes from '@/components/Cards/Notes'
import ResourceMonitor from '@/components/Cards/ResourceMonitor'
import { OutlineButton } from '@/components/ui/Button'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { crawlerAPI } from '@/lib/api'
import { SupermarketDistributionCard, CategoryDistributionCard, TopBrandsCard } from '@/components/Cards/ProductDistributionCards'
import { useDashboardData } from '@/hooks/useDashboardData'
import AutomationScheduleRail from '@/components/crawler/AutomationScheduleRail'
import type { CrawlerSchedule } from '@/types/crawler'
import { PageHero } from '@/components/shared/PageHero'
import { PageHeader } from '@/components/layout/PageHeader'
import { Home2 } from 'iconsax-react'

function Dashboard() {
    const { 
        outputData, 
        cacheStatus, 
        crawlerStatus, 
        processingStats,
        isProcessing,
        setCacheStatus,
        setCrawlerStatus
    } = useCentralStore()

    const [automationSchedules, setAutomationSchedules] = useState<CrawlerSchedule[]>([])
    const [automationLoading, setAutomationLoading] = useState(true)
    const [automationError, setAutomationError] = useState<string | null>(null)
    const [automationLastUpdated, setAutomationLastUpdated] = useState<string | null>(null)

    // Fetch all dashboard data in parallel
    const { pricingStats, cacheStatus: fetchedCache, crawlerStatus: fetchedCrawler, loading: dashboardLoading, refresh } = useDashboardData()

    // Update store with fetched data
    useEffect(() => {
        if (fetchedCache) {
            setCacheStatus(fetchedCache)
        }
    }, [fetchedCache, setCacheStatus])

    useEffect(() => {
        if (fetchedCrawler) {
            setCrawlerStatus({
                activeCrawlers: fetchedCrawler.active_crawlers || 0,
                productsScraped: crawlerStatus.productsScraped,
                successRate: crawlerStatus.successRate,
                lastRun: crawlerStatus.lastRun
            })
        }
    }, [fetchedCrawler, setCrawlerStatus])

    useEffect(() => {
        let cancelled = false

        const fetchSchedules = async () => {
            setAutomationLoading(true)
            try {
                const response = await crawlerAPI.listSchedules()
                if (!cancelled) {
                    setAutomationSchedules(response?.schedules ?? [])
                    setAutomationError(null)
                    setAutomationLastUpdated(new Date().toISOString())
                }
            } catch (error) {
                console.error('Failed to fetch automation schedules:', error)
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : 'Unable to load schedules'
                    setAutomationError(message)
                }
            } finally {
                if (!cancelled) {
                    setAutomationLoading(false)
                }
            }
        }

        void fetchSchedules()
        const interval = setInterval(fetchSchedules, 60_000)

        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [])

    const automationSummary = useMemo(() => {
        if (automationSchedules.length === 0) {
            return { enabled: 0, total: 0, nextLabel: null as string | null, nextRun: null as string | null }
        }
        const enabled = automationSchedules.filter(schedule => schedule.enabled)
        const sortedByNext = [...enabled].sort((a, b) => {
            const aTime = a.next_run ? Date.parse(a.next_run) : Number.MAX_SAFE_INTEGER
            const bTime = b.next_run ? Date.parse(b.next_run) : Number.MAX_SAFE_INTEGER
            return aTime - bTime
        })
        const nextSchedule = sortedByNext[0]
        return {
            enabled: enabled.length,
            total: automationSchedules.length,
            nextLabel: nextSchedule?.label ?? null,
            nextRun: nextSchedule?.next_run ?? null
        }
    }, [automationSchedules])

    const describeNextRun = (iso: string | null) => {
        if (!iso) return 'No upcoming run scheduled'
        const date = new Date(iso)
        if (Number.isNaN(date.getTime())) return 'Next run pending'
        const diff = date.getTime() - Date.now()
        const abs = Math.abs(diff)
        const hours = Math.floor(abs / 3_600_000)
        const minutes = Math.max(1, Math.floor((abs % 3_600_000) / 60_000))
        const relativeParts = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
        return diff >= 0
            ? `${date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • in ${relativeParts}`
            : `${date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • ${relativeParts} ago`
    }

    const lastAutomationUpdateLabel = automationLastUpdated
        ? `Last updated ${new Date(automationLastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'Waiting for scheduler data'

    return (
        <div>
            <PageHeader 
                title="Dashboard" 
                subtitle="Overview of system performance" 
                icon={Home2}
                onRefresh={refresh} 
                refreshing={dashboardLoading} 
            />

            <PageContent>

                <PageHero
                    title="Dashboard"
                    description="Overview of system performance and statistics"
                    stats={[
                        {
                            label: "Total Classifications",
                            value: outputData.length.toLocaleString(),
                            icon: DocumentUpload,
                            color: "blue",
                            subtext: "All time products processed"
                        },
                        {
                            label: "Cache Performance",
                            value: `${cacheStatus?.hitRate !== undefined ? cacheStatus.hitRate.toFixed(1) : '0.0'}%`,
                            icon: Data,
                            color: "green",
                            subtext: `${cacheStatus?.size || 0} cached items`
                        },
                        {
                            label: "Active Crawlers",
                            value: crawlerStatus.activeCrawlers,
                            icon: Activity,
                            color: "orange",
                            subtext: `${crawlerStatus.productsScraped.toLocaleString()} products scraped`
                        },
                        {
                            label: "AI Success Rate",
                            value: `${processingStats.successful + processingStats.failed > 0 
                                ? Math.round((processingStats.successful / (processingStats.successful + processingStats.failed)) * 100)
                                : 100}%`,
                            icon: Cpu,
                            color: "violet",
                            subtext: isProcessing ? 'Processing active' : 'System ready'
                        }
                    ]}
                />

                {/* Automation Pulse */}
                <div className='mb-6'>
                    <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
                        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                            <div className='flex items-start gap-3'>
                                <span className='inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
                                    <CalendarEdit size={22} />
                                </span>
                                <div>
                                    <p className='text-xs font-semibold uppercase tracking-[0.25em] text-slate-500'>Automation pulse</p>
                                    <h3 className='text-lg font-semibold text-slate-900'>Crawler schedules on deck</h3>
                                    <p className='text-sm text-slate-500'>Monitor upcoming batches and jump into the automation hub when needed.</p>
                                </div>
                            </div>
                            <div className='flex flex-wrap gap-6 text-sm'>
                                <div>
                                    <p className='text-xs uppercase text-slate-500'>Active schedules</p>
                                    <p className='text-2xl font-semibold text-slate-900'>{automationSummary.enabled}</p>
                                    <p className='text-xs text-slate-500'>of {automationSummary.total} total</p>
                                </div>
                                <div>
                                    <p className='text-xs uppercase text-slate-500'>Next trigger</p>
                                    <p className='text-sm font-semibold text-slate-900'>
                                        {automationSummary.nextLabel || 'No label yet'}
                                    </p>
                                    <p className='text-xs text-slate-500'>{describeNextRun(automationSummary.nextRun)}</p>
                                </div>
                            </div>
                        </div>

                        {automationError ? (
                            <div className='mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'>
                                {automationError}
                            </div>
                        ) : (
                            <div className='mt-4'>
                                <AutomationScheduleRail
                                    schedules={automationSchedules}
                                    loading={automationLoading}
                                    variant='compact'
                                    emptyMessage='No automation schedules yet. Visit the crawler hub to add one.'
                                />
                            </div>
                        )}

                        <div className='mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500'>
                            <p>
                                {automationLoading ? 'Syncing with scheduler…' : lastAutomationUpdateLabel}
                            </p>
                            <Link href='/app/crawler'>
                                <button className='inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 transition hover:border-primary/40 hover:text-primary'>
                                    Open automation hub
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Product Distribution Section - Top Priority */}
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6'>
                    <SupermarketDistributionCard stats={pricingStats} loading={dashboardLoading} />
                    <CategoryDistributionCard stats={pricingStats} loading={dashboardLoading} />
                    <TopBrandsCard stats={pricingStats} loading={dashboardLoading} />
                </div>

                {/* Top Priority Cards Row */}
                <div className='grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6'>
                    <QuickActions />
                    <ResourceMonitor />
                    <TimeTracker />
                    <Notes />
                </div>

                {/* Secondary Cards - Lower Priority */}
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6'>
                    {/* First Column */}
                    <div className='space-y-6'>
                        <SystemHealth />
                        <CacheInsights />
                        <CrawlerActivity />
                    </div>

                    {/* Second Column */}
                    <div className='space-y-6'>
                        <RecentClassifications />
                        <ProcessingQueue />
                    </div>

                    {/* Third Column */}
                    <div className='space-y-6'>
                        <AIModelPerformance />
                    </div>
                </div>

            </PageContent>

        </div>
    )
}

export default Dashboard
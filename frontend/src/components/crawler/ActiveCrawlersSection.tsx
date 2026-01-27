import { motion } from 'framer-motion';
import { Play, Stop } from 'iconsax-react';
import { formatNumber } from '@/utils/format';
import { CrawlerInfo, CrawlerStatus } from '@/types/crawler';
import { DEFAULT_MAX_ITEMS } from '@/app/app/crawler/constants';

interface ActiveCrawlersSectionProps {
    activeEntries: [string, CrawlerInfo][];
    getStoreStyle: (store: string) => any;
    getStatusStyle: (status: string) => any;
    globalCrawlAll: boolean;
    globalHeadlessMode: boolean;
    getLimitFor: (store: string, category: string) => any;
    setLimitFor: (store: string, category: string, updates: any) => void;
    resolveMaxItems: (max: any, crawlAll: any) => number | undefined;
    handleStopCrawler: (id: string) => void;
    handleStartCrawler: (store: string, category: string) => void;
    crawlerStatus: CrawlerStatus;
}

const ActiveCrawlersSection = ({
    activeEntries,
    getStoreStyle,
    getStatusStyle,
    globalCrawlAll,
    globalHeadlessMode,
    getLimitFor,
    setLimitFor,
    resolveMaxItems,
    handleStopCrawler,
    handleStartCrawler,
    crawlerStatus
}: ActiveCrawlersSectionProps) => {
    if (activeEntries.length === 0) return null;

    return (
        <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                <h3 className='text-lg font-semibold text-slate-900'>Active Crawlers</h3>
                <span className='text-xs font-medium text-slate-500'>{formatNumber(activeEntries.length)} running</span>
            </div>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                {activeEntries.map(([crawlerId, crawler]) => {
                    const storeStyle = getStoreStyle(crawler.store);
                    const statusStyle = getStatusStyle(crawler.status);
                    const rawTarget = crawler.max_items ||
                        crawler.config?.max_items ||
                        crawler.config?.target_items ||
                        crawler.config?.items_limit ||
                        (crawler.progress && crawler.items_found
                            ? Math.round(crawler.items_found / (crawler.progress / 100))
                            : null);
                    const target = typeof rawTarget === 'number' && !Number.isNaN(rawTarget) && rawTarget > 0 ? rawTarget : null;

                    let progressPercent = 0;
                    if (typeof crawler.items_found === 'number' && target) {
                        progressPercent = Math.min(100, (crawler.items_found / target) * 100);
                    } else if (typeof crawler.progress === 'number') {
                        progressPercent = Math.max(0, Math.min(100, crawler.progress));
                    } else if (typeof crawler.items_found === 'number' && crawler.items_found > 0) {
                        const estimatedTarget = 100;
                        progressPercent = Math.min(100, (crawler.items_found / estimatedTarget) * 100);
                    }

                    const startedAt = crawler.start_time ? new Date(crawler.start_time) : null;
                    const limitConfig = getLimitFor(crawler.store, crawler.category);
                    const targetLabel = (() => {
                        const useAll = limitConfig.crawlAll ?? globalCrawlAll;
                        if (useAll) return 'Target: Unlimited';
                        const max = resolveMaxItems(limitConfig.max, useAll) ?? DEFAULT_MAX_ITEMS;
                        return `Target: Max ${max}`;
                    })();

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
                                    <h4 className='mt-3 text-base font-semibold text-slate-900 capitalize'>
                                        {crawler.category.replace('_', ' ')}
                                    </h4>
                                    {crawler.current_step && (
                                        <p className='mt-1 text-xs font-medium text-slate-500'>{crawler.current_step}</p>
                                    )}
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
                                            <motion.div
                                                initial={false}
                                                animate={{ width: `${progressPercent}%` }}
                                                className='h-2 rounded-full bg-primary'
                                            />
                                        </div>
                                        <span className='text-sm font-semibold text-slate-700'>{Math.round(progressPercent)}%</span>
                                    </div>
                                </div>
                            </div>

                            <div className='relative mt-4 rounded-xl border border-dashed border-slate-200 bg-white/85 p-3'>
                                <div className='flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-600'>
                                    <span className='text-slate-700'>Run settings</span>
                                    <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                                        {targetLabel}
                                    </span>
                                </div>
                                <div className='mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600'>
                                    <input
                                        type='number'
                                        min={1}
                                        placeholder='Max items'
                                        value={limitConfig.max !== undefined ? String(limitConfig.max) : ''}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            const num = raw ? Math.max(1, Number(raw)) : undefined;
                                            setLimitFor(crawler.store, crawler.category, { max: num });
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
                                    <label className='flex items-center gap-2 font-medium' title='Run without showing browser window (faster)'>
                                        <input
                                            type='checkbox'
                                            checked={limitConfig.headless ?? globalHeadlessMode}
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
                                    <button
                                        onClick={() => handleStopCrawler(crawlerId)}
                                        className='flex-1 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md'
                                    >
                                        <Stop size={14} className='mr-1 inline' />
                                        Stop
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleStartCrawler(crawler.store, crawler.category)}
                                        disabled={!crawlerStatus.available}
                                        className={`flex-1 rounded-lg bg-gradient-to-r ${storeStyle.cta} px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500`}
                                    >
                                        <Play size={14} className='mr-1 inline' />
                                        {crawler.status === 'completed' ? 'Restart' : 'Start'}
                                    </button>
                                )}
                                {startedAt && (
                                    <span className='text-xs font-medium text-slate-500'>
                                        Started {startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

export default ActiveCrawlersSection;

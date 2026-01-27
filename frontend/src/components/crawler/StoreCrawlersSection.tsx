import CrawlerCard from '@/components/crawler/CrawlerCard';
import { formatNumber } from '@/utils/format';
import { CrawlerInfo, CrawlerStatus } from '@/types/crawler';
import { DEFAULT_MAX_ITEMS } from '@/app/app/crawler/constants';

interface StoreCrawlersSectionProps {
    storeName: string;
    crawlers: CrawlerInfo[];
    getCrawlerDisplayStatus: (store: string, category: string) => any;
    getStoreStyle: (store: string) => any;
    getStatusStyle: (status: string) => any;
    getLimitFor: (store: string, category: string) => any;
    setLimitFor: (store: string, category: string, updates: any) => void;
    globalCrawlAll: boolean;
    globalHeadlessMode: boolean;
    resolveMaxItems: (max: any, crawlAll: any) => number | undefined;
    handleStopCrawler: (id: string) => void;
    handleStartCrawler: (store: string, category: string) => void;
    crawlerStatus: CrawlerStatus;
}

const StoreCrawlersSection = ({
    storeName,
    crawlers,
    getCrawlerDisplayStatus,
    getStoreStyle,
    getStatusStyle,
    getLimitFor,
    setLimitFor,
    globalCrawlAll,
    globalHeadlessMode,
    resolveMaxItems,
    handleStopCrawler,
    handleStartCrawler,
    crawlerStatus
}: StoreCrawlersSectionProps) => {
    if (crawlers.length === 0) return null;

    return (
        <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
            <div className='mb-4 flex items-center justify-between gap-3'>
                <h3 className='flex items-center gap-2 text-lg font-semibold text-slate-900'>
                    <span className={`inline-block h-3 w-3 rounded-full ${storeName.toLowerCase() === 'keells' ? 'bg-blue-500' : 'bg-orange-500'}`}></span>
                    {storeName} Crawlers
                </h3>
                <span className='text-xs font-medium text-slate-500'>{formatNumber(crawlers.length)} configured</span>
            </div>
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
                {crawlers.map((crawler) => {
                    const currentStatus = getCrawlerDisplayStatus(crawler.store, crawler.category);
                    const isRunning = currentStatus.status === 'running' || currentStatus.status === 'starting';
                    const isCompleted = currentStatus.status === 'completed';
                    const isInactive = currentStatus.status === 'inactive';
                    const storeStyle = getStoreStyle(crawler.store);
                    const statusStyle = getStatusStyle(isInactive ? 'inactive' : currentStatus.status);
                    const limitConfig = getLimitFor(crawler.store, crawler.category);
                    const targetLabel = (() => {
                        const useAll = limitConfig.crawlAll ?? globalCrawlAll;
                        if (useAll) return 'Target: Unlimited';
                        const max = resolveMaxItems(limitConfig.max, useAll) ?? (crawler.config?.max_items ?? DEFAULT_MAX_ITEMS);
                        return `Target: Max ${max}`;
                    })();
                    const itemsFound = typeof currentStatus.items_found === 'number' ? formatNumber(currentStatus.items_found) : '—';
                    const completedAt = currentStatus.timestamp ? new Date(currentStatus.timestamp) : null;
                    const lastRunLabel = completedAt
                        ? `${completedAt.toLocaleDateString()} • ${completedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'No recent runs';

                    const actionConfig = isRunning
                        ? {
                            mode: 'stop' as const,
                            label: 'Stop',
                            disabled: !currentStatus.crawler_id,
                            onClick: () => {
                                if (currentStatus.crawler_id) {
                                    handleStopCrawler(currentStatus.crawler_id);
                                }
                            }
                        }
                        : {
                            mode: 'start' as const,
                            label: isCompleted ? 'Restart' : 'Start',
                            disabled: !crawlerStatus.available,
                            onClick: () => handleStartCrawler(crawler.store, crawler.category),
                            gradientClass: storeStyle.cta
                        };

                    return (
                        <CrawlerCard
                            key={`${crawler.store}-${crawler.category}`}
                            storeLabel={storeName}
                            badgeText={crawler.config?.category || 'Products'}
                            categoryLabel={crawler.config?.name || crawler.category.replace('_', ' ')}
                            crawlerIdLabel={currentStatus.crawler_id || undefined}
                            statusLabel={statusStyle.label}
                            statusClassName={statusStyle.className}
                            itemsFoundLabel={itemsFound}
                            lastRunLabel={lastRunLabel}
                            targetLabel={targetLabel}
                            maxValue={limitConfig.max !== undefined ? String(limitConfig.max) : ''}
                            maxPlaceholder='Default 50'
                            disableSettings={isRunning}
                            onMaxChange={(val) => setLimitFor(crawler.store, crawler.category, { max: val })}
                            onToggleCrawlAll={(checked) => setLimitFor(crawler.store, crawler.category, { crawlAll: checked })}
                            onToggleHeadless={(checked) => setLimitFor(crawler.store, crawler.category, { headless: checked })}
                            crawlAllChecked={!!limitConfig.crawlAll}
                            headlessChecked={limitConfig.headless ?? globalHeadlessMode}
                            helperText='Run settings'
                            gradientClass={storeStyle.gradient}
                            hoverClass={storeStyle.hover}
                            storeChipClass={storeStyle.chip}
                            action={actionConfig}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export default StoreCrawlersSection;

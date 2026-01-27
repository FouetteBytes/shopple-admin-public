import React from 'react';
import { Trash, Eye, ArrowUp2 } from 'iconsax-react';

interface ResultsTabProps {
    crawlerResults: Record<string, any>;
    loading: boolean;
    resultsFilter: {
        store: string;
        category: string;
        minItems: string;
        maxItems: string;
        dateFrom: string;
        dateTo: string;
    };
    setResultsFilter: (filter: any) => void;
    uniqueStores: string[];
    getUniqueCategories: (store?: string) => string[];
    onClearAllResults: () => void;
    onRefresh: () => void;
    refreshing: boolean;
    onViewResult: (store: string, resultId: string, result: any, isPseudo: boolean) => void;
    onSendToClassifier: (store: string, resultId: string, result: any, isPseudo: boolean) => void;
    onDeleteResult: (store: string, category: string, resultId: string, completedAt: string) => void;
}

const ResultsTab = ({
    crawlerResults,
    loading,
    resultsFilter,
    setResultsFilter,
    uniqueStores,
    getUniqueCategories,
    onClearAllResults,
    onRefresh,
    refreshing,
    onViewResult,
    onSendToClassifier,
    onDeleteResult
}: ResultsTabProps) => {
    const resultsArray = Object.entries(crawlerResults);

    const passesFilters = (resultId: string, result: any) => {
        const [store, category] = resultId.split('_');
        const itemsFound = result.items_found || result.count || result.total_products || 0;
        const timestamp = new Date(result.completed_at || result.timestamp || 0);

        if (resultsFilter.store && !store.toLowerCase().includes(resultsFilter.store.toLowerCase())) {
            return false;
        }

        if (resultsFilter.category && !category.toLowerCase().includes(resultsFilter.category.toLowerCase())) {
            return false;
        }

        if (resultsFilter.minItems && itemsFound < parseInt(resultsFilter.minItems)) {
            return false;
        }

        if (resultsFilter.maxItems && itemsFound > parseInt(resultsFilter.maxItems)) {
            return false;
        }

        if (resultsFilter.dateFrom && timestamp < new Date(resultsFilter.dateFrom)) {
            return false;
        }

        if (resultsFilter.dateTo && timestamp > new Date(resultsFilter.dateTo)) {
            return false;
        }

        return true;
    };

    const filteredResults = resultsArray.filter(([resultId, result]) => passesFilters(resultId, result));
    const sortedResults = filteredResults.sort(([, a], [, b]) => {
        const timeA = new Date(a.completed_at || a.timestamp || 0).getTime();
        const timeB = new Date(b.completed_at || b.timestamp || 0).getTime();
        return timeB - timeA;
    });

    const showSkeleton = loading && resultsArray.length === 0;

    const formatDuration = (value: any) => {
        if (value === undefined || value === null) return '—';
        if (typeof value === 'string') return value;
        const totalSeconds = Number(value);
        if (Number.isNaN(totalSeconds)) return '—';
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.max(0, Math.round(totalSeconds % 60));
        if (minutes <= 0) return `${seconds}s`;
        return `${minutes}m ${seconds}s`;
    };

    const formatTimestamp = (value?: string) => {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return {
            date: date.toLocaleDateString(),
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    };

    const statusStyles: Record<string, string> = {
        completed: 'bg-green-100 text-green-700 border border-green-200',
        running: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
        failed: 'bg-red-100 text-red-700 border border-red-200',
        error: 'bg-red-100 text-red-700 border border-red-200'
    };

    return (
        <div className='space-y-6'>
            <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                <h4 className='mb-3 text-sm font-semibold text-slate-900'>Filter Results</h4>
                <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
                    <select
                        value={resultsFilter.store}
                        onChange={(e) => setResultsFilter({ ...resultsFilter, store: e.target.value, category: '' })}
                        className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    >
                        <option value=''>All Stores</option>
                        {uniqueStores.map(store => (
                            <option key={store} value={store}>{store.charAt(0).toUpperCase() + store.slice(1)}</option>
                        ))}
                    </select>
                    <select
                        value={resultsFilter.category}
                        onChange={(e) => setResultsFilter({ ...resultsFilter, category: e.target.value })}
                        className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    >
                        <option value=''>All Categories</option>
                        {getUniqueCategories(resultsFilter.store).map(category => (
                            <option key={category} value={category}>
                                {category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </option>
                        ))}
                    </select>
                    <input
                        type='number'
                        placeholder='Min Items'
                        value={resultsFilter.minItems}
                        onChange={(e) => setResultsFilter({ ...resultsFilter, minItems: e.target.value })}
                        className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    />
                    <input
                        type='number'
                        placeholder='Max Items'
                        value={resultsFilter.maxItems}
                        onChange={(e) => setResultsFilter({ ...resultsFilter, maxItems: e.target.value })}
                        className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    />
                    <input
                        type='date'
                        placeholder='From Date'
                        value={resultsFilter.dateFrom}
                        onChange={(e) => setResultsFilter({ ...resultsFilter, dateFrom: e.target.value })}
                        className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    />
                    <input
                        type='date'
                        placeholder='To Date'
                        value={resultsFilter.dateTo}
                        onChange={(e) => setResultsFilter({ ...resultsFilter, dateTo: e.target.value })}
                        className='rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40'
                    />
                </div>
                {(resultsFilter.store || resultsFilter.category || resultsFilter.minItems || resultsFilter.maxItems || resultsFilter.dateFrom || resultsFilter.dateTo) && (
                    <button
                        onClick={() => setResultsFilter({ store: '', category: '', minItems: '', maxItems: '', dateFrom: '', dateTo: '' })}
                        className='mt-3 text-xs font-semibold text-primary hover:underline'
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <h3 className='text-lg font-semibold text-slate-900'>Crawler Results</h3>
                    <p className='text-sm text-slate-500'>
                        {sortedResults.length} shown{resultsArray.length !== sortedResults.length ? ` of ${resultsArray.length}` : ''} · Sorted by most recent
                    </p>
                </div>
                <div className='flex items-center gap-3'>
                    {sortedResults.length > 0 && (
                        <button
                            onClick={onClearAllResults}
                            className='flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100'
                        >
                            <Trash size={14} />
                            Clear All
                        </button>
                    )}
                    <button
                        onClick={onRefresh}
                        disabled={refreshing}
                        className='rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50'
                    >
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </div>

            <div className='overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm'>
                <div className='overflow-x-auto'>
                    <table className='min-w-full divide-y divide-gray-200 text-sm'>
                        <thead className='bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500'>
                            <tr>
                                <th className='px-6 py-3 text-left'>Store / Category</th>
                                <th className='px-6 py-3 text-left'>Status</th>
                                <th className='px-6 py-3 text-right'>Items</th>
                                <th className='px-6 py-3 text-left'>Duration</th>
                                <th className='px-6 py-3 text-left'>Completed</th>
                                <th className='px-6 py-3 text-left'>Samples</th>
                                <th className='px-6 py-3 text-left'>Crawler ID</th>
                                <th className='px-6 py-3 text-right'>Actions</th>
                            </tr>
                        </thead>

                        {showSkeleton ? (
                            <tbody>
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <tr key={`skeleton-${index}`} className='animate-pulse'>
                                        <td className='px-6 py-4' colSpan={8}>
                                            <div className='space-y-3'>
                                                <div className='h-4 bg-gray-200 rounded w-2/3'></div>
                                                <div className='h-3 bg-gray-200 rounded w-1/3'></div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        ) : sortedResults.length > 0 ? (
                            <tbody className='divide-y divide-gray-200 bg-white'>
                                {sortedResults.map(([resultId, result]) => {
                                    const [store, category] = resultId.split('_');
                                    const itemsCount = result.count || result.items?.length || result.total_products || 0;
                                    const completedAt = result.completed_at || result.timestamp;
                                    const isPseudo = Boolean(result._isPseudo);
                                    const status = (result.status || 'completed').toLowerCase();
                                    const duration = formatDuration(result.duration || result.total_duration);
                                    const formattedTimestamp = formatTimestamp(completedAt);
                                    const samples: string[] = Array.isArray(result.samples)
                                        ? result.samples.slice(0, 3).map((sample: any) => {
                                            if (typeof sample === 'string') return sample;
                                            const name = sample?.product_name || 'Unknown product';
                                            const price = sample?.price || '';
                                            return price ? `${name} - ${price}` : name;
                                        })
                                        : [];

                                    return (
                                        <tr key={resultId} className='transition-colors hover:bg-slate-50'>
                                            <td className='px-6 py-4 whitespace-nowrap'>
                                                <div className='flex flex-col'>
                                                    <span className='capitalize font-semibold text-slate-900'>{store}</span>
                                                    <span className='capitalize text-slate-600'>{category?.replace(/_/g, ' ') || '—'}</span>
                                                </div>
                                            </td>
                                            <td className='px-6 py-4 whitespace-nowrap'>
                                                <div className='flex flex-col gap-1'>
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status] || 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                                                        {status}
                                                    </span>
                                                    {isPseudo && (
                                                        <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200'>
                                                            File only
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className='px-6 py-4 text-right font-semibold text-slate-900'>{itemsCount}</td>
                                            <td className='px-6 py-4 text-slate-600'>{duration}</td>
                                            <td className='px-6 py-4 whitespace-nowrap text-slate-700'>
                                                {formattedTimestamp ? (
                                                    <div className='flex flex-col'>
                                                        <span>{formattedTimestamp.date}</span>
                                                        <span className='text-xs text-slate-500'>{formattedTimestamp.time}</span>
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td className='px-6 py-4 text-slate-600'>
                                                {samples.length > 0 ? (
                                                    <div className='space-y-1 text-xs'>
                                                        {samples.map((sample, idx) => (
                                                            <p key={`${resultId}-sample-${idx}`} className='max-w-xs truncate text-slate-600'>
                                                                • {sample}
                                                            </p>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className='text-xs text-slate-400'>No samples</span>
                                                )}
                                            </td>
                                            <td className='px-6 py-4 max-w-xs truncate text-xs font-mono text-slate-500' title={resultId}>
                                                {resultId}
                                            </td>
                                            <td className='px-6 py-4'>
                                                <div className='flex flex-wrap items-center justify-end gap-2'>
                                                    <button
                                                        onClick={() => onViewResult(store, resultId, result, isPseudo)}
                                                        className='inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50'
                                                    >
                                                        <Eye size={16} />
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => onSendToClassifier(store, resultId, result, isPseudo)}
                                                        className='inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50'
                                                        disabled={itemsCount === 0}
                                                    >
                                                        <ArrowUp2 size={16} />
                                                        Send
                                                    </button>
                                                    <button
                                                        onClick={() => onDeleteResult(store, category, resultId, completedAt)}
                                                        className='inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100'
                                                    >
                                                        <Trash size={16} />
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        ) : (
                            <tbody>
                                <tr>
                                    <td colSpan={8} className='px-6 py-12 text-center text-slate-500'>
                                        <div className='flex flex-col items-center justify-center gap-2'>
                                            <div className='rounded-full bg-slate-100 p-3'>
                                                <Eye size={24} className='text-slate-400' />
                                            </div>
                                            <p className='font-medium text-slate-900'>No results found</p>
                                            <p className='text-xs'>Try adjusting your filters or run a new crawler</p>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ResultsTab;

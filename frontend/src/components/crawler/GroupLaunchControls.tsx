import { Play } from 'iconsax-react';
import { formatNumber } from '@/utils/format';

interface GroupLaunchControlsProps {
    storeLaunch: {
        selected: string;
        setSelected: (val: string) => void;
        options: string[];
        handleLaunch: (store: string) => void;
        launching: string | null;
        count: number;
        config: any;
        handleMaxChange: (val: string) => void;
        handleCrawlAllToggle: (e: any) => void;
        handleHeadlessToggle: (e: any) => void;
        crawlAllRef: any;
        headlessRef: any;
    };
    categoryLaunch: {
        selected: string;
        setSelected: (val: string) => void;
        options: string[];
        handleLaunch: (category: string) => void;
        launching: string | null;
        count: number;
        config: any;
        handleMaxChange: (val: string) => void;
        handleCrawlAllToggle: (e: any) => void;
        handleHeadlessToggle: (e: any) => void;
        crawlAllRef: any;
        headlessRef: any;
    };
}

const GroupLaunchControls = ({ storeLaunch, categoryLaunch }: GroupLaunchControlsProps) => {
    return (
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
            {/* Store Launch */}
            <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                <div className='mb-3 flex items-center justify-between gap-2'>
                    <h3 className='flex items-center gap-2 text-base font-semibold text-slate-900'>
                        <Play size={16} className='text-primary' />
                        Launch by store
                    </h3>
                    <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                        {formatNumber(storeLaunch.count)} crawlers
                    </span>
                </div>
                <p className='mb-4 text-xs text-slate-500'>Start every crawler for a selected retailer using the current execution mode.</p>
                <div className='flex flex-col gap-3 sm:flex-row'>
                    <select
                        value={storeLaunch.selected}
                        onChange={(event) => storeLaunch.setSelected(event.target.value)}
                        className='h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                        disabled={storeLaunch.options.length === 0}
                    >
                        {storeLaunch.options.map((store: string) => (
                            <option key={store} value={store}>
                                {store.charAt(0).toUpperCase() + store.slice(1)}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => void storeLaunch.handleLaunch(storeLaunch.selected)}
                        disabled={!storeLaunch.selected || storeLaunch.count === 0 || storeLaunch.launching === storeLaunch.selected}
                        className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
                    >
                        <Play size={16} className={storeLaunch.launching === storeLaunch.selected ? 'animate-spin text-white/70' : 'text-white'} />
                        {storeLaunch.launching === storeLaunch.selected ? 'Launching…' : 'Launch store'}
                    </button>
                </div>
                <div className='mt-4 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-xs text-slate-600 supports-[backdrop-filter]:bg-white/60'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                        <span className='font-semibold uppercase tracking-[0.18em] text-slate-500'>Run settings</span>
                        {storeLaunch.config.maxMixed && (
                            <span className='text-[11px] text-slate-400'>Mixed max items – updating will sync all crawlers</span>
                        )}
                    </div>
                    <div className='mt-2 flex flex-wrap items-center gap-4'>
                        <label className='flex items-center gap-2'>
                            <span className='text-slate-500'>Max items</span>
                            <input
                                type='text'
                                inputMode='numeric'
                                pattern='[0-9]*'
                                value={storeLaunch.config.max}
                                onChange={(event) => storeLaunch.handleMaxChange(event.target.value)}
                                placeholder={storeLaunch.config.maxMixed ? 'Mixed' : 'Default 50'}
                                disabled={storeLaunch.config.crawlAll || !storeLaunch.selected}
                                className='h-8 w-20 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100'
                            />
                        </label>
                        <label className='flex items-center gap-2'>
                            <input
                                ref={storeLaunch.crawlAllRef}
                                type='checkbox'
                                checked={storeLaunch.config.crawlAll}
                                onChange={storeLaunch.handleCrawlAllToggle}
                                disabled={!storeLaunch.selected}
                                className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                            />
                            Crawl all
                        </label>
                        <label className='flex items-center gap-2'>
                            <input
                                ref={storeLaunch.headlessRef}
                                type='checkbox'
                                checked={storeLaunch.config.headless}
                                onChange={storeLaunch.handleHeadlessToggle}
                                disabled={!storeLaunch.selected}
                                className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                            />
                            Headless
                        </label>
                    </div>
                </div>
            </div>

            {/* Category Launch */}
            <div className='rounded-2xl border border-slate-200/80 bg-white/70 px-5 py-5 shadow-sm supports-[backdrop-filter]:bg-white/60'>
                <div className='mb-3 flex items-center justify-between gap-2'>
                    <h3 className='flex items-center gap-2 text-base font-semibold text-slate-900'>
                        <Play size={16} className='text-primary' />
                        Launch by category
                    </h3>
                    <span className='rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500'>
                        {formatNumber(categoryLaunch.count)} crawlers
                    </span>
                </div>
                <p className='mb-4 text-xs text-slate-500'>Kick off the chosen assortment across every store that supports it.</p>
                <div className='flex flex-col gap-3 sm:flex-row'>
                    <select
                        value={categoryLaunch.selected}
                        onChange={(event) => categoryLaunch.setSelected(event.target.value)}
                        className='h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm capitalize focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30'
                        disabled={categoryLaunch.options.length === 0}
                    >
                        {categoryLaunch.options.map((category: string) => (
                            <option key={category} value={category}>
                                {category.replace('_', ' ')}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => void categoryLaunch.handleLaunch(categoryLaunch.selected)}
                        disabled={!categoryLaunch.selected || categoryLaunch.count === 0 || categoryLaunch.launching === categoryLaunch.selected}
                        className='inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500'
                    >
                        <Play size={16} className={categoryLaunch.launching === categoryLaunch.selected ? 'animate-spin text-white/70' : 'text-white'} />
                        {categoryLaunch.launching === categoryLaunch.selected ? 'Launching…' : 'Launch category'}
                    </button>
                </div>
                <div className='mt-4 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-xs text-slate-600 supports-[backdrop-filter]:bg-white/60'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                        <span className='font-semibold uppercase tracking-[0.18em] text-slate-500'>Run settings</span>
                        {categoryLaunch.config.maxMixed && (
                            <span className='text-[11px] text-slate-400'>Mixed max items – updating will sync all crawlers</span>
                        )}
                    </div>
                    <div className='mt-2 flex flex-wrap items-center gap-4'>
                        <label className='flex items-center gap-2'>
                            <span className='text-slate-500'>Max items</span>
                            <input
                                type='text'
                                inputMode='numeric'
                                pattern='[0-9]*'
                                value={categoryLaunch.config.max}
                                onChange={(event) => categoryLaunch.handleMaxChange(event.target.value)}
                                placeholder={categoryLaunch.config.maxMixed ? 'Mixed' : 'Default 50'}
                                disabled={categoryLaunch.config.crawlAll || !categoryLaunch.selected}
                                className='h-8 w-20 rounded border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100'
                            />
                        </label>
                        <label className='flex items-center gap-2'>
                            <input
                                ref={categoryLaunch.crawlAllRef}
                                type='checkbox'
                                checked={categoryLaunch.config.crawlAll}
                                onChange={categoryLaunch.handleCrawlAllToggle}
                                disabled={!categoryLaunch.selected}
                                className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                            />
                            Crawl all
                        </label>
                        <label className='flex items-center gap-2'>
                            <input
                                ref={categoryLaunch.headlessRef}
                                type='checkbox'
                                checked={categoryLaunch.config.headless}
                                onChange={categoryLaunch.handleHeadlessToggle}
                                disabled={!categoryLaunch.selected}
                                className='h-4 w-4 rounded border border-slate-300 text-primary focus:ring-primary/40 disabled:cursor-not-allowed'
                            />
                            Headless
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupLaunchControls;

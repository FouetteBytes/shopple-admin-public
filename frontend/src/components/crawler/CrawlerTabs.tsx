import { motion } from 'framer-motion';
import { CrawlerTab, TabDefinition } from '@/app/app/crawler/types';
import { formatNumber } from '@/utils/format';

interface CrawlerTabsProps {
    tabs: TabDefinition[];
    activeTab: CrawlerTab;
    setActiveTab: (tab: CrawlerTab) => void;
    counts: {
        monitor: number;
        results: number;
        files: number;
    };
}

const CrawlerTabs = ({ tabs, activeTab, setActiveTab, counts }: CrawlerTabsProps) => {
    return (
        <div className='rounded-3xl bg-white/80 p-1 shadow-inner shadow-slate-200 backdrop-blur supports-[backdrop-filter]:bg-white/70'>
            <div className='grid gap-1 sm:grid-cols-3'>
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    const count = counts[tab.key];

                    return (
                        <motion.button
                            key={tab.key}
                            type='button'
                            onClick={() => setActiveTab(tab.key)}
                            whileHover={{ y: -2, scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            className={`group relative overflow-hidden rounded-2xl px-4 py-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 ${
                                isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            {isActive && (
                                <motion.span
                                    layoutId='crawlerTabHighlight'
                                    className={`absolute inset-0 rounded-2xl bg-white/90 backdrop-blur-sm ${tab.accent.glow}`}
                                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                                />
                            )}

                            <span className='relative flex items-start gap-3'>
                                <span
                                    className={`relative mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl text-white transition ${
                                        isActive ? tab.accent.icon : 'bg-slate-200 text-slate-500'
                                    }`}
                                >
                                    <Icon size={18} variant='Bold' />
                                    {isActive && (
                                        <motion.span
                                            layoutId='crawlerTabIconAura'
                                            className='absolute inset-0 rounded-xl border border-white/30'
                                            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                                        />
                                    )}
                                </span>
                                <span className='flex-1 pr-6'>
                                    <span className={`block text-sm font-semibold ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>
                                        {tab.label}
                                    </span>
                                    <span className='mt-0.5 block text-xs font-medium text-slate-500'>
                                        {tab.description}
                                    </span>
                                </span>
                                {typeof count === 'number' && (
                                    <motion.span
                                        key={`${tab.key}-count-${count}`}
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`absolute right-3 top-3 inline-flex min-w-[2.1rem] items-center justify-center rounded-full px-2 text-xs font-semibold ${
                                            isActive ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-600'
                                        }`}
                                    >
                                        {formatNumber(count)}
                                    </motion.span>
                                )}
                            </span>
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
};

export default CrawlerTabs;

import { motion } from 'framer-motion';
import { StatCard as StatCardType } from '@/app/app/crawler/types';

interface StatCardProps {
    card: StatCardType;
    index: number;
}

const StatCard = ({ card, index }: StatCardProps) => {
    const Icon = card.icon;
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ delay: index * 0.05, type: 'spring', stiffness: 120, damping: 18 }}
            className='group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 px-6 py-6 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg'
        >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`} />
            <div className='flex items-center justify-between gap-4'>
                <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{card.label}</p>
                    <p className='mt-3 text-3xl font-semibold text-slate-900'>{card.value}</p>
                </div>
                <div className='relative flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100'>
                    <Icon size={22} className='relative z-10 text-slate-600 transition-colors duration-300 group-hover:text-white' />
                    <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${card.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                </div>
            </div>
            <p className='mt-4 text-sm text-slate-500'>{card.description}</p>
        </motion.div>
    );
};

export default StatCard;

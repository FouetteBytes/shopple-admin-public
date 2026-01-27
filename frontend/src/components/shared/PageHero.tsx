import React from 'react';
import { motion } from 'framer-motion';

interface Stat {
  label: string;
  value: string | number;
  hint?: string;
  icon?: any;
  color?: string;
  subtext?: string;
}

interface PageHeroProps {
  category?: string;
  title: string;
  description: string;
  stats?: Stat[];
  children?: React.ReactNode;
  badges?: React.ReactNode;
}

export const PageHero: React.FC<PageHeroProps> = ({
  category,
  title,
  description,
  stats,
  children,
  badges,
}) => {
  return (
    <motion.section
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className='relative overflow-hidden rounded-[32px] border border-white/60 bg-white/90 p-6 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.5)] backdrop-blur-xl md:p-10 mb-8'
    >
      <div className='pointer-events-none absolute inset-y-0 -right-10 w-64 bg-gradient-to-b from-indigo-200/50 to-transparent blur-3xl' />
      <div className='pointer-events-none absolute -bottom-16 -left-6 h-64 w-64 rounded-full bg-purple-200/40 blur-3xl' />
      <div className='relative z-10 flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between'>
        <div className='space-y-4'>
          {category && (
            <p className='text-xs font-semibold uppercase tracking-[0.4em] text-indigo-500'>
              {category}
            </p>
          )}
          <h1 className='text-3xl font-bold tracking-tight text-slate-900 md:text-4xl'>
            {title}
          </h1>
          <p className='max-w-2xl text-sm text-slate-500 md:text-base'>
            {description}
          </p>
          {badges && <div className='flex flex-wrap gap-3'>{badges}</div>}
        </div>

        {stats && (
          <div className='grid grid-cols-2 gap-6 md:grid-cols-4 lg:gap-8'>
            {stats.map((stat, index) => (
              <div key={index} className='space-y-1'>
                <div className='flex items-center gap-2'>
                    <p className='text-xs font-medium uppercase tracking-wider text-slate-400'>
                    {stat.label}
                    </p>
                    {stat.icon && (
                        <div className={`p-1 rounded-md bg-${stat.color}-100 text-${stat.color}-600`}>
                            <stat.icon size={14} />
                        </div>
                    )}
                </div>
                <p className='text-2xl font-bold text-slate-700'>{stat.value}</p>
                {stat.subtext && (
                  <p className='text-xs text-slate-400'>{stat.subtext}</p>
                )}
                {stat.hint && (
                  <p className='text-xs text-slate-400'>{stat.hint}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </motion.section>
  );
};


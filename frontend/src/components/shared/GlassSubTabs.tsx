import { motion } from 'framer-motion';
import type { ComponentType } from 'react';

function cn(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(' ');
}

type IconComponent = ComponentType<any>;

type GlassSubTab<T extends string> = {
  key: T;
  label: string;
  description: string;
  icon: IconComponent;
  accentGradient?: string;
  badgeValue?: string | number;
  badgeClassName?: string;
};

type GlassSubTabsProps<T extends string> = {
  tabs: GlassSubTab<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  layoutId?: string;
  className?: string;
  columnsClassName?: string;
};

export function GlassSubTabs<T extends string>({
  tabs,
  activeKey,
  onChange,
  layoutId = 'glassSubTabs',
  className,
  columnsClassName = 'sm:grid-cols-2',
}: GlassSubTabsProps<T>) {
  return (
    <div className={cn('rounded-[34px] border border-white/40 bg-gradient-to-r from-white/90 via-primary/5 to-white/80 p-2 shadow-[0_40px_100px_-60px_rgba(15,23,42,0.65)] backdrop-blur', className)}>
      <div className={cn('grid gap-2', columnsClassName)}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === activeKey;
          return (
            <motion.button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              whileHover={{ y: -2 }}
              className={cn(
                'relative flex items-center gap-3 rounded-[26px] border border-white/50 px-4 py-3 text-left transition',
                isActive ? 'bg-white/95 shadow-[0_25px_65px_-40px_rgba(99,102,241,0.6)]' : 'bg-white/60 hover:bg-white/80'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={`${layoutId}-highlight`}
                  className={cn('absolute inset-0 rounded-[26px]', tab.accentGradient || 'bg-gradient-to-br from-indigo-500/10 to-transparent')}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                />
              )}
              <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/60 bg-white/80 text-primary shadow-sm">
                <Icon size={18} variant="Bold" />
              </span>
              <span className="relative flex-1">
                <span className={cn('block text-sm font-semibold', isActive ? 'text-slate-900' : 'text-slate-600')}>{tab.label}</span>
                <span className="block text-xs text-slate-500">{tab.description}</span>
              </span>
              {tab.badgeValue !== undefined && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    'relative flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-[11px] font-bold text-white',
                    tab.badgeClassName || 'bg-primary'
                  )}
                >
                  {tab.badgeValue}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

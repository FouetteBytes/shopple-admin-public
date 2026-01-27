"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Stop } from 'iconsax-react';

export interface CrawlerCardAction {
  mode: 'start' | 'stop';
  label: string;
  disabled?: boolean;
  onClick: () => void;
  gradientClass?: string;
}

export interface CrawlerCardProps {
  storeLabel: string;
  badgeText?: string;
  categoryLabel: string;
  crawlerIdLabel?: string;
  statusLabel: string;
  statusClassName: string;
  itemsFoundLabel: string;
  lastRunLabel: string;
  targetLabel: string;
  maxValue?: string;
  maxPlaceholder?: string;
  disableSettings?: boolean;
  onMaxChange: (value?: number) => void;
  onToggleCrawlAll: (checked: boolean) => void;
  onToggleHeadless: (checked: boolean) => void;
  crawlAllChecked: boolean;
  headlessChecked: boolean;
  helperText: string;
  gradientClass: string;
  hoverClass: string;
  storeChipClass: string;
  action: CrawlerCardAction;
}

const CrawlerCard: React.FC<CrawlerCardProps> = ({
  storeLabel,
  badgeText,
  categoryLabel,
  crawlerIdLabel,
  statusLabel,
  statusClassName,
  itemsFoundLabel,
  lastRunLabel,
  targetLabel,
  maxValue,
  maxPlaceholder = 'Default 50',
  disableSettings,
  onMaxChange,
  onToggleCrawlAll,
  onToggleHeadless,
  crawlAllChecked,
  headlessChecked,
  helperText,
  gradientClass,
  hoverClass,
  storeChipClass,
  action,
}) => {
  const handleMaxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = event.target.value.replace(/[^0-9]/g, '');
    if (!sanitized) {
      onMaxChange(undefined);
      return;
    }
    const parsed = Math.max(1, Number(sanitized));
    onMaxChange(parsed);
  };

  const renderActionButton = () => {
    const baseClass =
      action.mode === 'start'
        ? `flex-1 rounded-lg bg-gradient-to-r ${action.gradientClass ?? 'from-primary to-primary/80'} px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md`
        : 'flex-1 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md';

    return (
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        className={`${baseClass} disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-60`}
      >
        {action.mode === 'start' ? (
          <Play size={14} className="mr-1 inline" />
        ) : (
          <Stop size={14} className="mr-1 inline" />
        )}
        {action.label}
      </button>
    );
  };

  return (
    <motion.div
      layout
      whileHover={{ y: -4, scale: 1.01 }}
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition-all duration-200 supports-[backdrop-filter]:bg-white/60 ${hoverClass}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${gradientClass} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${storeChipClass}`}>
              {storeLabel}
            </span>
            {badgeText && (
              <span className="text-xs font-medium text-slate-500 truncate" title={badgeText}>
                {badgeText}
              </span>
            )}
          </div>
          <h4 className="mt-3 text-base font-semibold text-slate-900 capitalize leading-6 line-clamp-2" title={categoryLabel}>
            {categoryLabel}
          </h4>
          <p className="mt-1 text-xs font-medium text-slate-500 truncate">
            {crawlerIdLabel ? `Crawler ID: ${crawlerIdLabel}` : 'Crawler ID: Pending'}
          </p>
        </div>
        <div className={`relative rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClassName}`}>
          {statusLabel}
        </div>
      </div>

      <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/60 bg-white/90 p-3 shadow-inner shadow-slate-200/40">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Items found</p>
          <p className="mt-2 text-xl font-semibold text-slate-900" title={itemsFoundLabel}>
            {itemsFoundLabel}
          </p>
        </div>
        <div className="rounded-xl border border-white/60 bg-white/90 p-3 shadow-inner shadow-slate-200/40">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last activity</p>
          <p className="mt-2 text-sm font-medium text-slate-700 line-clamp-2" title={lastRunLabel}>
            {lastRunLabel}
          </p>
        </div>
      </div>

      <div className="relative mt-4 rounded-xl border border-dashed border-slate-200 bg-white/85 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-600">
          <span className="text-slate-700">Run settings</span>
          <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500" title={targetLabel}>
            {targetLabel}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={maxValue ?? ''}
            onChange={handleMaxChange}
            placeholder={maxPlaceholder}
            disabled={disableSettings}
            className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={crawlAllChecked}
              onChange={(event) => onToggleCrawlAll(event.target.checked)}
              disabled={disableSettings}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed"
            />
            Crawl all
          </label>
          <label className="flex items-center gap-2 font-medium" title="Run without showing browser window (faster)">
            <input
              type="checkbox"
              checked={headlessChecked}
              onChange={(event) => onToggleHeadless(event.target.checked)}
              disabled={disableSettings}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30 disabled:cursor-not-allowed"
            />
            Headless
          </label>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        {renderActionButton()}
        <span className="text-xs font-medium text-slate-500">{helperText}</span>
      </div>
    </motion.div>
  );
};

export default CrawlerCard;

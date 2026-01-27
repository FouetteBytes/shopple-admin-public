import { Filter, Refresh, SearchNormal1, Clock } from 'iconsax-react';

export type GlassFilterOption = {
  value: string;
  label: string;
};

export type GlassFilterSelectConfig = {
  label: string;
  value: string;
  options: ReadonlyArray<GlassFilterOption>;
  onChange: (value: string) => void;
};

export type GlassFilterBarProps = {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  selects: GlassFilterSelectConfig[];
  onRefresh: () => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  lastRefreshedLabel?: string | null;
  className?: string;
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function GlassFilterBar({
  searchPlaceholder = 'Search records',
  searchValue,
  onSearchChange,
  selects,
  onRefresh,
  autoRefresh,
  onAutoRefreshChange,
  lastRefreshedLabel,
  className,
}: GlassFilterBarProps) {
  return (
    <section className={cn('rounded-[32px] border border-white/40 bg-gradient-to-br from-white/95 via-primary/5 to-slate-50/70 p-5 shadow-[0_35px_90px_-55px_rgba(15,23,42,0.55)] backdrop-blur', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-3">
          <div className="relative">
            <SearchNormal1 size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="w-full rounded-[20px] border border-white/60 bg-white/80 py-3 pl-12 pr-4 text-sm text-slate-700 shadow-inner shadow-slate-900/5 placeholder:text-slate-400 focus:border-primary focus:outline-none"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Filter size={14} /> Smart filters
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow"
          >
            <Refresh size={16} /> Refresh
          </button>
          <label className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-2 font-semibold text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={autoRefresh}
              onChange={(event) => onAutoRefreshChange(event.target.checked)}
            />
            Auto refresh
          </label>
          <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-2 font-semibold text-slate-600">
            <Clock size={16} className="text-primary" />
            <div className="flex flex-col text-left text-[11px] leading-tight">
              <span className="text-slate-400">Last refresh</span>
              <span className="text-slate-700">{lastRefreshedLabel ?? 'Pending'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {selects.map((select) => (
          <label
            key={select.label}
            className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            {select.label}
            <div className="relative">
              <select
                className="w-full appearance-none rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner shadow-slate-900/5 focus:border-primary focus:outline-none"
                value={select.value}
                onChange={(event) => select.onChange(event.target.value)}
              >
                {select.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">⌄</span>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}

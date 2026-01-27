import { Activity, DocumentText1, FolderOpen } from 'iconsax-react'
import type { CrawlerStatus, TabDefinition } from './types'
import type { LimitMode } from '@/types/crawler'

export const COMMON_TIMEZONES = ['UTC', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Dubai', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney']

export const DASHBOARD_CACHE_KEY = 'crawlerDashboardSnapshot'
export const DASHBOARD_CACHE_TTL = 1000 * 60 * 10
export const MIN_SCHEDULE_INTERVAL_MINUTES = 240
export const DEFAULT_MAX_ITEMS = 50

export const LIMIT_MODE_OPTIONS: Array<{ key: LimitMode; label: string; hint: string }> = [
  {
    key: 'default',
    label: 'Follow defaults',
    hint: `Use crawler defaults (≈${DEFAULT_MAX_ITEMS} items) or per-crawler overrides`,
  },
  {
    key: 'custom',
    label: 'Custom cap',
    hint: 'Stop each run after a specific number of items',
  },
  {
    key: 'all',
    label: 'Crawl everything',
    hint: 'Ignore caps and fetch every available item',
  },
]

export const STORE_STYLES: Record<string, { gradient: string; icon: string; chip: string; hover: string; cta: string }> = {
  keells: {
    gradient: 'from-sky-500/12 via-white to-white/70',
    icon: 'bg-gradient-to-br from-sky-500 to-indigo-500',
    chip: 'border-sky-200 bg-sky-50 text-sky-600',
    hover: 'hover:border-sky-300',
    cta: 'from-sky-500 to-indigo-500',
  },
  cargills: {
    gradient: 'from-orange-500/12 via-white to-white/70',
    icon: 'bg-gradient-to-br from-orange-500 to-rose-500',
    chip: 'border-orange-200 bg-orange-50 text-orange-600',
    hover: 'hover:border-orange-300',
    cta: 'from-orange-500 to-rose-500',
  },
  default: {
    gradient: 'from-slate-500/10 via-white to-white/70',
    icon: 'bg-gradient-to-br from-slate-500 to-slate-700',
    chip: 'border-slate-200 bg-slate-50 text-slate-600',
    hover: 'hover:border-slate-300',
    cta: 'from-slate-600 to-slate-800',
  },
}

export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  running: { label: 'Running', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  starting: { label: 'Starting', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  completed: { label: 'Completed', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  failed: { label: 'Failed', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  error: { label: 'Error', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  stopped: { label: 'Stopped', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  uploading: { label: 'Uploading', className: 'border-purple-200 bg-purple-50 text-purple-700 animate-pulse' },
  inactive: { label: 'Ready', className: 'border-slate-200 bg-slate-100 text-slate-600' },
}

export const CRAWLER_TABS: TabDefinition[] = [
  {
    key: 'monitor',
    label: 'Monitor',
    description: 'Live crawler status, automation controls, and telemetry',
    icon: Activity,
    accent: {
      icon: 'bg-gradient-to-br from-sky-500 to-indigo-500',
      glow: 'shadow-[0_18px_40px_-24px_rgba(37,99,235,0.65)]',
    },
  },
  {
    key: 'results',
    label: 'Results',
    description: 'Review harvested batches, status history, and metrics',
    icon: DocumentText1,
    accent: {
      icon: 'bg-gradient-to-br from-emerald-500 to-teal-500',
      glow: 'shadow-[0_18px_40px_-24px_rgba(16,185,129,0.6)]',
    },
  },
  {
    key: 'files',
    label: 'Files',
    description: 'Manage exported datasets and handoffs to the classifier',
    icon: FolderOpen,
    accent: {
      icon: 'bg-gradient-to-br from-amber-500 to-orange-500',
      glow: 'shadow-[0_18px_40px_-24px_rgba(251,191,36,0.6)]',
    },
  },
]

export const DEFAULT_CRAWLER_STATUS: CrawlerStatus = {
  available: false,
  active_crawlers: 0,
  total_available: 0,
}

export const getStoreStyle = (store: string) => STORE_STYLES[store] ?? STORE_STYLES.default
export const getStatusStyle = (status: string) => STATUS_STYLES[status] ?? STATUS_STYLES.inactive

export const ACTIVE_REFRESH_INTERVAL_MS = 1000
export const IDLE_REFRESH_INTERVAL_MS = 5000
export const BACKGROUND_REFRESH_INTERVAL_MS = 60000
export const FAILURE_BACKOFF_STEP_MS = 10000
export const FAILURE_BACKOFF_MAX_MS = 90000

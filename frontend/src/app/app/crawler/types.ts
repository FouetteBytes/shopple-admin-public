import type { ElementType } from 'react'
import type { CrawlerSchedule, LimitMode, ScheduleBatchMode, ScheduleSelectionMode, ScheduleType } from '@/types/crawler'

export interface CrawlerStatus {
  available: boolean
  loading?: boolean
  active_crawlers: number
  total_available: number
}

export interface CrawlerSpec {
  store: string
  category: string
  max_items?: number
  headless_mode?: boolean
  limit_mode?: LimitMode
}

export interface CrawlerInfo {
  crawler_id?: string
  store: string
  category: string
  status: 'inactive' | 'running' | 'completed' | 'error' | 'starting' | 'failed' | 'stopped' | 'uploading'
  items_found?: number
  count?: number
  total_products?: number
  timestamp?: string
  progress?: number
  start_time?: string
  current_step?: string
  logs?: string[]
  config?: any
  max_items?: number
}

export type GroupControlState = {
  max: string
  crawlAll: boolean
  headless: boolean
  crawlAllMixed: boolean
  headlessMixed: boolean
  maxMixed: boolean
}

export type SelectionPreset = {
  key: string
  label: string
  hint: string
  mode: ScheduleSelectionMode
  stores?: string[]
  categories?: string[]
}

export type CadencePreset = {
  key: string
  label: string
  hint: string
  type: ScheduleType
  dailyTime?: string
  weeklyDays?: number[]
  intervalMinutes?: string
  timezone?: string
  oneTimeLocal?: string
}

export interface ScheduleFormState {
  name: string
  description: string
  enabled: boolean
  selectionMode: ScheduleSelectionMode
  store: string
  category: string
  selectedCategories: string[]
  selectedStores: string[]
  batchMode: ScheduleBatchMode
  maxItems: string
  limitMode: LimitMode
  headless: boolean
  scheduleType: ScheduleType
  oneTimeLocal: string
  dailyTime: string
  timezone: string
  weeklyDays: number[]
  intervalMinutes: string
}

export interface DashboardSnapshot {
  status: CrawlerStatus
  availableCrawlers: Record<string, any>
  allCrawlers: CrawlerInfo[]
  activeCrawlers: { [key: string]: any }
  crawlerResults: { [key: string]: any }
  recentActivity: any[]
  outputFiles: { [key: string]: string[] }
  savedAt: number
}

export type StatCard = {
  key: string
  label: string
  description: string
  value: string
  accent: string
  icon: ElementType
}

export type CrawlerTab = 'monitor' | 'results' | 'files'

export type TabDefinition = {
  key: CrawlerTab
  label: string
  description: string
  icon: ElementType
  accent: {
    icon: string
    glow: string
  }
}

export type ResultsFilterState = {
  store: string
  category: string
  minItems: string
  maxItems: string
  dateFrom: string
  dateTo: string
}

export type FileViewerState = {
  open: boolean
  store: string
  filename: string
  content: any
}

export type FirebaseFile = {
  open: boolean
  store: string
  filename: string
  content: any
}

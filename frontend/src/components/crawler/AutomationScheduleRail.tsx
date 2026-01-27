"use client"

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Flash, Timer1, Play, Pause, Edit2, Trash } from 'iconsax-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { CrawlerSchedule } from '@/types/crawler'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type AutomationScheduleRailProps = {
  schedules: CrawlerSchedule[]
  loading?: boolean
  variant?: 'full' | 'compact'
  emptyMessage?: string
  onRunNow?: (schedule: CrawlerSchedule) => void
  onToggle?: (schedule: CrawlerSchedule) => void
  onEdit?: (schedule: CrawlerSchedule) => void
  onDelete?: (schedule: CrawlerSchedule) => void
  describeSelection?: (schedule: CrawlerSchedule) => string
  describeTiming?: (schedule: CrawlerSchedule) => string
}

type CountdownDescriptor = {
  label: string
  tone: 'ready' | 'warn' | 'overdue'
}

const defaultDescribeSelection = (schedule: CrawlerSchedule) => {
  const selection = schedule.selection || {}
  const mode = selection.mode || 'all'
  if (mode === 'all') return 'All crawlers'
  if (mode === 'store') {
    const stores = Array.isArray(selection.stores) && selection.stores.length > 0 ? selection.stores.join(', ') : 'All stores'
    const categories = Array.isArray(selection.categories) && selection.categories.length > 0 ? selection.categories.join(', ') : 'All categories'
    return `Stores: ${stores} • Categories: ${categories}`
  }
  if (mode === 'category') {
    const categories = Array.isArray(selection.categories) && selection.categories.length > 0 ? selection.categories.join(', ') : 'All categories'
    const stores = Array.isArray(selection.stores) && selection.stores.length > 0 ? selection.stores.join(', ') : 'All stores'
    return `Categories: ${categories} • Stores: ${stores}`
  }
  if (mode === 'explicit') {
    const crawlers = Array.isArray(selection.crawlers) ? selection.crawlers.length : 0
    return `Explicit list (${crawlers} crawlers)`
  }
  return 'Custom selection'
}

const defaultDescribeTiming = (schedule: CrawlerSchedule) => {
  const config = schedule.schedule || {}
  const type = config.type || 'one_time'
  if (type === 'one_time') {
    return config.run_at ? new Date(config.run_at).toLocaleString() : 'One-time run'
  }
  if (type === 'daily') {
    return `Daily @ ${config.time_of_day || '00:00'} ${config.timezone || 'UTC'}`
  }
  if (type === 'weekly') {
    const days = Array.isArray(config.days_of_week)
      ? config.days_of_week.map((day: any) => WEEKDAY_LABELS[Number(day) % 7] ?? day).join(', ')
      : 'Weekly'
    return `${days} @ ${config.time_of_day || '00:00'} ${config.timezone || 'UTC'}`
  }
  if (type === 'interval') {
    return `Every ${config.interval_minutes || 60} min`
  }
  return 'Custom cadence'
}

const formatShortTimestamp = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const describeCountdown = (iso: string | null | undefined, now: number): CountdownDescriptor => {
  if (!iso) return { label: 'Awaiting schedule', tone: 'warn' }
  const next = Date.parse(iso)
  if (Number.isNaN(next)) return { label: 'Invalid schedule', tone: 'warn' }
  const diff = next - now
  if (diff <= 0) {
    const overdue = Math.abs(diff)
    const minutes = Math.floor(overdue / 60000)
    const seconds = Math.floor((overdue % 60000) / 1000)
    if (minutes === 0 && seconds < 5) {
      return { label: 'Triggering now…', tone: 'ready' }
    }
    const formatted = minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s overdue` : `${seconds}s overdue`
    return { label: formatted, tone: 'overdue' }
  }
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  if (hours > 0) {
    return { label: `${hours}h ${minutes.toString().padStart(2, '0')}m away`, tone: 'ready' }
  }
  if (minutes > 0) {
    return { label: `${minutes}m ${seconds.toString().padStart(2, '0')}s away`, tone: minutes < 5 ? 'warn' : 'ready' }
  }
  return { label: `${seconds}s away`, tone: 'warn' }
}

const toneClassMap: Record<CountdownDescriptor['tone'], string> = {
  ready: 'text-emerald-600',
  warn: 'text-amber-600',
  overdue: 'text-rose-600'
}

const statusClassMap: Record<string, string> = {
  success: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  running: 'text-sky-600 bg-sky-50 border-sky-100',
  failed: 'text-rose-600 bg-rose-50 border-rose-100',
  error: 'text-rose-600 bg-rose-50 border-rose-100',
  pending: 'text-amber-600 bg-amber-50 border-amber-100'
}

const getStatusClass = (status?: string | null) => statusClassMap[status || 'pending'] || 'text-slate-600 bg-slate-50 border-slate-100'

const modeAccentMap: Record<string, string> = {
  all: 'from-primary/15 via-white/60 to-white',
  store: 'from-amber-200/40 via-white/60 to-white',
  category: 'from-sky-200/40 via-white/60 to-white',
  explicit: 'from-purple-200/40 via-white/60 to-white'
}

export default function AutomationScheduleRail({
  schedules,
  loading,
  variant = 'full',
  emptyMessage = 'No automation schedules yet',
  onRunNow,
  onToggle,
  onEdit,
  onDelete,
  describeSelection = defaultDescribeSelection,
  describeTiming = defaultDescribeTiming
}: AutomationScheduleRailProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const aTime = a.next_run ? Date.parse(a.next_run) : Number.MAX_SAFE_INTEGER
      const bTime = b.next_run ? Date.parse(b.next_run) : Number.MAX_SAFE_INTEGER
      return aTime - bTime
    })
  }, [schedules])

  if (!loading && sortedSchedules.length === 0) {
    return (
      <div className='rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center text-slate-500'>
        <p className='text-base font-medium text-slate-700'>{emptyMessage}</p>
        <p className='mt-2 text-sm text-slate-500'>Create a schedule to unlock automated crawls.</p>
      </div>
    )
  }

  const showSkeletons = loading && sortedSchedules.length === 0

  return (
    <div className='relative -mx-1'>
      <div className='flex gap-4 overflow-x-auto px-1 pb-4 pt-1 [scrollbar-width:none]' style={{ scrollSnapType: 'x mandatory' }}>
        {showSkeletons
          ? Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`schedule-skeleton-${index}`}
                className={`min-w-[280px] max-w-[320px] flex-1 snap-start rounded-2xl border bg-white px-5 py-4 shadow-sm ${variant === 'compact' ? 'border-slate-100' : 'border-slate-200'}`}
              >
                <div className='flex flex-col gap-3'>
                  <div className='h-3.5 w-2/3 animate-pulse rounded bg-slate-200' />
                  <div className='h-2.5 w-1/2 animate-pulse rounded bg-slate-100' />
                  <div className='h-2.5 w-3/4 animate-pulse rounded bg-slate-100' />
                  <div className='h-2.5 w-1/3 animate-pulse rounded bg-slate-200' />
                </div>
              </div>
            ))
          : (
              <AnimatePresence initial={false}>
                {sortedSchedules.map(schedule => {
                  const countdown = describeCountdown(schedule.next_run || null, now)
                  const accent = modeAccentMap[(schedule.selection?.mode as string) || 'all'] || modeAccentMap.all
                  const timingDescription = describeTiming(schedule)
                  const countdownAnimation = countdown.tone === 'overdue' ? { scale: [1, 1.05, 1] } : { scale: 1 }
                  const countdownTransition = countdown.tone === 'overdue'
                    ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
                    : { duration: 0.2 }
                  const cardBorder = variant === 'compact' ? 'border-slate-100' : 'border-slate-200'
                  return (
                    <motion.div
                      key={schedule.id}
                      layout
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -24 }}
                      whileHover={{ y: -6, scale: 1.01 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                      className='min-w-[280px] max-w-[320px] flex-1 snap-start'
                    >
                      <div className={`group relative flex h-full flex-col overflow-hidden rounded-3xl border ${cardBorder} bg-white/90 shadow-sm`}> 
                        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent} opacity-60 transition group-hover:opacity-90`} />
                        <div className='relative z-10 flex h-full flex-col gap-3 px-5 py-4'>
                          <div className='flex items-start justify-between gap-3'>
                            <div>
                              <p className='text-sm font-semibold text-slate-900'>{schedule.label}</p>
                              <p className='text-xs text-slate-500'>{schedule.description || timingDescription}</p>
                            </div>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${schedule.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.25)]' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                              {schedule.enabled ? 'Enabled' : 'Paused'}
                            </span>
                          </div>

                          <div className='flex flex-col gap-1 text-sm text-slate-600'>
                            <div className='flex items-center gap-2'>
                              <Calendar size={18} className='text-slate-400' />
                              <span className='font-medium text-slate-700'>{formatShortTimestamp(schedule.next_run)}</span>
                              <motion.span
                                className={`text-xs font-semibold ${toneClassMap[countdown.tone]}`}
                                animate={countdownAnimation}
                                transition={countdownTransition}
                              >
                                {countdown.label}
                              </motion.span>
                            </div>
                            <div className='flex items-center gap-2 text-xs text-slate-500'>
                              <Flash size={16} className='text-slate-400' />
                              <p className='line-clamp-2'>{describeSelection(schedule)}</p>
                            </div>
                            <div className='flex items-center gap-2 text-xs text-slate-500'>
                              <Timer1 size={16} className='text-slate-400' />
                              <span>{timingDescription}</span>
                            </div>
                          </div>

                          <div className='flex flex-wrap items-center gap-2 text-[11px] text-slate-500'>
                            <span className={`rounded-full border px-2 py-0.5 font-medium ${getStatusClass(schedule.last_status)}`}>
                              Last run: {schedule.last_status ? schedule.last_status : 'Unknown'}
                            </span>
                            <span className='rounded-full border border-slate-100 bg-white/80 px-2 py-0.5'>
                              {schedule.batch_mode === 'parallel' ? 'Parallel' : 'Sequential'}
                            </span>
                            {schedule.limit_mode === 'all' && (
                              <span className='rounded-full border border-slate-100 bg-white/80 px-2 py-0.5'>Crawl all items</span>
                            )}
                            {schedule.limit_mode === 'custom' && typeof schedule.max_items === 'number' && (
                              <span className='rounded-full border border-slate-100 bg-white/80 px-2 py-0.5'>Max {schedule.max_items}</span>
                            )}
                            {schedule.headless_mode && (
                              <span className='rounded-full border border-slate-100 bg-white/80 px-2 py-0.5'>Headless</span>
                            )}
                          </div>

                          {variant === 'full' && (
                            <div className='mt-1 flex flex-wrap gap-2 text-xs'>
                              {onRunNow && (
                                <button
                                  type='button'
                                  onClick={() => onRunNow(schedule)}
                                  className='inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 px-3 py-1 font-semibold text-emerald-700 transition hover:from-emerald-500/30 hover:to-emerald-400/30'
                                >
                                  <Play size={16} /> Run now
                                </button>
                              )}
                              {onToggle && (
                                <button
                                  type='button'
                                  onClick={() => onToggle(schedule)}
                                  className='inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-200'
                                >
                                  {schedule.enabled ? <Pause size={16} /> : <Play size={16} />} {schedule.enabled ? 'Pause' : 'Resume'}
                                </button>
                              )}
                              {onEdit && (
                                <button
                                  type='button'
                                  onClick={() => onEdit(schedule)}
                                  className='inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 font-semibold text-slate-600 shadow-sm transition hover:bg-white'
                                >
                                  <Edit2 size={16} /> Edit
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  type='button'
                                  onClick={() => onDelete(schedule)}
                                  className='inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 font-semibold text-rose-600 shadow-sm transition hover:bg-rose-50'
                                >
                                  <Trash size={16} /> Delete
                                </button>
                              )}
                            </div>
                          )}

                          <div className='mt-auto h-1.5 overflow-hidden rounded-full bg-slate-100'>
                            <motion.div
                              className={`h-full ${schedule.enabled ? 'bg-gradient-to-r from-primary to-emerald-400' : 'bg-slate-300'}`}
                              initial={{ width: '20%' }}
                              animate={{ width: schedule.enabled ? '92%' : '40%' }}
                              transition={{ duration: 1.1, ease: 'easeOut' }}
                            />
                          </div>

                          {schedule.last_run && (
                            <div className='text-right text-[11px] text-slate-400'>Last action {formatShortTimestamp(schedule.last_run)}</div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
      </div>
    </div>
  )
}

import React from 'react'
import { ClassificationHistoryEvent } from '@/types/classification'
import { formatDateTime } from '@/utils/datetime'

interface ClassificationHistoryTimelineProps {
  events: ClassificationHistoryEvent[]
  loading?: boolean
  error?: string | null
  onRefresh?: () => void
  emptyTitle?: string
  emptyDescription?: string
  limit?: number
}

const formatEventType = (value: string) =>
  value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

const ClassificationHistoryTimeline: React.FC<ClassificationHistoryTimelineProps> = ({
  events,
  loading = false,
  error = null,
  onRefresh,
  emptyTitle = 'No history events yet',
  emptyDescription = 'Once classifications run, the timeline will populate automatically.',
  limit,
}) => {
  const items = limit && limit > 0 ? events.slice(0, limit) : events

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Classification History</h3>
          <p className="text-sm text-gray-600">Audit log for classifier runs, manual uploads, and cloud file maintenance.</p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-gray-600">Loading history…</div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-gray-600">
          <h4 className="text-base font-semibold text-gray-800">{emptyTitle}</h4>
          <p className="mt-1 text-sm text-gray-500">{emptyDescription}</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-blue-200 via-blue-100 to-transparent" aria-hidden />
          <div className="space-y-4">
            {items.map((event) => (
              <div
                key={event.id}
                className="relative ml-8 rounded-lg border border-gray-100 bg-gray-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <div className="absolute -left-8 top-4 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-blue-500 shadow" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    {formatEventType(event.event_type)}
                  </div>
                  <div className="text-xs text-gray-500">{formatDateTime(event.timestamp)}</div>
                </div>
                <h4 className="mt-1 text-sm font-semibold text-gray-900">{event.summary || 'Event'}</h4>
                {event.details?.message && (
                  <p className="mt-1 text-sm text-gray-600">{event.details.message}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                  {typeof event.total_products === 'number' && (
                    <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm">Total {event.total_products}</span>
                  )}
                  {typeof event.successful === 'number' && (
                    <span className="flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-green-700 shadow-sm">
                      ✅ {event.successful}
                    </span>
                  )}
                  {typeof event.failed === 'number' && event.failed > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-red-600 shadow-sm">
                      ⚠️ {event.failed} issues
                    </span>
                  )}
                  {typeof event.duration_seconds === 'number' && (
                    <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 shadow-sm">
                      ⏱ {(event.duration_seconds / 60).toFixed(1)} min
                    </span>
                  )}
                </div>
                {event.details && (
                  <details className="mt-3 rounded-lg bg-white/60 p-3 text-xs text-gray-600">
                    <summary className="cursor-pointer text-xs font-semibold text-gray-700">View raw details</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/5 p-3 text-[11px] leading-relaxed text-gray-800">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ClassificationHistoryTimeline

import type { ProductRequestDetail } from '@/lib/productRequestApi';
import { formatDate } from '../utils';

export type ActivityTimelineProps = {
  activity: ProductRequestDetail['activity'];
};

export function ActivityTimeline({ activity }: ActivityTimelineProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-800">Activity timeline</h3>
      <div className="mt-3 space-y-2 text-sm text-gray-600">
        {activity && activity.length > 0 ? (
          activity.map((event) => (
            <div key={event.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-medium text-gray-700">{event.actorName || 'System'}</span>
                <span>{formatDate(event.timestamp)}</span>
              </div>
              <p className="mt-1 text-sm text-gray-700">{event.summary || event.action}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-500">No activity logged yet.</p>
        )}
      </div>
    </section>
  );
}

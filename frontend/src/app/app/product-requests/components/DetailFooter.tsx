import { ArrowCircleRight, CloseCircle, Flash, Refresh, TickCircle } from 'iconsax-react';
import type { ProductRequestStatus } from '@/lib/productRequestApi';

export type DetailFooterProps = {
  status: ProductRequestStatus;
  actionLoading: boolean;
  selectedStatusTransitions: ProductRequestStatus[];
  onStartReview: () => void;
  onReject: () => void;
  onStatusChange: (status: ProductRequestStatus) => void;
};

export function DetailFooter({
  status,
  actionLoading,
  selectedStatusTransitions,
  onStartReview,
  onReject,
  onStatusChange,
}: DetailFooterProps) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-4">
      <div className="flex flex-wrap gap-2">
        {status === 'pending' && (
          <>
            <button
              onClick={onStartReview}
              disabled={actionLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary hover:text-white"
            >
              <Flash size={16} /> Start review
            </button>
            <button
              onClick={onReject}
              disabled={actionLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-500 hover:text-white"
            >
              <CloseCircle size={16} /> Reject
            </button>
          </>
        )}
        {status === 'inReview' && (
          <>
            <button
              onClick={() => onStatusChange('approved')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-500 hover:text-white"
            >
              <TickCircle size={16} /> Approve
            </button>
            <button
              onClick={onReject}
              disabled={actionLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-500 hover:text-white"
            >
              <CloseCircle size={16} /> Reject
            </button>
          </>
        )}
        {status === 'approved' && (
          <>
            <button
              onClick={() => onStatusChange('completed')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-500 hover:text-white"
            >
              <ArrowCircleRight size={16} /> Mark completed
            </button>
            <button
              onClick={() => onStatusChange('pending')}
              disabled={actionLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <Refresh size={16} /> Re-open
            </button>
          </>
        )}
        {['completed', 'rejected'].includes(status) && (
          <button
            onClick={() => onStatusChange('pending')}
            disabled={actionLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <Refresh size={16} /> Re-open
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Status transitions allowed: {selectedStatusTransitions.join(' → ') || 'n/a'}
      </p>
    </footer>
  );
}

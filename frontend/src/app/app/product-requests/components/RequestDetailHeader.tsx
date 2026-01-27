import { UserAdd, Copy, TickCircle } from 'iconsax-react';
import type { ProductRequestDetail, ProductRequestStatus, ProductRequestType } from '@/lib/productRequestApi';
import { classNames, formatDate } from '../utils';
import { PRIORITY_OPTIONS, REQUEST_TYPE_META, STATUS_META } from '../constants';

export type RequestDetailHeaderProps = {
  detail: ProductRequestDetail;
  actionLoading: boolean;
  onPriorityChange: (priority: string) => void;
  onStartReview: () => void;
  onReject: () => void;
  onStatusChange: (status: ProductRequestStatus) => void;
  statusTransitions: ProductRequestStatus[];
  onCopyId: (value: string) => void;
  onCreatePending?: () => void;
};

// Milestone-based progress: rejected and completed are separate endpoints, not in the main flow
const STATUS_FLOW: ProductRequestStatus[] = ['pending', 'inReview', 'approved', 'completed'];

// Helper to determine milestone completion status
function getMilestoneProgress(currentStatus: ProductRequestStatus): {
  completedMilestones: number;
  totalMilestones: number;
  isRejected: boolean;
} {
  const isRejected = currentStatus === 'rejected';
  
  if (isRejected) {
    // Rejected requests show where they were rejected from
    return { completedMilestones: 0, totalMilestones: STATUS_FLOW.length, isRejected: true };
  }
  
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  const completedMilestones = currentIndex >= 0 ? currentIndex + 1 : 1;
  
  return {
    completedMilestones,
    totalMilestones: STATUS_FLOW.length,
    isRejected: false
  };
}

export function RequestDetailHeader({
  detail,
  actionLoading,
  onPriorityChange,
  onStartReview,
  onReject,
  onStatusChange,
  statusTransitions,
  onCopyId,
  onCreatePending,
}: RequestDetailHeaderProps) {
  const typeMeta = REQUEST_TYPE_META[detail.requestType as ProductRequestType];
  const statusMeta = STATUS_META[detail.status];
  const { completedMilestones, totalMilestones, isRejected } = getMilestoneProgress(detail.status);

  const renderActions = () => {
    switch (detail.status) {
      case 'pending':
        return (
          <button
            onClick={onStartReview}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90 disabled:opacity-60"
          >
            <UserAdd size={16} /> Start review
          </button>
        );
      case 'inReview':
        return (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                onStatusChange('approved');
                if (onCreatePending && detail.requestType === 'newProduct') {
                  setTimeout(() => onCreatePending(), 500);
                }
              }}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-500 disabled:opacity-60"
            >
              Approve {detail.requestType === 'newProduct' && '& Add to Queue'}
            </button>
            <button
              onClick={onReject}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-50 disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        );
      case 'approved':
        return (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onStatusChange('completed')}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-sky-500 disabled:opacity-60"
            >
              Mark completed
            </button>
            <button
              onClick={() => onStatusChange('pending')}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 disabled:opacity-60"
            >
              Re-open
            </button>
          </div>
        );
      default:
        return (
          <button
            onClick={() => onStatusChange('pending')}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 disabled:opacity-60"
          >
            Move back to review
          </button>
        );
    }
  };

  return (
    <header className="space-y-4 border-b border-gray-100 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900">{detail.productName}</h2>
            <span className={classNames('rounded-full px-2 py-0.5 text-[11px] font-semibold', typeMeta?.badge ?? 'bg-gray-50 text-gray-700')}>
              {typeMeta?.label ?? detail.requestType}
            </span>
          </div>
          <p className="text-sm text-gray-500">{detail.store || 'Unknown store'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={classNames('rounded-full px-3 py-1 text-xs font-semibold', statusMeta?.badge ?? 'bg-gray-100 text-gray-600')}>
            {statusMeta?.label ?? detail.status}
          </span>
          <select
            value={detail.priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            disabled={actionLoading}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 focus:border-primary"
          >
            {PRIORITY_OPTIONS.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {detail.assignedTo?.adminName ? (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Assigned to {detail.assignedTo.adminName}
            </span>
          ) : (
            <button
              onClick={onStartReview}
              className="inline-flex items-center gap-1 rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
              disabled={actionLoading}
            >
              <UserAdd size={14} /> Assign & review
            </button>
          )}
          <button
            onClick={() => onCopyId(detail.id)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600"
          >
            <Copy size={12} /> Copy ID
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Review status</p>
            <p className="text-base font-semibold text-gray-900">{statusMeta?.label ?? detail.status}</p>
          </div>
          <div className="text-[11px] uppercase text-gray-400">
            Allowed: {statusTransitions.length ? statusTransitions.join(' → ') : 'n/a'}
          </div>
        </div>
        <div className="mt-4">
          {/* Milestone progress bar */}
          <div className="relative mb-6">
            <div className="flex items-center justify-between">
              {STATUS_FLOW.map((status, index) => {
                const isCurrent = detail.status === status;
                const isCompleted = index < completedMilestones && !isRejected;
                const isActive = index === completedMilestones - 1 && !isRejected;
                
                return (
                  <div key={status} className="flex flex-col items-center" style={{ width: `${100 / STATUS_FLOW.length}%` }}>
                    {/* Milestone circle */}
                    <div
                      className={classNames(
                        'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                        isCompleted || isActive
                          ? 'border-primary bg-primary shadow-lg'
                          : isRejected && isCurrent
                          ? 'border-rose-500 bg-rose-500'
                          : 'border-gray-300 bg-white'
                      )}
                    >
                      {(isCompleted || (isActive && detail.status === 'completed')) && (
                        <TickCircle size={20} className="text-white" variant="Bold" />
                      )}
                      {!isCompleted && !isActive && (
                        <div className={classNames(
                          'h-3 w-3 rounded-full',
                          isRejected && isCurrent ? 'bg-white' : 'bg-gray-300'
                        )} />
                      )}
                      {isActive && detail.status !== 'completed' && (
                        <div className="h-3 w-3 animate-pulse rounded-full bg-white" />
                      )}
                    </div>
                    
                    {/* Connecting line */}
                    {index < STATUS_FLOW.length - 1 && (
                      <div
                        className={classNames(
                          'absolute top-5 h-0.5 transition-all duration-300',
                          isCompleted ? 'bg-primary' : 'bg-gray-200'
                        )}
                        style={{
                          left: `${((index + 0.5) / STATUS_FLOW.length) * 100}%`,
                          width: `${(1 / STATUS_FLOW.length) * 100}%`
                        }}
                      />
                    )}
                    
                    {/* Label */}
                    <span
                      className={classNames(
                        'mt-2 text-center text-[10px] font-semibold uppercase tracking-wide transition-colors duration-200',
                        isCurrent ? 'text-primary' : 'text-gray-500'
                      )}
                    >
                      {STATUS_META[status]?.label ?? status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Rejection indicator */}
          {isRejected && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
              <p className="text-sm font-semibold text-rose-700">This request has been rejected</p>
              <p className="text-xs text-rose-600">You can re-open it to move it back to pending status</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {renderActions()}
          <p className="text-xs text-gray-500">
            Leave a note below after taking action so the requester receives context.
          </p>
        </div>
      </div>
      <div className="grid gap-3 text-xs text-gray-600 sm:grid-cols-2">
        <div>
          <p className="text-gray-500">Request ID</p>
          <p className="font-medium text-gray-900">{detail.id}</p>
        </div>
        <div>
          <p className="text-gray-500">Created</p>
          <p className="font-medium text-gray-900">{formatDate(detail.createdAt)}</p>
        </div>
        <div>
          <p className="text-gray-500">Last updated</p>
          <p className="font-medium text-gray-900">{formatDate(detail.updatedAt)}</p>
        </div>
        {detail.submissionSource && (
          <div>
            <p className="text-gray-500">Submission source</p>
            <p className="font-medium text-gray-900 capitalize">{detail.submissionSource}</p>
          </div>
        )}
      </div>
    </header>
  );
}

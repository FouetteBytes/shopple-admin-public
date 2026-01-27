import { memo } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import type { ProductRequestStatus, ProductRequestSummary, ProductRequestType } from '@/lib/productRequestApi';
import { classNames, formatRelative } from '../utils';
import { REQUEST_TYPE_META, STATUS_META, PRIORITY_META } from '../constants';
import { RequesterAvatar, extractRequesterInfo } from './RequesterAvatar';
import { MagicStar, Timer1 } from 'iconsax-react';

type RequestListItemProps = {
  item: ProductRequestSummary;
  selected: boolean;
  bulkSelected: boolean;
  onSelect: (id: string) => void | Promise<void>;
  onBulkToggle: (id: string, selected: boolean) => void;
};

export const RequestListItem = memo(function RequestListItem({ item, selected, bulkSelected, onSelect, onBulkToggle }: RequestListItemProps) {
  const requester = extractRequesterInfo(item.submittedBy);
  const statusMeta = STATUS_META[item.status as ProductRequestStatus] ?? { label: item.status, badge: 'bg-gray-100 text-gray-600' };
  const typeMeta = REQUEST_TYPE_META[item.requestType as ProductRequestType] ?? {
    label: item.requestType,
    badge: 'bg-gray-50 text-gray-600',
    description: '',
  };
  const priorityMeta = PRIORITY_META[item.priority] ?? PRIORITY_META.normal;
  const previewUrl = item.photoUrls?.[0];
  const showPreview = item.requestType === 'updateProduct' && Boolean(previewUrl);

  const handleSelect = () => onSelect(item.id);

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={handleSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleSelect();
        }
      }}
      className={classNames(
        'group relative isolate w-full overflow-hidden rounded-[26px] border px-4 py-4 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        selected
          ? 'border-primary/60 bg-gradient-to-br from-white via-primary/10 to-white/80 shadow-[0_25px_50px_-20px_rgba(99,102,241,0.45)]'
          : 'border-white/30 bg-gradient-to-br from-white/95 via-white/70 to-primary/5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)] hover:border-primary/30 hover:shadow-[0_30px_60px_-24px_rgba(99,102,241,0.35)] backdrop-blur-xl'
      )}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100"
        style={{ background: 'linear-gradient(120deg, rgba(147,51,234,0.09), rgba(236,72,153,0.08), rgba(59,130,246,0.08))' }}
        animate={{ opacity: selected ? 0.35 : undefined }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        animate={{ opacity: selected ? 0.9 : 0.4 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
        animate={{ opacity: selected ? 0.5 : 0.2 }}
      />
      <div className="relative flex items-start gap-3">
        <div className="flex flex-1 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            checked={bulkSelected}
            onChange={(event) => {
              event.stopPropagation();
              onBulkToggle(item.id, event.target.checked);
            }}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">{item.productName}</p>
              <span className={classNames('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur', typeMeta.badge)}>
                <MagicStar size={12} className="text-current" />
                {typeMeta.label}
              </span>
            </div>
            <p className="text-xs text-gray-500">{item.store || 'Unknown store'}</p>
            {requester ? (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <RequesterAvatar info={requester} size="xs" />
                <span className="font-medium text-gray-700">{requester.name}</span>
              </div>
            ) : null}
            {typeMeta.description ? <p className="text-[11px] text-gray-400">{typeMeta.description}</p> : null}
          </div>
        </div>
        <div className="flex items-start gap-3">
          {showPreview ? (
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-inner shadow-slate-900/5">
              <Image src={previewUrl!} alt={`${item.productName} update preview`} fill sizes="64px" className="object-cover" unoptimized />
              <span className="absolute bottom-1 left-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-semibold text-sky-600 shadow">
                Update
              </span>
            </div>
          ) : null}
          <div className="flex flex-col items-end gap-2 text-[11px]">
          <span className={classNames('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium capitalize shadow-sm backdrop-blur', priorityMeta.badge)}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {item.priority}
          </span>
          <span className={classNames('rounded-full border border-white/70 px-3 py-0.5 font-semibold shadow-sm backdrop-blur', statusMeta.badge)}>{statusMeta.label}</span>
          </div>
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px] font-medium text-gray-500">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
          <Timer1 size={12} className="text-primary" />
          {formatRelative(item.createdAt)}
        </span>
        {item.taggedProductId ? <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] shadow-sm">Tagged #{item.taggedProductId}</span> : null}
        {item.assignedTo?.adminName ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Assigned to {item.assignedTo.adminName}</span>
        ) : null}
        {item.labels && item.labels.length > 0 ? (
          <span className="text-[11px] text-gray-400">
            {item.labels.slice(0, 2).join(', ')}
            {item.labels.length > 2 ? ' +' : ''}
          </span>
        ) : null}
      </div>
      {/* Issue Quick Preview */}
      {item.issue && item.issue.issueTypes && item.issue.issueTypes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.issue.issueTypes.map((issueType) => (
            <span
              key={issueType}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 shadow-sm"
            >
              ⚠ {issueType.replace('incorrect', '').replace(/([A-Z])/g, ' $1').trim()}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
});

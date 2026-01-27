import { CloseCircle, Tag2 } from 'iconsax-react';

export type LabelsSectionProps = {
  labels: string[];
  labelDraft: string;
  onLabelDraftChange: (value: string) => void;
  onAddLabel: () => void;
  onRemoveLabel: (label: string) => void;
  actionLoading: boolean;
};

export function LabelsSection({ labels, labelDraft, onLabelDraftChange, onAddLabel, onRemoveLabel, actionLoading }: LabelsSectionProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-800">Labels</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {labels.length === 0 && <span className="text-xs text-gray-500">No labels yet</span>}
        {labels.map((label) => (
          <span key={label} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {label}
            <button onClick={() => onRemoveLabel(label)} className="text-gray-400 hover:text-gray-700">
              <CloseCircle size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={labelDraft}
          onChange={(e) => onLabelDraftChange(e.target.value)}
          placeholder="Add label"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={onAddLabel}
          disabled={actionLoading || labelDraft.trim().length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:border-primary hover:text-primary disabled:cursor-not-allowed"
        >
          <Tag2 size={16} /> Add
        </button>
      </div>
    </section>
  );
}

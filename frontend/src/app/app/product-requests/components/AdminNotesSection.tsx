import { MessageAdd } from 'iconsax-react';
import type { ProductRequestDetail } from '@/lib/productRequestApi';
import { formatDate } from '../utils';

export type AdminNotesSectionProps = {
  notes: ProductRequestDetail['adminNotes'];
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onAddNote: () => void;
  actionLoading: boolean;
  productName?: string;
  requestType?: string;
};

export function AdminNotesSection({ notes, noteDraft, onNoteDraftChange, onAddNote, actionLoading, productName, requestType }: AdminNotesSectionProps) {
  const sortedNotes = (notes ?? []).slice().sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return 0;
  });

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-800">Admin notes</h3>
      <div className="mt-3 space-y-2">
        {sortedNotes.length > 0 ? (
          sortedNotes.map((note) => (
            <div key={note.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-medium text-gray-700">{note.authorName || 'Admin'}</span>
                <span>{formatDate(note.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm text-gray-700">{note.note}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-500">No notes yet.</p>
        )}
      </div>
      <textarea
        rows={3}
        value={noteDraft}
        onChange={(e) => onNoteDraftChange(e.target.value)}
        placeholder="Document next steps or communication"
        className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <div className="mt-2 flex justify-end">
        <button
          onClick={onAddNote}
          disabled={actionLoading || noteDraft.trim().length === 0}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-primary/50"
        >
          <MessageAdd size={16} /> Add note
        </button>
      </div>
    </section>
  );
}

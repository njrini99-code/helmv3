'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconNote, IconX } from '@/components/icons';
import { createCoachNote } from '@/app/golf/actions/crm-foundations';
import type {
  CrmNote,
  NoteKind,
} from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// AddNoteDialog — modal for capturing a new CrmNote against a coach.
// ============================================================================

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachId: string;
  /** Fired with the newly-created note so the parent can prepend it. */
  onCreated?: (note: CrmNote) => void;
}

const KIND_OPTIONS: ReadonlyArray<{ value: NoteKind; label: string; hint: string }> = [
  { value: 'note', label: 'Note', hint: 'General context' },
  { value: 'call_log', label: 'Call Log', hint: 'Phone summary' },
  { value: 'meeting_summary', label: 'Meeting', hint: 'Meeting recap' },
  { value: 'internal', label: 'Internal', hint: 'Team-only context' },
];

export function AddNoteDialog({
  open,
  onOpenChange,
  coachId,
  onCreated,
}: AddNoteDialogProps) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<NoteKind>('note');
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBody('');
      setKind('note');
      setPinned(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      setError('Body is required');
      return;
    }
    if (trimmed.length > 8000) {
      setError('Body must be 8,000 characters or fewer');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createCoachNote({
        coach_id: coachId,
        body: trimmed,
        kind,
        is_pinned: pinned,
      });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-note-title"
          className="w-full max-w-md bg-white rounded-2xl border border-warm-200/60 shadow-2xl pointer-events-auto"
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <IconNote size={16} className="text-primary-600" />
                </span>
                <h2 id="add-note-title" className="text-base font-semibold text-warm-900">
                  Add note
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label htmlFor="note-kind" className="block text-xs font-medium text-warm-700 mb-1">
                  Kind
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {KIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setKind(opt.value)}
                      className={cn(
                        'flex flex-col items-start text-left px-3 py-2 rounded-lg border transition-all',
                        kind === opt.value
                          ? 'border-primary-400 bg-primary-50/60 text-warm-900'
                          : 'border-warm-200/80 bg-white text-warm-700 hover:border-warm-300',
                      )}
                    >
                      <span className="text-xs font-semibold">{opt.label}</span>
                      <span className="text-eyebrow text-warm-500 mt-0.5">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="note-body" className="block text-xs font-medium text-warm-700">
                    Body <span className="text-red-500">*</span>
                  </label>
                  <span className="text-eyebrow text-warm-400 tabular-nums">
                    {body.length}/8000
                  </span>
                </div>
                <textarea
                  id="note-body"
                  rows={6}
                  autoFocus
                  required
                  maxLength={8000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What did you learn? Call summary, talking points, internal context..."
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="w-4 h-4 rounded border-warm-300 text-primary-600 focus:ring-primary-500/20"
                />
                <span className="text-sm text-warm-700">Pin to top</span>
              </label>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-100 bg-warm-50/40 rounded-b-2xl">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !body.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-xl shadow-sm transition-colors',
                  'bg-primary-600 text-white hover:bg-primary-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {submitting ? 'Saving...' : 'Add note'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconNote, IconX } from '@/components/icons';
import { createCoachNote } from '@/app/golf/actions/crm-foundations';
import { Button, IconButton } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape is handled by the dialog */}
      <div
        className="fixed inset-0 z-50 bg-nav-bg/35"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-note-title"
          className="w-full max-w-md bg-surface rounded-card border border-border-subtle shadow-raise pointer-events-auto"
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-fw-sm bg-accent-50 flex items-center justify-center">
                  <IconNote size={16} className="text-accent-700" />
                </span>
                <h2 id="add-note-title" className="text-base font-semibold text-text-primary">
                  Add note
                </h2>
              </div>
              <IconButton variant="default"
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
              >
                <IconX size={14} />
              </IconButton>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <label htmlFor="note-kind" className="block text-xs font-medium text-text-secondary mb-1">
                  Kind
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {KIND_OPTIONS.map((opt) => (
                    <Button variant="primary"
                      key={opt.value}
                      type="button"
                      onClick={() => setKind(opt.value)}
                      className={cn(
                        'flex flex-col items-start text-left px-3 py-2 rounded-fw-sm border transition-all',
                        kind === opt.value
                          ? 'border-accent-400 bg-accent-50/60 text-text-primary'
                          : 'border-border-subtle/80 bg-surface text-text-secondary hover:border-border-strong',
                      )}
                    >
                      <span className="text-xs font-semibold">{opt.label}</span>
                      <span className="text-eyebrow text-text-tertiary mt-0.5">{opt.hint}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="note-body" className="block text-xs font-medium text-text-secondary">
                    Body <span className="text-fw-danger">*</span>
                  </label>
                  <span className="text-eyebrow text-text-tertiary tabular-nums">
                    {body.length}/8000
                  </span>
                </div>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                <Textarea autoFocus
                  id="note-body"
                  rows={6}
                  required
                  maxLength={8000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What did you learn? Call summary, talking points, internal context..."
                  className="text-sm bg-surface resize-y"
                />
              </div>

              <Checkbox
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                label="Pin to top"
              />

              {error && (
                <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle bg-surface-sunken/60 rounded-b-card">
              <Button variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="primary"
                type="submit"
                disabled={submitting || !body.trim()}
                className={cn(
                  'px-4 py-1.5 text-sm font-semibold rounded-fw-md shadow-flat transition-colors',
                  'bg-accent-650 text-text-on-accent hover:bg-accent-700',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {submitting ? 'Saving...' : 'Add note'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

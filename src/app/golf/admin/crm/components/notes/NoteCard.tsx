'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import {
  IconBookmark,
  IconPencil,
  IconTrash,
  IconX,
} from '@/components/icons';
import {
  deleteCoachNote,
  updateCoachNote,
} from '@/app/golf/actions/crm-foundations';
import type {
  CrmNote,
  NoteKind,
} from '@/app/golf/admin/crm/types/foundations';

// ============================================================================
// NoteCard — single CrmNote tile (read / edit modes)
// ============================================================================

interface NoteCardProps {
  note: CrmNote;
  /** Author display label resolved by the parent panel (email or initials). */
  authorLabel?: string;
  /** Fired on optimistic mutation so the parent can update its list. */
  onChange?: (next: CrmNote) => void;
  /** Fired after a successful delete so the parent can drop the row. */
  onDelete?: (id: string) => void;
}

const KIND_LABEL: Record<NoteKind, string> = {
  note: 'Note',
  call_log: 'Call Log',
  meeting_summary: 'Meeting',
  internal: 'Internal',
};

const KIND_TONE: Record<NoteKind, string> = {
  note: 'bg-warm-100 text-warm-700 border-warm-200',
  call_log: 'bg-blue-50 text-blue-700 border-blue-200',
  meeting_summary: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  internal: 'bg-amber-50 text-amber-700 border-amber-200',
};

const PREVIEW_CHARS = 200;

export function NoteCard({
  note,
  authorLabel,
  onChange,
  onDelete,
}: NoteCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [draftKind, setDraftKind] = useState<NoteKind>(note.kind);
  const [draftPinned, setDraftPinned] = useState(note.is_pinned);
  const [showFull, setShowFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset draft if upstream changes (e.g. parent reloaded the list).
  useEffect(() => {
    if (!editing) {
      setDraft(note.body);
      setDraftKind(note.kind);
      setDraftPinned(note.is_pinned);
    }
  }, [note.body, note.kind, note.is_pinned, editing]);

  const relTime = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(note.created_at), { addSuffix: true });
    } catch {
      return '';
    }
  }, [note.created_at]);

  const isLong = note.body.length > PREVIEW_CHARS;
  const visibleBody = !editing && isLong && !showFull
    ? note.body.slice(0, PREVIEW_CHARS) + '...'
    : note.body;

  const beginEdit = () => {
    setEditing(true);
    setError(null);
    // Focus next tick once the textarea mounts.
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(note.body);
    setDraftKind(note.kind);
    setDraftPinned(note.is_pinned);
    setError(null);
  };

  const handleSave = async () => {
    if (!draft.trim()) {
      setError('Body cannot be empty');
      return;
    }
    if (draft.length > 8000) {
      setError('Body must be 8,000 characters or fewer');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCoachNote(note.id, {
        body: draft.trim(),
        kind: draftKind,
        is_pinned: draftPinned,
      });
      onChange?.(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Delete this note? This cannot be undone.');
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteCoachNote(note.id);
      onDelete?.(note.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'group relative rounded-2xl border bg-white px-4 py-3 transition-colors',
        note.is_pinned
          ? 'border-amber-200/80 bg-amber-50/30'
          : 'border-warm-200/60 hover:border-warm-300/80',
      )}
    >
      {/* Pin indicator */}
      {note.is_pinned && !editing && (
        <span
          aria-label="Pinned note"
          className="absolute -left-2 top-3 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white shadow-sm"
        >
          <IconBookmark size={10} />
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {editing ? (
            <select
              value={draftKind}
              onChange={(e) => setDraftKind(e.target.value as NoteKind)}
              className="text-eyebrow font-medium px-2 py-0.5 rounded-md border border-warm-200 bg-white text-warm-800 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {(Object.keys(KIND_LABEL) as NoteKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          ) : (
            <span
              className={cn(
                'inline-flex items-center text-eyebrow font-medium px-1.5 py-0.5 rounded-full border',
                KIND_TONE[note.kind],
              )}
            >
              {KIND_LABEL[note.kind]}
            </span>
          )}
          <span className="text-eyebrow text-warm-400 tabular-nums truncate">
            {relTime}
          </span>
        </div>

        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <IconButton variant="default"
              type="button"
              onClick={beginEdit}
              aria-label="Edit note"
              className="p-1 rounded-md text-warm-500 hover:text-warm-900 hover:bg-warm-100 transition-colors"
            >
              <IconPencil size={12} />
            </IconButton>
            <IconButton variant="default"
              type="button"
              onClick={handleDelete}
              disabled={busy}
              aria-label="Delete note"
              className="p-1 rounded-md text-warm-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <IconTrash size={12} />
            </IconButton>
          </div>
        )}
      </div>

      {/* Body */}
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            maxLength={8000}
            className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-warm-200/80 text-warm-900 placeholder:text-warm-400 resize-y focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-warm-700">
              <input
                type="checkbox"
                checked={draftPinned}
                onChange={(e) => setDraftPinned(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-warm-300 text-primary-600 focus:ring-primary-500/20"
              />
              Pin to top
            </label>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost"
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="px-2.5 py-1 text-xs text-warm-600 hover:text-warm-800 transition-colors disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1">
                  <IconX size={10} /> Cancel
                </span>
              </Button>
              <Button variant="primary"
                type="button"
                onClick={handleSave}
                disabled={busy || !draft.trim()}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-warm-800 leading-relaxed whitespace-pre-wrap break-words">
          {visibleBody}
          {isLong && !showFull && (
            <Button variant="ghost"
              type="button"
              onClick={() => setShowFull(true)}
              className="ml-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Show more
            </Button>
          )}
          {isLong && showFull && (
            <Button variant="ghost"
              type="button"
              onClick={() => setShowFull(false)}
              className="ml-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Show less
            </Button>
          )}
        </p>
      )}

      {/* Footer */}
      {!editing && (
        <div className="mt-2 text-eyebrow text-warm-400 truncate">
          {authorLabel ?? 'Unknown author'}
        </div>
      )}

      {error && (
        <p className="mt-2 text-eyebrow text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}

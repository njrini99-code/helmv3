'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  note: 'bg-surface-sunken text-text-secondary border-border-subtle',
  call_log: 'bg-surface-sunken text-text-secondary border-border-subtle',
  meeting_summary: 'bg-accent-50 text-accent-700 border-accent-200',
  internal: 'bg-fw-warning-bg text-fw-warning-ink border-fw-warning-ring',
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
        'group relative rounded-card border bg-surface px-4 py-3 transition-colors',
        note.is_pinned
          ? 'border-fw-warning-ring/80 bg-fw-warning-bg/30'
          : 'border-border-subtle hover:border-border-strong/80',
      )}
    >
      {/* Pin indicator */}
      {note.is_pinned && !editing && (
        <span
          aria-label="Pinned note"
          // `text-nav-bg` (warm-950) is the dark ink here on purpose: fw-warning
          // is a LIGHT amber in both themes, so cream/on-accent copy would fail
          // contrast, and text-text-primary inverts to cream after dusk.
          className="absolute -left-2 top-3 inline-flex items-center justify-center w-5 h-5 rounded-full bg-fw-warning text-nav-bg shadow-flat"
        >
          <IconBookmark size={10} />
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {editing ? (
            <Select
              value={draftKind}
              onChange={(value) => setDraftKind(value as NoteKind)}
              options={(Object.keys(KIND_LABEL) as NoteKind[]).map((k) => ({
                value: k,
                label: KIND_LABEL[k],
              }))}
              className="text-eyebrow font-medium px-2 py-0.5 rounded-fw-sm border border-border-subtle bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus/30"
            />
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
          <span className="text-eyebrow text-text-tertiary tabular-nums truncate">
            {relTime}
          </span>
        </div>

        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <IconButton variant="default"
              type="button"
              onClick={beginEdit}
              aria-label="Edit note"
              className="p-1 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
            >
              <IconPencil size={12} />
            </IconButton>
            <IconButton variant="default"
              type="button"
              onClick={handleDelete}
              disabled={busy}
              aria-label="Delete note"
              className="p-1 rounded-fw-sm text-text-tertiary hover:text-fw-danger-ink hover:bg-fw-danger-bg/50 transition-colors disabled:opacity-50"
            >
              <IconTrash size={12} />
            </IconButton>
          </div>
        )}
      </div>

      {/* Body */}
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            maxLength={8000}
            className="w-full px-3 py-2 text-sm rounded-fw-sm bg-surface border border-border-subtle/80 text-text-primary placeholder:text-text-tertiary resize-y focus:outline-none focus:ring-2 focus:ring-border-focus/30 focus:border-accent-400"
          />
          <div className="flex items-center justify-between gap-2">
            <Checkbox
              label="Pin to top"
              checked={draftPinned}
              onChange={(e) => setDraftPinned(e.target.checked)}
            />
            <div className="flex items-center gap-1.5">
              <Button variant="ghost"
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1">
                  <IconX size={10} /> Cancel
                </span>
              </Button>
              <Button variant="primary"
                type="button"
                onClick={handleSave}
                disabled={busy || !draft.trim()}
                className="px-3 py-1 text-xs font-semibold rounded-fw-sm bg-accent-650 text-text-on-accent hover:bg-accent-750 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words">
          {visibleBody}
          {isLong && !showFull && (
            <Button variant="ghost"
              type="button"
              onClick={() => setShowFull(true)}
              className="ml-1 text-xs text-accent-700 hover:text-fw-success-ink font-medium"
            >
              Show more
            </Button>
          )}
          {isLong && showFull && (
            <Button variant="ghost"
              type="button"
              onClick={() => setShowFull(false)}
              className="ml-1 text-xs text-accent-700 hover:text-fw-success-ink font-medium"
            >
              Show less
            </Button>
          )}
        </p>
      )}

      {/* Footer */}
      {!editing && (
        <div className="mt-2 text-eyebrow text-text-tertiary truncate">
          {authorLabel ?? 'Unknown author'}
        </div>
      )}

      {error && (
        <p className="mt-2 text-eyebrow text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}

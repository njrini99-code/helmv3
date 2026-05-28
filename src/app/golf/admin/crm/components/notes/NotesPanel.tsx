'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconNote, IconPlus } from '@/components/icons';
import { listCoachNotes } from '@/app/golf/actions/crm-foundations';
import type { CrmNote } from '@/app/golf/admin/crm/types/foundations';
import { AddNoteDialog } from './AddNoteDialog';
import { NoteCard } from './NoteCard';
import { Button } from '@/components/ui/button';

// ============================================================================
// NotesPanel — coach-scoped list of CrmNote rows. Self-contained:
// fetches via listCoachNotes(), exposes Add / Edit / Delete inline.
// ============================================================================

interface NotesPanelProps {
  coachId: string;
}

function sortNotes(notes: CrmNote[]): CrmNote[] {
  // Server already returns is_pinned DESC, created_at DESC — re-apply locally
  // so optimistic mutations (insert/update) preserve the same ordering.
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });
}

export function NotesPanel({ coachId }: NotesPanelProps) {
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCoachNotes(coachId);
      setNotes(sortNotes(rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreated = (created: CrmNote) => {
    setNotes((prev) => sortNotes([created, ...prev]));
  };

  const handleChanged = (next: CrmNote) => {
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === next.id ? next : n))));
  };

  const handleDeleted = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-warm-100 flex items-center justify-center">
            <IconNote size={14} className="text-warm-600" />
          </span>
          <h3 className="text-sm font-semibold text-warm-900">Notes</h3>
          {!loading && notes.length > 0 && (
            <span className="text-eyebrow text-warm-400 tabular-nums">
              {notes.length}
            </span>
          )}
        </div>
        <Button variant="primary"
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
        >
          <IconPlus size={12} /> Add note
        </Button>
      </div>

      {/* Body */}
      {loading && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl border border-warm-200/60 bg-warm-50/60 skeleton-shimmer"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!loading && !error && notes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-warm-200 bg-warm-50/40 px-4 py-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mx-auto mb-2 border border-warm-200/60">
            <IconNote size={18} className="text-warm-400" />
          </div>
          <p className="text-sm font-medium text-warm-700">No notes yet</p>
          <p className="text-xs text-warm-500 mt-1 max-w-sm mx-auto">
            Capture context, call notes, or anything you want to remember about
            this coach.
          </p>
        </div>
      )}

      {!loading && !error && notes.length > 0 && (
        <div className="space-y-2">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              authorLabel={authorLabel(note.author_id)}
              onChange={handleChanged}
              onDelete={handleDeleted}
            />
          ))}
        </div>
      )}

      <AddNoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        coachId={coachId}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function authorLabel(authorId: string | null): string {
  if (!authorId) return 'Unknown author';
  // Cheap stable display until the orchestrator wires a real user lookup.
  const tail = authorId.slice(0, 8);
  return `User ${tail}`;
}

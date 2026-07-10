'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { IconNote, IconEdit, IconTrash, IconClock } from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/sonner';
import { updateCoachNote, deleteCoachNote } from '@/app/baseball/actions/coach-notes';

interface Note {
  id: string;
  content: string;
  created_at: string;
  note_type?: string;
}

interface PlayerNotesSectionProps {
  notes: Note[];
  playerId?: string;
  coachId?: string;
  compact?: boolean;
}

export function PlayerNotesSection({ notes, compact = false }: PlayerNotesSectionProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  // Local, editable copy of the notes list so Save/Delete reflect immediately
  // without waiting on the parent server component's next render — kept in
  // sync whenever the parent re-fetches (e.g. after adding a new note).
  const [localNotes, setLocalNotes] = useState<Note[]>(notes);
  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditBody(note.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody('');
  }

  async function saveEdit(noteId: string) {
    const body = editBody.trim();
    if (!body) return;
    setSavingEdit(true);
    try {
      // updateCoachNote enforces author/head-coach permission server-side
      // (canAuthorScope) — a coach without permission simply gets a clear
      // error toast rather than a client-side guess at who may edit what.
      const result = await updateCoachNote({ noteId, body });
      if (result.success) {
        setLocalNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, content: body } : n)));
        setEditingId(null);
        setEditBody('');
        showToast('Note updated', 'success');
        router.refresh();
      } else {
        showToast(result.error || 'Failed to update note', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update note', 'error');
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    const noteId = deleteTargetId;
    setDeleting(true);
    try {
      const result = await deleteCoachNote({ noteId });
      if (result.success) {
        setLocalNotes((prev) => prev.filter((n) => n.id !== noteId));
        showToast('Note deleted', 'success');
        router.refresh();
      } else {
        showToast(result.error || 'Failed to delete note', 'error');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete note', 'error');
    } finally {
      setDeleting(false);
      setDeleteTargetId(null);
    }
  }

  if (localNotes.length === 0) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600/80">
          <IconNote size={22} />
        </div>
        <p className="text-sm font-medium text-warm-700">No notes yet</p>
        <p className="mt-1 text-xs leading-relaxed text-warm-500">
          Add notes to track observations and coaching points.
        </p>
      </div>
    );
  }

  const displayNotes = compact ? localNotes.slice(0, 3) : localNotes;

  return (
    <LazyMotion features={loadFeatures}>
      <ul className="space-y-3">
        {displayNotes.map((note, idx) => {
          const isExpanded = expandedNote === note.id;
          const isLong = note.content.length > 150;
          const panelId = `note-body-${note.id}`;
          const isEditing = editingId === note.id;

          return (
            <m.li
              key={note.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.22,
                delay: prefersReducedMotion ? 0 : Math.min(idx * 0.04, 0.2),
                ease: 'easeOut',
              }}
              className="bg-warm-50 rounded-xl p-4 group transition-colors hover:bg-warm-100/70"
            >
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={4}
                    disabled={savingEdit}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => saveEdit(note.id)}
                      disabled={savingEdit || !editBody.trim()}
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p
                      id={panelId}
                      className={`text-sm text-warm-700 leading-relaxed whitespace-pre-wrap ${
                        !isExpanded && isLong ? 'line-clamp-3' : ''
                      }`}
                    >
                      {note.content}
                    </p>

                    {isLong && (
                      <Button variant="ghost"
                        onClick={() => setExpandedNote(isExpanded ? null : note.id)}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-transparent mt-1 px-0 min-h-0"
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </Button>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-xs text-warm-400">
                      <span className="flex items-center gap-1">
                        <IconClock size={12} />
                        {new Date(note.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {note.note_type && (
                        <span className="px-1.5 py-0.5 bg-warm-200 rounded text-warm-500 capitalize">
                          {note.note_type}
                        </span>
                      )}
                    </div>
                  </div>

                  {!compact && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <IconButton
                        variant="default"
                        aria-label="Edit note"
                        onClick={() => startEdit(note)}
                        className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-cream-50 active:bg-cream-100/75 transition-colors"
                      >
                        <IconEdit size={14} />
                      </IconButton>
                      <IconButton
                        variant="default"
                        aria-label="Delete note"
                        onClick={() => setDeleteTargetId(note.id)}
                        className="p-1.5 rounded-lg text-warm-400 hover:text-[color:var(--notice-error-ink)] hover:bg-[var(--notice-error-ink)]/10 active:bg-[var(--notice-error-ink)]/20 transition-colors"
                      >
                        <IconTrash size={14} />
                      </IconButton>
                    </div>
                  )}
                </div>
              )}
            </m.li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete note?"
        message="This permanently deletes the note. This can't be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </LazyMotion>
  );
}

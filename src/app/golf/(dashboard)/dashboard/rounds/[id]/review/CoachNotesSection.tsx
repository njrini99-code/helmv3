'use client';

/**
 * CoachNotesSection — the coach-facing "Add note" affordance for a round
 * review, backed by the previously-inert `annotateReview` server action
 * (golf_round_reviews.coach_notes). Read-only for the player; editable only
 * for a coach on the player's team (mirrored server-side by
 * `verifyReviewAccess(..., 'player_or_coach')` + a `callerRole === 'coach'`
 * check inside `annotateReviewImpl`).
 *
 * Honest-empty: renders nothing for a player when no note exists yet, and an
 * inviting empty state for the coach ("Add a note").
 *
 * Renders its OWN header row (Eyebrow + Add note/Edit button) but no longer
 * wraps itself in a `Surface` — the caller (`RoundReviewFieldSheet.tsx`) sets
 * this under the story on a hairline, as bare type in the ledger's first
 * column (round-review.v3.md), rather than a standalone card.
 */

import { useEffect, useRef, useState } from 'react';
import { Eyebrow, Button, TextArea } from '@/components/fairway';
import { useToast } from '@/components/ui/sonner';
import { annotateReview } from '@/app/golf/actions/round-reviews';

export interface CoachNotesSectionProps {
  reviewId: string;
  initialNotes: string | null;
  /** True only for a coach on the player's team viewing someone else's round. */
  canEdit: boolean;
  /** A counter the caller increments to open the editor from elsewhere on the
   *  page — the masthead's "Add note" primary action (round-review.v3.md).
   *  Ignored for a viewer who cannot edit, so a player's page can never be
   *  nudged into an editor the server would reject, and the first render
   *  never opens it. */
  editSignal?: number;
}

/** Whether `CoachNotesSection` will render anything for this viewer/note
 *  combination — a player with no note yet renders nothing (see the
 *  component's own honest-empty guard below). The caller uses this to decide
 *  whether to include a "Coach notes" row in its seam at all, mirroring
 *  `hasFrontBackData`/`hasPuttingRampData`'s own exported-predicate pattern
 *  in `ReviewBreakdown.tsx` — never a padded empty row in the seam. */
export function hasCoachNotesContent(canEdit: boolean, notes: string | null): boolean {
  return canEdit || !!notes;
}

export function CoachNotesSection({ reviewId, initialNotes, canEdit, editSignal = 0 }: CoachNotesSectionProps) {
  const { addToast } = useToast();
  const [notes, setNotes] = useState(initialNotes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep local state in sync if the parent re-fetches a different review
  // (e.g. navigating between rounds without a full remount).
  useEffect(() => {
    setNotes(initialNotes);
    setDraft(initialNotes ?? '');
  }, [initialNotes, reviewId]);

  // The masthead's "Add note" action: open the editor here and bring it into
  // view, so the primary action reaches the one place a note is actually
  // written instead of duplicating the editor at the top of the page.
  const openedFor = useRef(editSignal);
  useEffect(() => {
    if (editSignal === openedFor.current) return;
    openedFor.current = editSignal;
    if (!canEdit) return;
    setDraft(notes ?? '');
    setEditing(true);
    containerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [editSignal, canEdit, notes]);

  // Nothing to show: a player with no note, or a coach view that hasn't been
  // granted edit rights (defensive — the page only mounts this with
  // canEdit=true for coaches).
  if (!canEdit && !notes) return null;

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      addToast({ type: 'error', title: 'Note cannot be empty' });
      return;
    }

    setSaving(true);
    try {
      const result = await annotateReview(reviewId, trimmed);
      if (result.success) {
        setNotes(trimmed);
        setEditing(false);
        addToast({ type: 'success', title: 'Note saved' });
      } else {
        addToast({ type: 'error', title: 'Failed to save note', description: result.error });
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to save note',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(notes ?? '');
    setEditing(false);
  }

  return (
    <div ref={containerRef} className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow as="h2">Coach notes</Eyebrow>
        {canEdit && !editing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(notes ?? '');
              setEditing(true);
            }}
          >
            {notes ? 'Edit' : 'Add note'}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Add a coaching note for this round…"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} busy={saving}>
              Save
            </Button>
          </div>
        </div>
      ) : notes ? (
        <p className="whitespace-pre-wrap font-fw-sans text-body-sm text-text-primary">{notes}</p>
      ) : (
        <p className="font-fw-sans text-body-sm text-text-tertiary">No coaching note yet.</p>
      )}
    </div>
  );
}

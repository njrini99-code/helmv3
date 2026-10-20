'use client';

import { CirclePlay, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { haptic } from '../../../lib/haptics';
import { Modal } from '../../../ui/Modal';
import { factsLine, failureLine } from './labels';
import { DiscardConfirm, Opt, Opts, RoundFacts, useAgo, useErrorHaptic } from './parts';

/**
 * CH-11514: starting a round found that the player already has one in
 * progress for the same course and date (the 36-hole-day prompt,
 * `inProgressConflictDialog` in new-round-client). It is not "a round in
 * progress somewhere else": the server matched this course, date and
 * qualifier slot, and only when that round holds real progress (an empty
 * shell is reused silently and never asks). Nothing here happens on its own.
 *
 * It is drawn in the board's own pieces (rounds-track.jsx and the Library's
 * in-progress card, rounds-flow.jsx `rf-unf`): the track Sheet, the exit
 * sheet's round card (`rt-exitc`: holes scored as a count and a bar, the
 * course, "In progress · updated 2h ago", in the card's "In progress" voice)
 * and `rt-opt` rows. The card has no tees, type or start time because the
 * legacy conflict signal carries only the round's id, scored holes and last
 * update; the rows never invent them.
 *
 * Three choices, as the legacy prompt has them:
 *  - Resume: open that round to continue it (the primary row).
 *  - Start a new round: keep that round and begin a genuinely separate one
 *    (a second round on a 36-hole day). It bypasses only the in-progress
 *    check.
 *  - Discard: delete that round, then start this one. It is destructive, so
 *    it asks again (CH-11515, the exit sheet's discard question) with the
 *    round's scored holes and last update, and the warning haptic fires on
 *    that second tap, before `onDiscard` (D-70). A failure (CH-11009) shows in
 *    the question, where the legacy screen put it on the page behind the
 *    dialog.
 *
 * There is no Cancel button in the legacy prompt; closing it (Esc, the
 * backdrop, the close button) dismisses it and starts nothing, and can't
 * happen while `busy`. It is presentational: the parent owns the conflict and
 * runs the three actions.
 */
export function InProgressConflictDialog({
  open,
  course,
  scoredHoles,
  holesTotal = null,
  updatedAt,
  now,
  busy,
  error,
  onResume,
  onStartSeparate,
  onDiscard,
  onClose,
}: {
  open: boolean;
  /** The course being started, when known; the copy says "this course and date" without it. */
  course: string | null;
  /** Holes with a score in the round that is in progress (`inProgressConflict.scoredHoles`). */
  scoredHoles: number;
  /** That round's holes (9 or 18), when the parent knows them; the card has no bar without it. */
  holesTotal?: number | null;
  /** When that round was last saved (`inProgressConflict.updatedAt`, ISO), or null. */
  updatedAt: string | null;
  /** A fixed "now" for a preview or a test; live otherwise. */
  now?: Date | number;
  /** One of the three actions is running (the legacy `conflictActionBusy`). Every row waits. */
  busy: boolean;
  /**
   * Why the discard failed, in words, or null. It fires the error haptic once
   * per new message, so clear it when Discard is tapped again.
   */
  error: string | null;
  /** Open the other round to continue it. */
  onResume: () => void;
  /** Keep the other round and start a separate one. */
  onStartSeparate: () => void;
  /** The confirmed discard: delete the other round, then start this one. */
  onDiscard: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);
  useErrorHaptic(error);
  const ago = useAgo(updatedAt, now);
  const scored = scoredHoles > 0 ? `${scoredHoles} scored ${scoredHoles === 1 ? 'hole' : 'holes'}` : 'no scored holes yet';
  const where = course?.trim() ? `${course.trim()} on this date` : 'this course and date';

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Round already in progress"
      description={`You already have a round in progress for ${where}.`}
      icon={TriangleAlert}
      width={480}
      code="CH-11514"
    >
      <RoundFacts
        count={scoredHoles}
        of={holesTotal}
        title={course?.trim() || 'Round in progress'}
        line={factsLine({ lead: 'In progress', when: ago ? `updated ${ago}` : null })}
      />
      {confirming ? (
        <DiscardConfirm
          code="CH-11515"
          label="Discard the round in progress"
          title="Discard this round?"
          body={`It has ${scored}${ago ? `, last updated ${ago}` : ''}. This can’t be undone.`}
          error={error ? failureLine('Couldn’t discard the round.', error, 'It is still saved. Try again, or resume it instead.') : null}
          errorCode="CH-11009"
          busy={busy}
          onKeep={() => setConfirming(false)}
          onDiscard={onDiscard}
        />
      ) : (
        <Opts>
          <Opt
            tone="primary"
            icon={CirclePlay}
            label="Resume"
            hint="Continue that round where you left off."
            disabled={busy}
            onClick={() => {
              haptic('press');
              onResume();
            }}
          />
          <Opt icon={Plus} label="Start a new round" hint="Keeps that round. For a second round on a 36-hole day." disabled={busy} onClick={onStartSeparate} />
          <Opt icon={Trash2} tone="danger" label="Discard" hint="Deletes that round, then starts this one. You’ll be asked first." disabled={busy} onClick={() => setConfirming(true)} />
        </Opts>
      )}
    </Modal>
  );
}

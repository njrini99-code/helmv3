'use client';

import { ArrowLeft, Bookmark, Target, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { haptic } from '../../../lib/haptics';
import { Modal } from '../../../ui/Modal';
import { failureLine } from './labels';
import { DiscardConfirm, Opt, Opts, useErrorHaptic } from './parts';

/** What the sheet says when the submit refused without a sentence of its own. */
export const QUALIFIER_CLOSED_REASON = 'This qualifier has already been completed. Rounds can no longer be submitted.';

/**
 * CH-11516: a round that can't be submitted to its qualifier, with a way out.
 * Open this, and not the generic "The round didn't submit" (CH-11005), only
 * when the submit was refused because the coach closed the qualifier the round
 * was entered in. The exact legacy condition (`isQualifierClosedError` in
 * `src/lib/golf/round-missing-recovery.ts`, set as `qualifierClosed` in both
 * round screens): the refusal message, lower-cased, contains both "qualifier"
 * and "already been completed" (the server's sentence is "This qualifier has
 * already been completed. Rounds can no longer be submitted."). Any other
 * submit failure keeps Try again. Practice is offered for this one refusal
 * only; the legacy screens have no equivalent for a tournament round.
 *
 * It is the exit sheet's shape (rounds-track.jsx): the track Sheet with its
 * sub, then `rt-opt` rows with Save as practice round as the primary; the
 * Discard row asks again as the exit sheet's does (CH-11507's pattern).
 *
 * Try again is absent on purpose: the same payload would be refused forever
 * (and redirecting to the round bounces back, since the round is still in
 * progress). The round is saved, so nothing is lost. The choices are the
 * legacy overlay's:
 *  - Save as practice round (the primary): `updateRoundType(roundId,
 *    'practice')` clears the qualifier link on the saved round without
 *    changing its status, so the same submit then works. Needs a saved round.
 *    It no longer counts toward the qualifier. A failure shows here (CH-11012);
 *    on success the parent closes the sheet and shows "Saved as a practice
 *    round".
 *  - Save for later ("Save & exit"): optional, drawn only with `onSaveForLater`.
 *  - Go back: back to the scorecard, where the finish summary shows again.
 *    Esc, the backdrop and the close button do the same.
 *  - Discard round: optional, drawn only with `onDiscard`. Destructive: it
 *    asks again (CH-11517) and the warning haptic fires on that second tap,
 *    before `onDiscard` (D-70). The legacy overlay discarded on one tap.
 *
 * Save for later and Discard can fail too; the parent reports those with
 * `useEntryFailureToast` (CH-11010, CH-11011), which renders inside this
 * dialog. `pending` names the write that is running; every row waits.
 */
export function SaveAsPracticeSheet({
  open,
  reason,
  pending,
  error,
  onSaveAsPractice,
  onSaveForLater,
  onGoBack,
  onDiscard,
}: {
  open: boolean;
  /** The server's refusal (the legacy `error`), a sentence naming the closed qualifier; a default is said without it. */
  reason: string | null;
  /** Which write is running, or null. */
  pending: 'practice' | 'save' | 'discard' | null;
  /**
   * Why changing the round to practice failed, in words, or null. It fires
   * the error haptic once per new message, so clear it when the row is
   * tapped again.
   */
  error: string | null;
  onSaveAsPractice: () => void;
  onSaveForLater?: () => void;
  onGoBack: () => void;
  /** The confirmed discard. */
  onDiscard?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);
  useErrorHaptic(error);
  const busy = pending !== null;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onGoBack}
      title="This qualifier is closed"
      description={`${reason?.trim() || QUALIFIER_CLOSED_REASON} Your round and every shot are saved.`}
      icon={TriangleAlert}
      width={480}
      code="CH-11516"
    >
      {error && !confirming && (
        <p className="ch-rt-error" role="alert" data-ch-code="CH-11012">
          {failureLine('Couldn’t change this round to practice.', error, 'Your round is still saved. Try again in a moment.')}
        </p>
      )}
      {confirming && onDiscard ? (
        <DiscardConfirm
          code="CH-11517"
          label="Discard this round"
          title="Discard this round?"
          body="It deletes every shot you entered. This can’t be undone."
          busy={pending === 'discard'}
          onKeep={() => setConfirming(false)}
          onDiscard={onDiscard}
        />
      ) : (
        <Opts>
          <Opt
            tone="primary"
            icon={Target}
            label={pending === 'practice' ? 'Saving as practice…' : 'Save as practice round'}
            hint="Changes its type so you can submit it. It won’t count toward the qualifier."
            disabled={busy}
            onClick={() => {
              haptic('press');
              onSaveAsPractice();
            }}
          />
          {onSaveForLater && <Opt icon={Bookmark} label={pending === 'save' ? 'Saving…' : 'Save for later'} hint="Continue it from Rounds." disabled={busy} onClick={onSaveForLater} />}
          <Opt icon={ArrowLeft} label="Go back" hint="Back to your scorecard." disabled={busy} onClick={onGoBack} />
          {onDiscard && <Opt icon={Trash2} tone="danger" label="Discard round" hint="Deletes every shot. You’ll be asked first." disabled={busy} onClick={() => setConfirming(true)} />}
        </Opts>
      )}
    </Modal>
  );
}

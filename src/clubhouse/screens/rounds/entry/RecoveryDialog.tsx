'use client';

import { History, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { haptic } from '../../../lib/haptics';
import { Modal } from '../../../ui/Modal';
import { factsLine, failureLine } from './labels';
import { DiscardConfirm, Opt, Opts, RoundFacts, useAgo, useErrorHaptic } from './parts';

/**
 * CH-11512: a round saved on this device was found when the round screen
 * opened, one the player never finished (the app was interrupted, or the tab
 * closed). The legacy screens ask with "Recover Unsaved Progress?" and
 * Restore or Discard (`recoveryDialog` in new-round-client, the emergency-save
 * dialog in continue-round-client). It is presentational: the parent owns the
 * snapshot and the two actions.
 *
 * It is drawn in the board's own pieces (rounds-track.jsx): the track Sheet
 * (title and sub), the exit sheet's round card (`rt-exitc`: holes done as a
 * count and a bar, the course, "Blue tees · Practice · saved 5 min ago"), and
 * `rt-opt` rows, the primary one being Restore.
 *
 * Restore writes the snapshot to the server and then opens the round, so it
 * can take a moment (`restoring`), and it can fail (`error`, CH-11008, drawn
 * here above the rows: the legacy screens set the failure on the page behind
 * the open dialog, where it was never seen).
 *
 * Discard deletes only the copy saved on this device (`clearEmergencySave`); a
 * round already on the server is untouched. It is destructive, so it asks once
 * more (CH-11513, the exit sheet's discard question) and the warning haptic
 * fires on that second tap, before `onDiscard` (D-70). Closing without
 * choosing (Esc, the backdrop, the close button) hides the dialog and keeps
 * the saved copy, as the legacy dialog does; it can't close while a restore
 * runs.
 */
export function RecoveryDialog({
  open,
  course,
  tees,
  type,
  holesDone,
  holesTotal,
  savedAt,
  now,
  restoring,
  error,
  onRestore,
  onDiscard,
  onClose,
}: {
  open: boolean;
  /** The saved round's course (`setupData.courseName`); null or empty when the snapshot has none. */
  course: string | null;
  /** The saved round's tees (`setupData.teesPlayed`), when it has them. */
  tees?: string | null;
  /** The saved round's type (`setupData.roundType`: practice, tournament or qualifier), when known. */
  type?: string | null;
  /** Holes with a finished score in the snapshot (`completedHoleStats` that are set). 0 means it holds only shots on a hole in progress. */
  holesDone: number;
  /** 9 or 18 (the snapshot's `holes.length`), or null when unknown. */
  holesTotal: number | null;
  /** When the snapshot was written (`EmergencySaveData.timestamp`, epoch ms). */
  savedAt: number | null;
  /** A fixed "now" for a preview or a test; live otherwise. */
  now?: Date | number;
  /** The restore is running (the legacy `isRestoringRecovery`). Both rows wait and the dialog can't close. */
  restoring: boolean;
  /**
   * Why the restore failed, in words (the legacy `describeRoundWriteFailure`
   * sentence, or a plain message), or null. It fires the error haptic once per
   * new message, so clear it when Restore is tapped again.
   */
  error: string | null;
  onRestore: () => void;
  /** The confirmed discard: clears the device copy. */
  onDiscard: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);
  useErrorHaptic(error);
  const ago = useAgo(savedAt, now);
  const name = course?.trim() || 'Your saved round';

  return (
    <Modal
      open={open}
      onClose={restoring ? () => {} : onClose}
      title="Recover unsaved progress"
      description="Saved on this device. It may have been saved when the app was interrupted."
      icon={History}
      width={460}
      code="CH-11512"
    >
      <RoundFacts
        count={holesDone}
        of={holesTotal}
        title={name}
        line={factsLine({ lead: holesDone <= 0 ? 'Shots on a hole in progress' : null, tees, type, when: ago ? `saved ${ago}` : null })}
      />
      {error && !confirming && (
        <p className="ch-rt-error" role="alert" data-ch-code="CH-11008">
          {failureLine('Couldn’t restore your saved shots.', error, 'They are still on this device. Keep this screen open and try again.')}
        </p>
      )}
      {confirming ? (
        <DiscardConfirm
          code="CH-11513"
          label="Discard the saved shots"
          title="Discard the saved shots?"
          body={`The copy of ${course?.trim() ? `your round at ${course.trim()}` : 'this round'} saved on this device is deleted. This can’t be undone.`}
          busy={false}
          discardLabel="Discard shots"
          onKeep={() => setConfirming(false)}
          onDiscard={onDiscard}
        />
      ) : (
        <Opts>
          <Opt
            tone="primary"
            icon={History}
            label={restoring ? 'Restoring…' : 'Restore round'}
            hint={restoring ? 'Keep this screen open.' : 'Saves it, then opens the round where you left off.'}
            disabled={restoring}
            onClick={() => {
              haptic('press');
              onRestore();
            }}
          />
          <Opt icon={Trash2} tone="danger" label="Discard saved shots" hint="Deletes the copy on this device. You’ll be asked first." disabled={restoring} onClick={() => setConfirming(true)} />
        </Opts>
      )}
    </Modal>
  );
}

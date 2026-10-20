'use client';

import { useCallback } from 'react';
import { haptic } from '../../../lib/haptics';
import { useToast, type ToastInput } from '../../../ui/Toast';
import { reasonText } from './labels';

/**
 * The failures the round screen reports as toasts, where no dialog holds an
 * inline line:
 *  - `save-for-later` (CH-11010): Save for later couldn't write the round.
 *    Legacy `handleSaveForLater` throws the failure into the Exit sheet, or
 *    (from the submit overlay's Save & exit) into nothing at all; a toast
 *    reaches both, since toasts render inside an open dialog (CH-1812).
 *  - `discard-round` (CH-11011): Discard couldn't delete the round, from a
 *    surface with no discard question to hold the line (the Exit sheet's own
 *    question already does, CH-11006). Legacy `handleDeleteRound` put this on
 *    the page behind the closed sheet, or in a toast on Continue.
 *  - `round-updated` (CH-11902): a save was refused because the round changed
 *    on another device. The action is Reload, not Retry: a retry would be
 *    refused again.
 */
export type EntryFailure = 'save-for-later' | 'discard-round' | 'round-updated';

export interface EntryFailureOptions {
  /** The round's course, for the title ("Couldn't save your round at Finley GC"). */
  course?: string | null;
  /** The failure the round action returned (`result.error`); a bare signal key ("busy") is turned into its sentence. */
  reason?: string | null;
  /** What the action button does: Retry for the first two, Reload for `round-updated`. */
  run: () => void;
}

/**
 * The toast, in the shape useAction gives its failures: an error tone, what
 * failed, the reason if readable else what to do next, an action, and the
 * catalog number. Pure, so a test or a caller can read it without a provider.
 */
export function entryFailureToast(kind: EntryFailure, { course, reason, run }: EntryFailureOptions): ToastInput {
  const at = course?.trim() ? ` at ${course.trim()}` : '';
  switch (kind) {
    case 'save-for-later':
      return {
        tone: 'error',
        title: `Couldn’t save your round${at}`,
        body: reasonText(reason) ?? 'Your shots are still on this device. Check your connection, then try again.',
        action: { label: 'Retry', run },
        code: 'CH-11010',
      };
    case 'discard-round':
      return {
        tone: 'error',
        title: `Couldn’t discard the round${at}`,
        body: reasonText(reason) ?? 'It is still saved. Try again, or keep playing.',
        action: { label: 'Retry', run },
        code: 'CH-11011',
      };
    case 'round-updated':
      return {
        tone: 'error',
        title: 'This round was updated on another device',
        body: 'Saving is paused until you reload, so this device can’t overwrite the newer round.',
        action: { label: 'Reload', run },
        code: 'CH-11902',
      };
  }
}

/**
 * Report a failure: the error haptic (D-70) and the toast, as useAction does.
 * For a round screen that gets the failure back from the engine itself. An
 * action already wired through useAction reports its own failure; don't
 * report it twice.
 */
export function useEntryFailureToast(): (kind: EntryFailure, options: EntryFailureOptions) => void {
  const toast = useToast();
  return useCallback(
    (kind, options) => {
      haptic('error');
      toast(entryFailureToast(kind, options));
    },
    [toast],
  );
}

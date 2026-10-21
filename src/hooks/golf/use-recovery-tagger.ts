'use client';

/**
 * The recovery tap's write (CoachHelm Slice 8b): set, on a tee shot already
 * in this hole's history, whether the next shot was a recovery. It goes the
 * way the one-tap putt-miss prompt goes (`use-putt-miss-tagger.ts`): the
 * reducer, then `onAutoSave` with the updated hole, whose synchronous device
 * copy lands first and whose server copy the state machine retries, holds
 * offline and resends like every other one. No second queue.
 *
 * It takes the shared `shotMutationInFlightRef` that Edit, Undo and the putt
 * tag use for as long as its full-hole snapshot runs, so a tap followed at
 * once by an edit or an undo cannot let the older snapshot overwrite it.
 * While another mutation holds the lock the tap is refused (returns false).
 *
 * Returns true when the answer was applied, synchronously.
 */

import { useCallback } from 'react';
import type { MutableRefObject, Dispatch } from 'react';
import type { ShotRecord } from '@/lib/types/golf';
import type { ShotAction } from '@/hooks/golf/use-shot-state-machine';
import { setLieAfterRecovery } from '@/lib/golf/data-prompts/recovery';

export interface RecoveryTaggerDeps {
  shotHistory: ShotRecord[];
  dispatch: Dispatch<ShotAction>;
  onAutoSave?: (shots: ShotRecord[], holeIndex: number) => Promise<void>;
  autoSaveDisabled?: boolean;
  currentHoleIndex: number;
  shotMutationInFlightRef: MutableRefObject<boolean>;
}

export function useRecoveryTagger({
  shotHistory,
  dispatch,
  onAutoSave,
  autoSaveDisabled,
  currentHoleIndex,
  shotMutationInFlightRef,
}: RecoveryTaggerDeps) {
  return useCallback(
    (shotNumber: number, recovery: boolean): boolean => {
      if (shotMutationInFlightRef.current) return false;
      const updated = setLieAfterRecovery(shotHistory, shotNumber, recovery);
      if (updated === shotHistory) return false;
      dispatch({ type: 'TAG_LIE_AFTER_RECOVERY', payload: { shotNumber, recovery } });
      if (!onAutoSave || autoSaveDisabled) return true;

      shotMutationInFlightRef.current = true;
      void (async () => {
        try {
          await onAutoSave(updated, currentHoleIndex);
        } catch {
          // As for an edit or the putt tag: the state machine's own save of
          // the changed history tracks and retries a rejected background
          // save; the answer is already on screen and in the device copy.
        } finally {
          shotMutationInFlightRef.current = false;
        }
      })();
      return true;
    },
    [shotHistory, dispatch, onAutoSave, autoSaveDisabled, currentHoleIndex, shotMutationInFlightRef],
  );
}

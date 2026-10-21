'use client';

/**
 * The one-tap data-gap prompt's write (CoachHelm Slice 8a): tag a putt
 * already in this hole's history. It goes the way any change to a recorded
 * shot goes (the edit path's tail): the reducer, then `onAutoSave` with the
 * updated hole, whose synchronous device copy lands first and whose server
 * save the state machine retries, holds offline and resends like every other
 * save. No second queue, no point update.
 *
 * It takes the shared `shotMutationInFlightRef` that Edit and Undo use
 * (`use-edit-shot-modal.ts`, `use-undo-manager.ts`) for as long as its
 * full-hole snapshot save runs, and releases it in `finally`, so a tap
 * followed at once by an edit or an undo cannot let the older tagged
 * snapshot overwrite the edit or bring back an undone shot. While another
 * mutation holds the lock the tap is refused (returns false) and the prompt
 * stays as it was.
 *
 * Returns true when the tag was applied: synchronously, so the screen can
 * show it at once; the save runs behind it.
 */

import { useCallback } from 'react';
import type { MutableRefObject, Dispatch } from 'react';
import type { PuttMissTag, ShotRecord } from '@/lib/types/golf';
import { tagPuttMiss, type ShotAction } from '@/hooks/golf/use-shot-state-machine';

export interface PuttMissTaggerDeps {
  shotHistory: ShotRecord[];
  dispatch: Dispatch<ShotAction>;
  onAutoSave?: (shots: ShotRecord[], holeIndex: number) => Promise<void>;
  autoSaveDisabled?: boolean;
  currentHoleIndex: number;
  shotMutationInFlightRef: MutableRefObject<boolean>;
}

export function usePuttMissTagger({
  shotHistory,
  dispatch,
  onAutoSave,
  autoSaveDisabled,
  currentHoleIndex,
  shotMutationInFlightRef,
}: PuttMissTaggerDeps) {
  return useCallback(
    (shotNumber: number, tag: PuttMissTag): boolean => {
      if (shotMutationInFlightRef.current) return false;
      const updated = tagPuttMiss(shotHistory, shotNumber, [tag]);
      if (updated === shotHistory) return false;
      dispatch({ type: 'TAG_PUTT_MISS', payload: { shotNumber, tags: [tag] } });
      if (!onAutoSave || autoSaveDisabled) return true;

      shotMutationInFlightRef.current = true;
      void (async () => {
        try {
          await onAutoSave(updated, currentHoleIndex);
        } catch {
          // Same as an edit (use-edit-shot-modal): a rejection here is the
          // background save, which the state machine's own save of the
          // changed history tracks and retries; the tag is already on screen
          // and in the device copy.
        } finally {
          shotMutationInFlightRef.current = false;
        }
      })();
      return true;
    },
    [shotHistory, dispatch, onAutoSave, autoSaveDisabled, currentHoleIndex, shotMutationInFlightRef],
  );
}

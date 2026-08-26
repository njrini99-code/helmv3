import { useCallback, useRef } from 'react';
import type { ShotRecord, HoleStats, RoundHole } from '@/lib/types/golf';
import { deleteShot } from '@/app/golf/actions/golf';
import type { ShotTrackingState, ShotAction } from './use-shot-state-machine';

interface UseUndoManagerParams {
  state: ShotTrackingState;
  dispatch: React.Dispatch<ShotAction>;
  currentHole: RoundHole;
  currentHoleIndex: number;
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  /** `null` means the undo reopened a previously completed hole. */
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats | null) => void | Promise<void>;
  calculateHoleStats: (shots: ShotRecord[], hole: RoundHole) => HoleStats;
  /** Shared with Edit Shot so one local round cannot mutate the same shot twice. */
  shotMutationInFlightRef: React.MutableRefObject<boolean>;
}

export function useUndoManager({
  state,
  dispatch,
  currentHole,
  currentHoleIndex,
  onAutoSave,
  onHoleStatsUpdate,
  calculateHoleStats,
  shotMutationInFlightRef,
}: UseUndoManagerParams) {
  // Refs to avoid stale closures in async callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  const currentHoleRef = useRef(currentHole);
  currentHoleRef.current = currentHole;
  const currentHoleIndexRef = useRef(currentHoleIndex);
  currentHoleIndexRef.current = currentHoleIndex;
  const onAutoSaveRef = useRef(onAutoSave);
  onAutoSaveRef.current = onAutoSave;
  const onHoleStatsUpdateRef = useRef(onHoleStatsUpdate);
  onHoleStatsUpdateRef.current = onHoleStatsUpdate;

  const handleUndoLastShot = useCallback(async () => {
    const shotHistory = stateRef.current.shotHistory;
    if (shotHistory.length === 0) return;
    if (shotMutationInFlightRef.current) return;

    shotMutationInFlightRef.current = true;
    dispatch({ type: 'UNDO_START' });

    try {
      const lastShot = shotHistory[shotHistory.length - 1]!;

      if (lastShot.id) {
        const result = await deleteShot(lastShot.id);
        // A stale local ID means the authoritative server state already has
        // this shot removed. Reconcile the local history; do not retry a
        // destructive mutation or show the golfer a false failure.
        if (!result.success && result.code !== 'shot_not_found') {
          dispatch({ type: 'UNDO_FAIL', payload: 'Server failed to delete the shot. Your data is safe — please try again.' });
          return;
        }
      }

      // Read latest shotHistory from ref after async operation
      const newHistory = stateRef.current.shotHistory.slice(0, -1);
      dispatch({ type: 'UNDO_COMPLETE', payload: { newHistory } });

      // Keep a reopened hole out of the parent completed-scorecard data. The
      // next auto-save will carry its remaining shots as in-progress progress.
      const isStillComplete = newHistory.length > 0 && newHistory[newHistory.length - 1]?.result === 'hole';
      if (onHoleStatsUpdateRef.current) {
        const holeStats = isStillComplete
          ? calculateHoleStats(newHistory, currentHoleRef.current)
          : null;
        await onHoleStatsUpdateRef.current(currentHoleIndexRef.current, holeStats);
      }

      if (onAutoSaveRef.current) {
        await onAutoSaveRef.current(newHistory, currentHoleIndexRef.current);
      }
    } catch (error) {
      console.error('Error undoing shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'UNDO_FAIL', payload: 'A network error occurred while undoing the shot. Check your connection and try again.' });
    } finally {
      shotMutationInFlightRef.current = false;
    }
  }, [dispatch, calculateHoleStats, shotMutationInFlightRef]);

  return { handleUndoLastShot };
}

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
  onHoleStatsUpdate?: (holeIndex: number, stats: HoleStats) => void;
  calculateHoleStats: (shots: ShotRecord[], hole: RoundHole) => HoleStats;
}

export function useUndoManager({
  state,
  dispatch,
  currentHole,
  currentHoleIndex,
  onAutoSave,
  onHoleStatsUpdate,
  calculateHoleStats,
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

    dispatch({ type: 'UNDO_START' });

    try {
      const lastShot = shotHistory[shotHistory.length - 1]!;

      if (lastShot.id) {
        const result = await deleteShot(lastShot.id);
        if (!result.success) {
          dispatch({ type: 'UNDO_FAIL' });
          return;
        }
      }

      // Read latest shotHistory from ref after async operation
      const newHistory = stateRef.current.shotHistory.slice(0, -1);
      dispatch({ type: 'UNDO_COMPLETE', payload: { newHistory } });

      // Recalculate if hole was complete
      const isStillComplete = newHistory.length > 0 && newHistory[newHistory.length - 1]?.result === 'hole';
      if (isStillComplete && onHoleStatsUpdateRef.current) {
        const holeStats = calculateHoleStats(newHistory, currentHoleRef.current);
        onHoleStatsUpdateRef.current(currentHoleIndexRef.current, holeStats);
      }

      if (onAutoSaveRef.current) {
        await onAutoSaveRef.current(newHistory, currentHoleIndexRef.current);
      }
    } catch (error) {
      console.error('Error undoing shot:', error instanceof Error ? error.message : String(error));
      dispatch({ type: 'UNDO_FAIL' });
    }
  }, [dispatch, calculateHoleStats]);

  return { handleUndoLastShot };
}

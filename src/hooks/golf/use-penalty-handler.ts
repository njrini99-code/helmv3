import { useCallback } from 'react';
import type { ShotRecord, RoundHole } from '@/lib/types/golf';
import type { ShotTrackingState, ShotAction } from './use-shot-state-machine';

export type PenaltyType = NonNullable<ShotRecord['penaltyType']>;

/** OB and lost ball are stroke AND distance: the next stroke is replayed from the original spot. */
export const STROKE_AND_DISTANCE_PENALTIES: ReadonlySet<PenaltyType> = new Set(['ob', 'lost']);

/**
 * Build the penalty row for the shot the player just recorded.
 *
 * The row is a stroke of its own (the scorecard counts rows), and its
 * `lieBefore` / `distanceToHoleAfter` are where the ball is played from NEXT —
 * that is what the reducer and the continue-round reload restore position from.
 *
 * - Water / unplayable: the player drops and plays on from where they said the
 *   ball finished, so the row keeps the current position (two rows, correct).
 * - OB / lost: stroke and distance. The ball goes back to where the errant shot
 *   was hit from — its `lieBefore` and `distanceToHoleBefore` — so the next
 *   stroke is entered from there (the re-tee at full yardage). Before this, the
 *   row copied the provisional's landing spot and the replayed stroke was never
 *   recorded: 24 of 37 OB tee shots and 24 of 29 lost balls in the 90 days to
 *   2026-09-09 scored one stroke short.
 *
 * Stats charge the penalty to the shot that earned it (the preceding real shot
 * on the hole — see getPenaltyCategory), so the row's own position no longer
 * decides the strokes-gained category either way.
 */
export function buildPenaltyShot(
  state: Pick<ShotTrackingState, 'shotHistory' | 'currentShot' | 'currentLie' | 'distanceToHole' | 'distanceUnit'>,
  penaltyType: PenaltyType,
): ShotRecord {
  const offending = [...state.shotHistory].reverse().find(s => !s.isPenalty) ?? null;
  const strokeAndDistance = STROKE_AND_DISTANCE_PENALTIES.has(penaltyType) && offending !== null;

  const lieBefore = strokeAndDistance ? offending.lieBefore : state.currentLie;
  const distanceToHoleAfter = strokeAndDistance ? offending.distanceToHoleBefore : state.distanceToHole;
  const distanceUnitAfter = strokeAndDistance ? offending.distanceUnitBefore : state.distanceUnit;

  return {
    shotNumber: state.currentShot,
    shotType: 'penalty',
    clubType: 'non_driver',
    lieBefore,
    distanceToHoleBefore: distanceToHoleAfter,
    distanceUnitBefore: distanceUnitAfter,
    result: 'penalty',
    distanceToHoleAfter,
    distanceUnitAfter,
    shotDistance: 0,
    isPenalty: true,
    penaltyType,
  };
}

interface UsePenaltyHandlerParams {
  state: ShotTrackingState;
  dispatch: React.Dispatch<ShotAction>;
  currentHole: RoundHole;
  onSaveShot?: (shot: ShotRecord) => void;
}

export function usePenaltyHandler({
  state,
  dispatch,
  onSaveShot,
}: UsePenaltyHandlerParams) {
  const handleAddPenalty = useCallback(() => {
    dispatch({ type: 'SHOW_PENALTY_MODAL' });
  }, [dispatch]);

  const confirmPenalty = useCallback(() => {
    if (!state.penaltyType) return;
    if (state.shotHistory.some(s => s.result === 'hole')) return;

    const penaltyShot = buildPenaltyShot(state, state.penaltyType as PenaltyType);

    dispatch({ type: 'CONFIRM_PENALTY', payload: penaltyShot });
    onSaveShot?.(penaltyShot);
  }, [state, dispatch, onSaveShot]);

  return { handleAddPenalty, confirmPenalty };
}

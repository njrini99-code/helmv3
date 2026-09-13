import { useCallback } from 'react';
import type { ShotRecord, RoundHole } from '@/lib/types/golf';
import { getShotTypeFromState, type PenaltyOrigin, type ShotTrackingState, type ShotAction } from './use-shot-state-machine';

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
  /**
   * Which stroke went OB / was lost. 'entered' replays from where the last
   * entered shot was hit; 'here' (a stroke not yet on the card — see
   * buildErrantStroke) replays from the current position. Water / unplayable
   * ignore this: the player plays on from the drop either way.
   */
  origin: PenaltyOrigin = 'entered',
  /** Shot number for the row; defaults to the current shot. Passed when an
   *  errant stroke is being written just ahead of this row. */
  shotNumber: number = state.currentShot,
): ShotRecord {
  const offending = [...state.shotHistory].reverse().find(s => !s.isPenalty) ?? null;
  const strokeAndDistance =
    STROKE_AND_DISTANCE_PENALTIES.has(penaltyType) && origin === 'entered' && offending !== null;

  const lieBefore = strokeAndDistance ? offending.lieBefore : state.currentLie;
  const distanceToHoleAfter = strokeAndDistance ? offending.distanceToHoleBefore : state.distanceToHole;
  const distanceUnitAfter = strokeAndDistance ? offending.distanceUnitBefore : state.distanceUnit;

  return {
    shotNumber,
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

/**
 * The stroke that went OB / was lost when the player taps Penalty WITHOUT
 * having entered it (origin 'here'): they were standing at the current
 * position, hit, and the ball is gone. It counts — that is the stroke the
 * scorecard was missing whenever the replay was entered from the wrong spot
 * — so it goes on the card as a real shot from here whose ball ends up back
 * here (stroke and distance), immediately ahead of the penalty row.
 */
export function buildErrantStroke(state: ShotTrackingState, currentHole: RoundHole | undefined): ShotRecord {
  return {
    shotNumber: state.currentShot,
    shotType: getShotTypeFromState(state, currentHole),
    // Mirrors FairwayShotTracking.getClubType: driver only when the player
    // said so on a non-par-3 tee; a lost putt is not a thing.
    clubType: state.currentLie === 'tee' && currentHole?.par !== 3 && state.usedDriver ? 'driver' : 'non_driver',
    lieBefore: state.currentLie,
    distanceToHoleBefore: state.distanceToHole,
    distanceUnitBefore: state.distanceUnit,
    result: 'other',
    distanceToHoleAfter: state.distanceToHole,
    distanceUnitAfter: state.distanceUnit,
    shotDistance: 0,
    isPenalty: false,
  };
}

/**
 * Does the card end in an errant stroke written by `buildErrantStroke` plus
 * its stroke-and-distance penalty? The two rows are ONE gesture (a single
 * Penalty tap), so Undo must lift both — leaving the auto-written "other"
 * stroke behind would strand a shot the player never entered and restore an
 * `other` lie from it. Recognised by shape, since the rows are plain
 * golf_shots and survive a reload: a 0-yard "other" stroke that ends where
 * it began, immediately followed by an OB / lost penalty that replays from
 * that same spot. A player-entered "other" shot carries the distance the
 * ball actually travelled, so it does not match.
 */
export function endsWithErrantStrokePair(shotHistory: readonly ShotRecord[]): boolean {
  const penalty = shotHistory[shotHistory.length - 1];
  const errant = shotHistory[shotHistory.length - 2];
  if (!penalty || !errant) return false;
  if (!penalty.isPenalty || !penalty.penaltyType || !STROKE_AND_DISTANCE_PENALTIES.has(penalty.penaltyType)) {
    return false;
  }
  return (
    !errant.isPenalty &&
    errant.result === 'other' &&
    errant.shotDistance === 0 &&
    errant.distanceToHoleAfter === errant.distanceToHoleBefore &&
    errant.distanceUnitAfter === errant.distanceUnitBefore &&
    penalty.lieBefore === errant.lieBefore &&
    penalty.distanceToHoleAfter === errant.distanceToHoleBefore &&
    penalty.distanceUnitAfter === errant.distanceUnitBefore
  );
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
  currentHole,
  onSaveShot,
}: UsePenaltyHandlerParams) {
  const handleAddPenalty = useCallback(() => {
    dispatch({ type: 'SHOW_PENALTY_MODAL' });
  }, [dispatch]);

  const confirmPenalty = useCallback(() => {
    if (!state.penaltyType) return;
    if (state.shotHistory.some(s => s.result === 'hole')) return;

    const penaltyType = state.penaltyType as PenaltyType;
    // Only stroke-and-distance penalties have an un-entered stroke to write:
    // for water / unplayable the entered shot's finish IS the drop.
    const writesErrantStroke = STROKE_AND_DISTANCE_PENALTIES.has(penaltyType) && state.penaltyOrigin === 'here';
    const errantStroke = writesErrantStroke ? buildErrantStroke(state, currentHole) : undefined;
    const penaltyShot = buildPenaltyShot(
      state,
      penaltyType,
      state.penaltyOrigin,
      errantStroke ? state.currentShot + 1 : state.currentShot,
    );

    dispatch({ type: 'CONFIRM_PENALTY', payload: penaltyShot, errantStroke });
    if (errantStroke) onSaveShot?.(errantStroke);
    onSaveShot?.(penaltyShot);
  }, [state, dispatch, currentHole, onSaveShot]);

  return { handleAddPenalty, confirmPenalty };
}

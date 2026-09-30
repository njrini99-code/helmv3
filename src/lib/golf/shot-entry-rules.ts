import { displayToFeet, displayToYards } from '@/lib/golf/distance-units';
import { deriveScoreAndPutts, validateHoleTotals, validateShot, type RoundEntryIssue, type ValidatableShot } from '@/lib/golf/round-entry-validation';
import type { ApproachMissDirection, PuttMissTag, RoundHole, ShotRecord } from '@/lib/types/golf';

/**
 * The shot entry's rules, as pure functions: which results a shot offers,
 * what still blocks recording it, and whether it is plausible. They mirror
 * the Fairway entry's inline logic (components/fairway/pages/rounds-tracking/
 * FairwayShotEntry.tsx) and `isReadyForNextShot` in useShotTracking, word for
 * word, so every renderer gates a shot the same way. The Fairway entry moves
 * onto these with the engine moves (docs/clubhouse/ROUNDS_PLAN.md, step 4).
 */

export type ShotResult = NonNullable<ShotRecord['result']>;

export interface ShotResultOption {
  value: ShotResult;
  /** A result that is possible but unusual here (an ace, a putt rolled off the green): drawn quieter. */
  rare: boolean;
  /** "not fringe", "ace", "rolled off"; null for none. */
  note: string | null;
}

/** The results a shot offers, in order (the Fairway entry's option sets). */
export function shotResultOptions(p: { isPutting: boolean; isTeeShot: boolean; par: number; currentShot: number }): ShotResultOption[] {
  const firstShotPar3 = p.currentShot === 1 && p.par === 3;
  let values: ShotResult[];
  if (p.isPutting) values = ['hole', 'green', 'rough', 'sand'];
  else if (p.isTeeShot && p.par !== 3) values = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
  else if ((p.isTeeShot && p.par === 3) || firstShotPar3) values = ['green', 'rough', 'sand', 'hole', 'other'];
  else values = ['fairway', 'rough', 'sand', 'green', 'hole', 'other'];
  return values.map((value) => {
    const rareTee = (p.isTeeShot || firstShotPar3) && (value === 'hole' || (value === 'green' && p.par !== 3));
    const rarePutt = p.isPutting && (value === 'rough' || value === 'sand');
    const note =
      value === 'green' && !p.isTeeShot && !p.isPutting ? 'not fringe' : value === 'hole' && (p.isTeeShot || firstShotPar3) ? 'ace' : rarePutt ? 'rolled off' : null;
    return { value, rare: rareTee || rarePutt, note };
  });
}

/** The unit the distance after a shot is entered in: feet on the green, yards elsewhere. Never a free toggle. */
export function lockedAfterUnit(isPutting: boolean, result: ShotResult | null): 'yards' | 'feet' {
  return isPutting || result === 'green' ? 'feet' : 'yards';
}

export interface ShotEntryInput {
  hole: RoundHole;
  currentShot: number;
  shotHistory: ShotRecord[];
  isTeeShot: boolean;
  isPutting: boolean;
  isApproachOrAroundGreen: boolean;
  usedDriver: boolean | null;
  result: ShotResult | null;
  missDirection: string | null;
  approachMissDirection: ApproachMissDirection | null;
  puttMissTags: PuttMissTag[];
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  distanceAfterShot: string;
  distanceAfterUnit: 'yards' | 'feet';
  distancePref: 'yards' | 'meters';
}

/** The plausibility issue for the shot as it will be recorded, once the field gates pass (round-entry-validation). */
export function shotPlausibility(s: ShotEntryInput, ready: boolean): RoundEntryIssue | null {
  if (!ready || !s.result) return null;
  const isMeters = s.distancePref === 'meters';
  let afterValue = 0;
  let afterUnit: 'yards' | 'feet' = 'feet';
  if (s.result !== 'hole') {
    const parsed = parseFloat(s.distanceAfterShot);
    if (!Number.isFinite(parsed)) return null;
    afterUnit = lockedAfterUnit(s.isPutting, s.result);
    afterValue = isMeters ? (afterUnit === 'feet' ? displayToFeet(parsed, 'meters') : displayToYards(parsed, 'meters')) : parsed;
  }
  const pending: ValidatableShot = {
    shotNumber: s.currentShot,
    shotType: s.isTeeShot ? 'tee' : s.isPutting ? 'putting' : 'approach',
    distanceToHoleBefore: s.distanceToHole,
    distanceUnitBefore: s.distanceUnit,
    result: s.result,
    distanceToHoleAfter: afterValue,
    distanceUnitAfter: afterUnit,
    isPenalty: false,
    missDirection: s.missDirection,
    approachMissDirection: s.approachMissDirection,
    puttMissTags: s.puttMissTags,
  };
  const hole = { holeNumber: s.hole.number, par: s.hole.par, yardage: s.hole.yardage };
  const issues = validateShot(pending, hole);
  if (s.result === 'hole') {
    const { score, putts } = deriveScoreAndPutts([...s.shotHistory, pending]);
    issues.push(...validateHoleTotals({ holeNumber: s.hole.number, par: s.hole.par, score, putts }));
  }
  return issues.find((i) => i.severity === 'block') ?? issues[0] ?? null;
}

/**
 * The one requirement still missing, in words, or null when the shot can be
 * recorded. The order mirrors isReadyForNextShot so the hint can never
 * disagree with the disabled button. `plausibility` is the issue from
 * shotPlausibility; `confirmed` is true once the player confirmed a warning.
 */
export function nextShotBlocker(s: ShotEntryInput, ready: boolean, plausibility: RoundEntryIssue | null, confirmed: boolean): string | null {
  if (ready) {
    if (!plausibility || (plausibility.severity !== 'block' && confirmed)) return null;
    return plausibility.severity === 'block' ? plausibility.message : 'Confirm the result above to continue';
  }
  const isMeters = s.distancePref === 'meters';
  if (!s.result) return s.isPutting ? 'Select a putt result' : 'Select a shot result';
  if (s.isTeeShot && s.hole.par !== 3 && s.usedDriver === null) return 'Choose driver or non-driver';
  if (s.isTeeShot && ['rough', 'sand', 'other'].includes(s.result) && !s.missDirection) return 'Choose a miss direction';
  if (s.isApproachOrAroundGreen && !['green', 'hole'].includes(s.result) && !s.approachMissDirection) return 'Choose a miss direction';
  if (s.result !== 'hole') {
    const trimmed = s.distanceAfterShot.trim();
    if (!trimmed) return s.isPutting ? 'Enter the leave distance' : 'Enter the distance remaining';
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return 'Enter a valid distance';
    if (s.result === 'green') {
      const afterInFeet = isMeters ? displayToFeet(parsed, 'meters') : s.distanceAfterUnit === 'feet' ? parsed : parsed * 3;
      if (afterInFeet > 150) return isMeters ? 'Green proximity must be under 46 m' : 'Green proximity must be under 150 ft';
      if (afterInFeet <= 0) return 'Select Hole if you holed out, or enter the actual distance remaining';
    } else {
      const afterInYards = displayToYards(parsed, s.distancePref);
      if (afterInYards > 1000) return 'Distance remaining must be 1000 yards or less';
      if (afterInYards <= 0) return 'Select Hole if you holed out, or enter the actual distance remaining';
    }
  }
  return 'Complete the required fields above';
}

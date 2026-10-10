import type { EditFormData } from '@/hooks/golf/use-shot-state-machine';
import { displayToFeet, displayToYards } from '@/lib/golf/distance-units';
import {
  deriveScoreAndPutts,
  validateHoleTotals,
  validateShot,
  validateShotContinuity,
  type RoundEntryIssue,
  type ValidatableShot,
} from '@/lib/golf/round-entry-validation';
import type { ApproachMissDirection, PuttMissTag, RoundHole, ShotRecord } from '@/lib/types/golf';
import { calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';

/**
 * The shot entry's rules, as pure functions: which results a shot offers,
 * what still blocks recording it, and whether it is plausible. They mirror
 * the Fairway entry's inline logic (components/fairway/pages/rounds-tracking/
 * FairwayShotEntry.tsx, PuttMissTagSelector, FairwayEditShotModal) and
 * `isReadyForNextShot` in useShotTracking, so every renderer gates a shot the
 * same way. The Fairway entry moves onto these with the engine moves
 * (docs/clubhouse/ROUNDS_PLAN.md, step 4). `editedShotIssues` already lives
 * here; the Fairway edit modal re-exports it.
 */

export type ShotResult = NonNullable<ShotRecord['result']>;

export interface ShotResultOption {
  value: ShotResult;
  /** A result that is possible but unusual here (an ace, a putt rolled off the green): drawn quieter. */
  rare: boolean;
  /** "not fringe", "ace", "rolled off"; null for none. */
  note: string | null;
}

/** The results a shot offers, in order (the Fairway entry's option sets). Its "(ace!)" is "ace" here: Clubhouse copy has no exclamation marks. */
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
 * recorded. It checks the same conditions as isReadyForNextShot (in the
 * Fairway entry's order: miss direction before distance), so the hint can
 * never disagree with the disabled button. `plausibility` is the issue from
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

/**
 * The key a confirmed plausibility warning is held under (Fairway's
 * confirmedIssueKey): changing the hole, the shot, the rule, the result or the
 * distance re-arms the confirm, so one confirm never carries to another shot.
 */
export function plausibilityKey(holeNumber: number, currentShot: number, issue: RoundEntryIssue | null, result: string | null, distanceAfterShot: string): string | null {
  return issue ? `${holeNumber}:${currentShot}:${issue.rule}:${result}:${distanceAfterShot}` : null;
}

/** Toggling a putt miss tag (PuttMissTagSelector): low and high (the read), short and long (the speed) exclude each other. */
export function togglePuttMissTag(selected: readonly PuttMissTag[], tag: PuttMissTag): PuttMissTag[] {
  if (selected.includes(tag)) return selected.filter((t) => t !== tag);
  const other: Record<PuttMissTag, PuttMissTag> = { low: 'high', high: 'low', short: 'long', long: 'short' };
  return [...selected.filter((t) => t !== other[tag]), tag];
}

/**
 * What choosing a result in the edit sheet changes (FairwayEditShotModal's
 * derivation block): the unit after is fixed by context (green or holed in
 * feet, else yards, a putt that rolled off stays in feet), an approach's miss
 * lie follows the result, and a green or holed result clears the miss data.
 */
export function editResultUpdates(result: ShotResult, shotType: ShotRecord['shotType']): Partial<EditFormData> {
  const updates: Partial<EditFormData> = { result };
  if (result === 'green') {
    updates.distanceUnitAfter = 'feet';
  } else if (result === 'hole') {
    updates.distanceToHoleAfter = '0';
    updates.distanceUnitAfter = 'feet';
  } else {
    updates.distanceUnitAfter = shotType === 'putting' ? 'feet' : 'yards';
  }
  if (shotType === 'approach' || shotType === 'around_green') {
    if (result === 'rough' || result === 'other') updates.approachMissLieType = 'rough';
    else if (result === 'sand') updates.approachMissLieType = 'bunker';
    else if (result === 'fairway') updates.approachMissLieType = 'fairway';
    else updates.approachMissLieType = undefined;
  }
  if (result === 'green' || result === 'hole') {
    updates.missDirection = null;
    updates.approachMissDirection = null;
    updates.approachMissLieType = undefined;
    updates.puttMissTags = [];
  }
  return updates;
}

/** The hole an edited shot belongs to — what the shared shot rules judge against. */
export interface EditShotHoleContext {
  holeNumber: number;
  par: number;
  yardage?: number | null;
}

/**
 * RE-S5: the edit modal saved whatever was typed — a negative distance, or a
 * shot that left the ball further away — with no check at all, while the live
 * entry panel ran the shared rules on the same shot. Run those rules here too:
 * malformed or negative distances block; the shared `confirm` rules (further
 * away than before, a shot that doesn't start where the last one finished, a
 * 400+ yd drive onto the green) ask once; the shared `block` rules block.
 */
export function editedShotIssues(
  form: EditFormData,
  shot: ShotRecord,
  hole?: EditShotHoleContext,
  shotHistory?: readonly ShotRecord[],
): RoundEntryIssue[] {
  if (form.isPenalty || shot.isPenalty) return [];
  const blockMsg = (message: string): RoundEntryIssue => ({
    rule: 'distance_not_decreasing',
    severity: 'block',
    message,
    holeNumber: hole?.holeNumber,
    shotNumber: shot.shotNumber,
  });
  const before = Number.parseFloat(form.distanceToHoleBefore);
  if (form.distanceToHoleBefore.trim() === '' || !Number.isFinite(before)) {
    return [blockMsg('Enter the distance to the hole before this shot.')];
  }
  if (before < 0) return [blockMsg("The distance before the shot can't be negative.")];
  const holed = form.result === 'hole';
  const after = holed ? 0 : Number.parseFloat(form.distanceToHoleAfter);
  if (!holed && (form.distanceToHoleAfter.trim() === '' || !Number.isFinite(after))) {
    return [blockMsg('Enter the distance to the hole after this shot.')];
  }
  if (after < 0) return [blockMsg("The distance after the shot can't be negative.")];
  if (!hole) return [];

  const candidate: ValidatableShot = {
    shotNumber: shot.shotNumber,
    shotType: shot.shotType,
    distanceToHoleBefore: before,
    distanceUnitBefore: form.distanceUnitBefore,
    result: form.result,
    distanceToHoleAfter: after,
    distanceUnitAfter: form.distanceUnitAfter,
    isPenalty: form.isPenalty,
    lieBefore: form.lieBefore,
    missDirection: form.missDirection,
    approachMissDirection: form.approachMissDirection,
    puttMissTags: form.puttMissTags,
  };
  const issues = validateShot(candidate, hole);
  if (shotHistory && shotHistory.length > 1) {
    const chain = shotHistory.map((s) => (s.shotNumber === shot.shotNumber ? candidate : (s as ValidatableShot)));
    issues.push(
      ...validateShotContinuity(chain, hole).filter(
        (i) => i.shotNumber === shot.shotNumber || i.shotNumber === shot.shotNumber + 1,
      ),
    );
  }
  return issues;
}

// ── Tap in ──────────────────────────────────────────────────────────────────
//
// A tap in is a real stroke. In stroke play every ball is holed out (Rules of
// Golf 3.3c) and a concession exists only in match play (3.2b), where the
// conceded stroke still counts in the score. So a tap in is written exactly as
// a holed putt: `result: 'hole'` on a putting shot, which the writers turn
// into `putt_made = true` (derivePuttMade) and strokes gained reads in its
// 0 to 3 ft bucket. Nothing marks it apart from that.

/** The leave a tap in is written at when the putt on screen did not finish there (feet, the stored putting unit). */
export const TAP_IN_LEAVE_FEET = 1;
/** Within this the ball already is a tap in: one holed putt from where it lies. */
export const TAP_IN_RANGE_FEET = 2;

export interface TapInInput {
  hole: RoundHole;
  currentShot: number;
  shotHistory: readonly ShotRecord[];
  currentLie: ShotRecord['lieBefore'];
  isPutting: boolean;
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  /** The result picked on screen; a tap in is offered only before one is. */
  resultOfShot: ShotRecord['result'] | null;
  distanceAfterShot: string;
  puttBreak: ShotRecord['puttBreak'] | null;
  puttSlope: ShotRecord['puttSlope'] | null;
  /** Miss tags picked on screen; a tap in is not offered over them, so a tag the player chose is never dropped. */
  puttMissTags?: readonly string[];
}

export interface TapInPlan {
  /** What one tap writes, in order: the holed putt, or the putt on screen left at TAP_IN_LEAVE_FEET and then the holed putt. */
  rows: ShotRecord[];
  /** Where the putt on screen starts, in feet. */
  fromFeet: number;
  /** The hole's score and putts once the rows are written. */
  score: number;
  putts: number;
}

/**
 * What a tap in would write here, or null when it is not offered: not a putt,
 * the hole is already holed, the player already picked a result or typed a
 * leave (their input is never thrown away), or a shot rule blocks the rows
 * (the hole's stroke limit). Every renderer reads this, so the Fairway and
 * Clubhouse screens offer and write the same tap in.
 */
export function planTapIn(s: TapInInput): TapInPlan | null {
  if (!s.isPutting || s.currentLie !== 'green') return null;
  if (s.shotHistory.some((shot) => shot.result === 'hole')) return null;
  if (s.resultOfShot !== null || s.distanceAfterShot.trim() !== '') return null;
  if (s.puttMissTags && s.puttMissTags.length > 0) return null;
  const fromFeet = s.distanceUnit === 'yards' ? s.distanceToHole * 3 : s.distanceToHole;
  if (!Number.isFinite(fromFeet) || fromFeet <= 0) return null;

  const putt = (shotNumber: number, before: number, unitBefore: 'yards' | 'feet', holed: boolean, read: boolean): ShotRecord => {
    const beforeFeet = unitBefore === 'yards' ? before * 3 : before;
    const afterFeet = holed ? 0 : TAP_IN_LEAVE_FEET;
    return {
      shotNumber,
      shotType: 'putting',
      clubType: 'putter',
      lieBefore: 'green',
      distanceToHoleBefore: before,
      distanceUnitBefore: unitBefore,
      result: holed ? 'hole' : 'green',
      distanceToHoleAfter: afterFeet,
      distanceUnitAfter: 'feet',
      // As handleNextShot writes a putt: its length in yards, rounded.
      shotDistance: Math.round(calculateShotDistanceWithDirection(beforeFeet / 3, afterFeet / 3, undefined)),
      puttBreak: read ? (s.puttBreak ?? undefined) : undefined,
      puttSlope: read ? (s.puttSlope ?? undefined) : undefined,
      isPenalty: false,
      puttDistanceFeet: beforeFeet,
    };
  };

  const rows: ShotRecord[] =
    fromFeet <= TAP_IN_RANGE_FEET
      ? [putt(s.currentShot, s.distanceToHole, s.distanceUnit, true, true)]
      : [putt(s.currentShot, s.distanceToHole, s.distanceUnit, false, true), putt(s.currentShot + 1, TAP_IN_LEAVE_FEET, 'feet', true, false)];

  const hole = { holeNumber: s.hole.number, par: s.hole.par, yardage: s.hole.yardage };
  const after = [...s.shotHistory, ...rows];
  const { score, putts } = deriveScoreAndPutts(after);
  const issues = [
    ...rows.flatMap((row) => validateShot(row, hole)),
    ...validateShotContinuity(after, hole),
    ...validateHoleTotals({ holeNumber: s.hole.number, par: s.hole.par, score, putts }),
  ];
  if (issues.some((issue) => issue.severity === 'block')) return null;
  return { rows, fromFeet, score, putts };
}

/** A putting length in the player's unit, short enough for a tap in: "2 ft", "0.3 m". Stored feet are never changed. */
export function tapInDistance(feet: number, pref: 'yards' | 'meters'): string {
  if (pref === 'meters') return `${Number((feet * 0.3048).toFixed(1))} m`;
  return `${feet >= 1 ? Math.round(feet) : Number(feet.toFixed(1))} ft`;
}

/**
 * The words beside the tap in, naming every stroke it writes and the score it
 * leaves, so a putt that was actually holed is never tapped in without the
 * score saying so. `caption` is shown; `label` is the button's accessible name.
 */
export function tapInWords(plan: TapInPlan, pref: 'yards' | 'meters'): { caption: string; label: string } {
  const from = tapInDistance(plan.fromFeet, pref);
  if (plan.rows.length === 1) {
    return { caption: `Holed from ${from} · score ${plan.score}`, label: `Tap in: holed from ${from}, score ${plan.score}` };
  }
  const leave = tapInDistance(TAP_IN_LEAVE_FEET, pref);
  return {
    caption: `Two putts: leaves ${leave}, then holed · score ${plan.score}`,
    label: `Tap in: the putt from ${from} leaves ${leave}, then holed. Two putts, score ${plan.score}`,
  };
}

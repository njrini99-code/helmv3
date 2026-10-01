import { feetToDisplay, feetLabel, yardsLabel, yardsToDisplay, type DistancePreference } from '@/lib/golf/distance-units';
import type { ApproachMissDirection, PuttMissTag, RoundHole, ShotRecord } from '@/lib/types/golf';
import { formatToPar } from '../../../lib/format';

/**
 * The words the shot screen uses, as pure functions (tested on their own).
 * Distances are stored in yards or feet and shown in the player's unit
 * (yards, with feet on the green; or meters throughout).
 */

export type ChShotResult = Exclude<ShotRecord['result'], 'penalty'>;

/** A result, as the picker and the log name it. */
export const RESULT_LABEL: Record<ShotRecord['result'], string> = {
  fairway: 'Fairway',
  rough: 'Rough',
  sand: 'Sand',
  green: 'Green',
  hole: 'Holed',
  other: 'Other',
  penalty: 'Penalty',
};

export const BREAK_OPTIONS: Array<[NonNullable<ShotRecord['puttBreak']>, string]> = [
  ['left_to_right', 'L → R'],
  ['straight', 'Straight'],
  ['right_to_left', 'R → L'],
  ['multiple', 'Mult.'],
];
export const SLOPE_OPTIONS: Array<[NonNullable<ShotRecord['puttSlope']>, string]> = [
  ['uphill', 'Uphill'],
  ['level', 'Level'],
  ['downhill', 'Down'],
  ['severe', 'Severe'],
];
const BREAK_WORDS: Record<NonNullable<ShotRecord['puttBreak']>, string> = {
  left_to_right: 'L → R',
  right_to_left: 'R → L',
  straight: 'straight',
  multiple: 'multiple breaks',
};

/** The engine's four putt tags (the board drew eight; the data has these, Q-72). */
export const PUTT_TAGS: Array<[PuttMissTag, string]> = [
  ['short', 'Short'],
  ['long', 'Long'],
  ['low', 'Low side'],
  ['high', 'High side'],
];

/** The approach miss grid, read from behind the green: row by row, the green in the middle. */
export const APPROACH_GRID: Array<[ApproachMissDirection | null, string]> = [
  ['long_left', 'Long left'],
  ['long', 'Long'],
  ['long_right', 'Long right'],
  ['left', 'Left'],
  [null, 'The green'],
  ['right', 'Right'],
  ['short_left', 'Short left'],
  ['short', 'Short'],
  ['short_right', 'Short right'],
];

export const PENALTY_OPTIONS: Array<[NonNullable<ShotRecord['penaltyType']>, string, string]> = [
  ['ob', 'Out of bounds', 'Stroke and distance: +1, and you play again from where that shot was hit.'],
  ['water', 'Water hazard', '+1 stroke. Play on from where you said the ball finished.'],
  ['unplayable', 'Unplayable lie', '+1 stroke. Play on from where you said the ball finished.'],
  ['lost', 'Lost ball', 'Stroke and distance: +1, and you play again from where that shot was hit.'],
];
export const PENALTY_LABEL: Record<NonNullable<ShotRecord['penaltyType']>, string> = {
  ob: 'Out of bounds',
  water: 'Water hazard',
  unplayable: 'Unplayable lie',
  lost: 'Lost ball',
};

/** "150 yds", "12 ft", or "137 m" in meters. */
export function distanceText(value: number, unit: 'yards' | 'feet', pref: DistancePreference): string {
  return unit === 'feet' ? `${feetToDisplay(value, pref)} ${feetLabel(pref)}` : `${yardsToDisplay(value, pref)} ${yardsLabel(pref)}`;
}

/** The big number in the hole hero and the words under it. */
export function heroDistance(value: number, unit: 'yards' | 'feet', pref: DistancePreference): { figure: number; words: string } {
  if (unit === 'feet') return { figure: feetToDisplay(value, pref), words: pref === 'meters' ? 'meters to the hole' : 'feet to the hole' };
  return { figure: yardsToDisplay(value, pref), words: pref === 'meters' ? 'meters to the pin' : 'yards to the pin' };
}

/** What the next shot is: "Tee shot", "Approach", "Around the green" or "Putt". */
export function shotKind(shotType: ShotRecord['shotType']): string {
  switch (shotType) {
    case 'tee':
      return 'Tee shot';
    case 'putting':
      return 'Putt';
    case 'around_green':
      return 'Around the green';
    case 'penalty':
      return 'Penalty';
    default:
      return 'Approach';
  }
}

/** A recorded shot's title: "Tee · Driver", "Approach", "Putt", "Penalty · Water hazard". */
export function shotTitle(shot: ShotRecord): string {
  if (shot.isPenalty) return shot.penaltyType ? `Penalty · ${PENALTY_LABEL[shot.penaltyType]}` : 'Penalty';
  if (shot.shotType === 'tee') return shot.clubType === 'driver' ? 'Tee · Driver' : 'Tee';
  return shotKind(shot.shotType).replace('Tee shot', 'Tee');
}

/** A recorded shot's line: "395 yds → fairway · 150 yds", "12 ft → holed · L → R, uphill", "+1 stroke". */
export function shotLine(shot: ShotRecord, pref: DistancePreference): string {
  if (shot.isPenalty) return '+1 stroke';
  const from = distanceText(shot.distanceToHoleBefore, shot.distanceUnitBefore, pref);
  const to = shot.result === 'hole' ? 'holed' : `${RESULT_LABEL[shot.result].toLowerCase()} · ${distanceText(shot.distanceToHoleAfter, shot.distanceUnitAfter, pref)}`;
  const read = [shot.puttBreak && BREAK_WORDS[shot.puttBreak], shot.puttSlope].filter(Boolean).join(', ');
  return `${from} → ${to}${read ? ` · ${read}` : ''}`;
}

/** The round so far, from the holes with a score: "Thru 3", its score to par (null before the first hole). */
export function roundSoFar(holes: RoundHole[]): { thru: number; strokes: number; toPar: number | null } {
  const done = holes.filter((h) => h.score != null);
  const strokes = done.reduce((s, h) => s + (h.score ?? 0), 0);
  const par = done.reduce((s, h) => s + h.par, 0);
  return { thru: done.length, strokes, toPar: done.length ? strokes - par : null };
}

/** A hole's score in words: "Birdie", "Par", "Double bogey", else "+4" / "−3". */
export function scoreName(score: number, par: number): string {
  const d = score - par;
  if (score === 1) return 'Hole in one';
  const names: Record<number, string> = { [-3]: 'Albatross', [-2]: 'Eagle', [-1]: 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' };
  return names[d] ?? formatToPar(d);
}

/**
 * The quick picks under the distance box. Putts and on-green proximity use the
 * Fairway entry's values (feet, or meters); off the green the board's yard
 * picks, and their nearest round meters in meters.
 */
export function quickPicks(context: 'feet' | 'tee' | 'approach', pref: DistancePreference): number[] {
  if (context === 'feet') return pref === 'meters' ? [1, 2, 3, 5, 9, 12] : [5, 10, 15, 20, 30, 40];
  if (context === 'tee') return pref === 'meters' ? [110, 130, 145, 165] : [120, 140, 160, 180];
  return pref === 'meters' ? [10, 20, 35, 75] : [10, 20, 40, 80];
}

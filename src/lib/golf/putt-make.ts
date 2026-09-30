/**
 * The ONE putt make % definition (owner decision Q-93, 2026-09-30), used by the
 * stats calculator (`golf-stats-calculator-shots.ts`), the leak map
 * (`leak-map-buckets.ts`), the player shot analytics and Clubhouse alike.
 *
 *   - Start distance: `golf_shots.distance_to_hole_before`, in FEET, clamped to
 *     0..{@link MAX_PUTT_FEET}. A putt is on the green by definition, so the
 *     value is never unit-converted (a 'yards' tag on a putt is a mis-store,
 *     not a conversion request; SG-2). `putt_distance_feet` is not read.
 *   - Made: `result === 'hole'` OR `putt_made === true`. A null `putt_made` on a
 *     holed putt is a make; a null `putt_made` with no holed result is a miss.
 *   - A putt without a start distance is not banded (never treated as 0 ft).
 *   - Bands are cut (lo, hi], upper-inclusive: "3-5 ft" is 3 < ft <= 5, so a
 *     5-footer is in 3-5 and a 3-footer in 0-3.
 *   - Rounds: real (`is_test = false`) and countable (`isCountableRound`) only;
 *     that filter belongs to the caller that picks the rounds.
 *
 * Same rule as the SQL cache writer `update_player_putt_make_pct`
 * (`LEAST(GREATEST(distance_to_hole_before, 0), 120)`, `result = 'hole' OR
 * putt_made IS TRUE`, `feet > lo AND feet <= hi`). That function still reads
 * test rounds until held migration 20260928120000 is applied; Standing reads it.
 *
 * Pure leaf module: imports nothing, so the calculator, the leak map and the
 * server actions can all depend on it without a cycle.
 */

/**
 * Longest realistic putt, in feet. Anything beyond this is a unit/entry error
 * (e.g. a putt distance recorded in yards then ×3'd to a 390-foot "putt").
 */
export const MAX_PUTT_FEET = 120;

/**
 * Putt distances are ALWAYS feet, regardless of the stored `distance_unit`.
 *
 * SG-2: putts mis-stored with `distance_unit === 'yards'` were being ×3'd by
 * `normalizeToFeet`, producing impossible 390-foot putts. A putt is on the green
 * by definition, so the raw value is the distance in feet — never convert it.
 * We additionally clamp to {@link MAX_PUTT_FEET} so a stray yards-as-feet tail
 * (or a fat-fingered entry) can't poison putting SG or a make % band.
 *
 * A missing value reads 0 here (callers that band a putt must check for a
 * missing distance first: {@link puttMakeStartFeet} does).
 */
export function normalizePuttFeet(distance: number | null | undefined): number {
  if (distance == null) return 0;
  return Math.min(Math.max(distance, 0), MAX_PUTT_FEET);
}

/** The fine make % bands, low to high. Each is (lo, hi]; the first starts at 0. */
export const PUTT_MAKE_BANDS = [
  { id: '0_3', lo: 0, hi: 3 },
  { id: '3_5', lo: 3, hi: 5 },
  { id: '5_10', lo: 5, hi: 10 },
  { id: '10_15', lo: 10, hi: 15 },
  { id: '15_20', lo: 15, hi: 20 },
  { id: '20_25', lo: 20, hi: 25 },
  { id: '25_30', lo: 25, hi: 30 },
  { id: '30_35', lo: 30, hi: 35 },
  { id: '35_plus', lo: 35, hi: null },
] as const;

export type PuttMakeBandId = (typeof PUTT_MAKE_BANDS)[number]['id'];

/**
 * The six reporting bands (leak map, cache writer columns, Tour references) are
 * unions of the fine bands above, so they share every edge. 15-20 and 20-25 make
 * up "15-25 ft"; 25-30, 30-35 and 35+ make up "25+ ft".
 */
export const PUTT_REPORT_BAND_OF = {
  '0_3': '0_3',
  '3_5': '3_5',
  '5_10': '5_10',
  '10_15': '10_15',
  '15_20': '15_25',
  '20_25': '15_25',
  '25_30': '25_plus',
  '30_35': '25_plus',
  '35_plus': '25_plus',
} as const satisfies Record<PuttMakeBandId, string>;

export type PuttReportBandId = (typeof PUTT_REPORT_BAND_OF)[PuttMakeBandId];

/** The fine band a start distance (feet) falls in; (lo, hi], upper-inclusive. */
export function puttMakeBandFor(feet: number): PuttMakeBandId {
  for (const band of PUTT_MAKE_BANDS) {
    if (band.hi === null || feet <= band.hi) return band.id;
  }
  return '35_plus';
}

/** The fields of a putting shot row the make % reads. */
export interface PuttMakeInput {
  distance_to_hole_before?: number | null;
  result?: string | null;
  putt_made?: boolean | null;
}

/**
 * The putt's start distance in feet for the make %, or null when the row has no
 * usable `distance_to_hole_before` (missing, NaN or infinite). Never 0 for a
 * missing value: an unmeasured putt must not land in the 0-3 ft band.
 */
export function puttMakeStartFeet(putt: PuttMakeInput): number | null {
  const raw = putt.distance_to_hole_before;
  if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return normalizePuttFeet(raw);
}

/** Holed: `result === 'hole'` OR `putt_made === true`. */
export function isPuttMade(putt: PuttMakeInput): boolean {
  return putt.result === 'hole' || putt.putt_made === true;
}

/** One banded putt: its fine band, start distance and whether it was holed. */
export interface BandedPutt {
  band: PuttMakeBandId;
  feet: number;
  made: boolean;
}

/** Band a putt, or null when it has no start distance. */
export function bandedPutt(putt: PuttMakeInput): BandedPutt | null {
  const feet = puttMakeStartFeet(putt);
  if (feet === null) return null;
  return { band: puttMakeBandFor(feet), feet, made: isPuttMade(putt) };
}

export type PuttMakeTally = Partial<Record<PuttMakeBandId, { made: number; total: number }>>;

/** made / total per fine band over a set of putting shot rows. */
export function tallyPuttMakes(putts: Iterable<PuttMakeInput>): PuttMakeTally {
  const tally: PuttMakeTally = {};
  for (const putt of putts) {
    const banded = bandedPutt(putt);
    if (!banded) continue;
    const cell = (tally[banded.band] ??= { made: 0, total: 0 });
    cell.total++;
    if (banded.made) cell.made++;
  }
  return tally;
}

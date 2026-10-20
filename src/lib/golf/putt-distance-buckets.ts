/**
 * One putt-distance field and one set of bucket edges for every putting
 * readout on the round review page (CoachHelm deep audit row 42).
 *
 * Before this module the page bucketed the same putts twice:
 *   - PuttHeatmap: 0-3/3-5/5-10/10-15/15-25/25+ ft from
 *     `golf_shots.distance_to_hole_before`;
 *   - puttingBreakdown (round-review-content.ts): 0-5/5-15/15-25/25+ ft from
 *     `golf_shots.putt_distance_feet`.
 * Two panels on one page could not be compared bucket for bucket.
 *
 * Field choice: `distance_to_hole_before` (with `distance_unit_before`). It is
 * the field every shot row carries (non-null on all 21,159 prod putting rows,
 * 2026-09-28), it is what the heatmap, the hole shot path and the putt-bias
 * generator already read, and it disagrees with `putt_distance_feet` by more
 * than 1 ft on only 7 of 11,430 active-round putts (audit row 42). A 'yards'
 * unit tag is converted (4 prod rows); anything else is feet, the putting
 * default.
 *
 * Edges: the heatmap's six. They keep the short-putt split (inside 3 ft vs
 * 3-5 ft) that the four-bucket view hid, and every old four-bucket edge
 * except 5-15 is still an edge.
 *
 * Pure: no React, no Supabase.
 */

export const PUTT_DISTANCE_BUCKETS = [
  { id: '0_3', label: 'Inside 3 ft', short: '0–3', min: 0, max: 3 },
  { id: '3_5', label: '3–5 ft', short: '3–5', min: 3, max: 5 },
  { id: '5_10', label: '5–10 ft', short: '5–10', min: 5, max: 10 },
  { id: '10_15', label: '10–15 ft', short: '10–15', min: 10, max: 15 },
  { id: '15_25', label: '15–25 ft', short: '15–25', min: 15, max: 25 },
  { id: '25_plus', label: '25 ft+', short: '25+', min: 25, max: Infinity },
] as const;

export type PuttDistanceBucket = (typeof PUTT_DISTANCE_BUCKETS)[number];
export type PuttDistanceBucketId = PuttDistanceBucket['id'];

/** The bucket a start distance (feet) falls in. Edges are left-inclusive. */
export function puttBucketFor(feet: number): PuttDistanceBucket {
  for (const b of PUTT_DISTANCE_BUCKETS) {
    if (feet >= b.min && feet < b.max) return b;
  }
  return PUTT_DISTANCE_BUCKETS[PUTT_DISTANCE_BUCKETS.length - 1]!;
}

/**
 * A putt's start distance in feet, from `distance_to_hole_before` and
 * `distance_unit_before`. Accepts the string form some loaders type the
 * numeric column as. Null when there is no usable, non-negative distance.
 */
export function puttStartFeet(
  distance: number | string | null | undefined,
  unit: string | null | undefined,
): number | null {
  if (distance === null || distance === undefined) return null;
  const n = typeof distance === 'number' ? distance : parseFloat(distance);
  if (!Number.isFinite(n) || n < 0) return null;
  return unit === 'yards' ? n * 3 : n;
}

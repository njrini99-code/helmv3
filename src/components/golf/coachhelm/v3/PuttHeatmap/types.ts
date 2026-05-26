/**
 * PuttHeatmap — public types.
 *
 * One putt record per row. The component aggregates these into
 * distance buckets and plots them on a top-down green view.
 *
 * Conventions:
 *   - distance_feet: how far the putt started from the hole (feet)
 *   - made:          did the ball go in (true) or not (false)
 *   - miss_direction: where the ball missed relative to the cup
 *                    (player POV). null = made OR direction unknown.
 *   - shot_number / hole_number / round_id are kept on the input so
 *     a tooltip can cite the source round if needed.
 */

export type PuttMissDirection = 'left' | 'right' | 'long' | 'short' | null;

export interface PuttRecord {
  distance_feet: number;
  made: boolean;
  miss_direction?: PuttMissDirection | string | null;
  hole_number?: number | null;
  round_id?: string | null;
}

export interface PuttHeatmapProps {
  putts: PuttRecord[];
  /** Optional headline override — defaults to "Putting heatmap". */
  title?: string;
  className?: string;
}

/** Distance buckets used by the heatmap. Order = inside-out (3ft is
 *  the inner ring, 25+ is the outer ring). */
export const PUTT_BUCKETS = [
  { id: '0_3', label: 'Inside 3 ft', short: '0–3', min: 0, max: 3 },
  { id: '3_5', label: '3–5 ft', short: '3–5', min: 3, max: 5 },
  { id: '5_10', label: '5–10 ft', short: '5–10', min: 5, max: 10 },
  { id: '10_15', label: '10–15 ft', short: '10–15', min: 10, max: 15 },
  { id: '15_25', label: '15–25 ft', short: '15–25', min: 15, max: 25 },
  { id: '25_plus', label: '25 ft+', short: '25+', min: 25, max: Infinity },
] as const;

export type PuttBucketId = (typeof PUTT_BUCKETS)[number]['id'];

/** Map any free-form direction string to canonical form. */
export function normalizePuttMiss(
  raw: PuttMissDirection | string | null | undefined,
): PuttMissDirection {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s.includes('left')) return 'left';
  if (s.includes('right')) return 'right';
  if (s.includes('long') || s.includes('past')) return 'long';
  if (s.includes('short')) return 'short';
  return null;
}

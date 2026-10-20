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

import { PUTT_DISTANCE_BUCKETS } from '@/lib/golf/putt-distance-buckets';

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
 *  the inner ring, 25+ is the outer ring). The ONE set of putt edges for the
 *  round review page, shared with `puttingBreakdown` (audit row 42) — see
 *  `@/lib/golf/putt-distance-buckets`. */
export const PUTT_BUCKETS = PUTT_DISTANCE_BUCKETS;

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

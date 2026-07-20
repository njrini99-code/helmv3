// ============================================================================
// PIPELINE AGING — pure helpers for stage-age display in PipelineView.
//
// Kept dependency-free (no React, no Supabase) so it can be unit tested in
// isolation and reused by both the per-card aging chip and the per-column
// median-days-in-stage header stat.
// ============================================================================

/** Whole days elapsed between `fromIso` and `toMs` (default: now). Never
 *  negative — a `fromIso` in the future (clock skew, bad data) clamps to 0. */
export function daysBetween(fromIso: string, toMs: number = Date.now()): number {
  const fromMs = new Date(fromIso).getTime();
  if (Number.isNaN(fromMs)) return 0;
  const diffDays = Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export type AgingTier = 'fresh' | 'aging' | 'stale';

/** Bucket a day count into the three aging tiers used for the chip tint:
 *  fresh <14d, aging 14-30d (inclusive), stale >30d. */
export function agingTier(days: number): AgingTier {
  if (days > 30) return 'stale';
  if (days >= 14) return 'aging';
  return 'fresh';
}

/** Median of a list of numbers. Returns 0 for an empty list. Does not
 *  mutate the input array. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}
